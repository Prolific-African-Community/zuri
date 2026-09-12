"use server";

import {
  ArticlePublicationState,
  ArticleReviewStatus,
  ProductionStatus,
} from "@/lib/generated/prisma/enums";
import {
  allowedMergeMethods,
  branchExists,
  createBranch,
  createPullRequest,
  findPullRequest,
  getPullRequest,
  mergePullRequest,
  readFile,
  resolveBase,
  writeBinaryFile,
  writeFile,
  type RepoRef,
} from "@/lib/github";
import { getPrisma } from "@/lib/prisma";
import { publishingConfig } from "@/lib/publishing";
import {
  buildPublishingPackage,
  isWritablePublishPath,
  packageFingerprint,
} from "@/lib/publishing-package";
import { finalizeUnpublish } from "@/app/dashboard/content/unpublish-actions";
import { requireSession } from "@/lib/session";
import { findProductionDeployment, vercelConfigured } from "@/lib/vercel";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";

export type PublishState = { status: "idle" | "done" | "error"; message: string };

/** Short, stable-enough suffix so two articles never share a branch name. */
function shortId(value: string) {
  return value.slice(-6).toLowerCase();
}

async function fetchBytes(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not read the stored image (${response.status}).`);
  }
  return Buffer.from(await response.arrayBuffer());
}

type Prepared = Awaited<ReturnType<typeof prepare>>;

/**
 * Loads the article and re-runs every precondition. The button that triggered
 * the call may have been rendered against a state that no longer holds.
 */
async function prepare(contentAssetId: string) {
  const prisma = getPrisma();
  const asset = await prisma.contentAsset.findUnique({
    where: { id: contentAssetId },
    include: {
      brand: true,
      articleDraft: { include: { imageAssets: { orderBy: { order: "asc" } } } },
    },
  });
  if (!asset?.articleDraft) {
    return { error: "This asset is not an article." };
  }

  const config = publishingConfig(asset.brand);
  if (!config.ok) {
    return { error: `${asset.brand.name} is missing: ${config.missing.join(", ")}.` };
  }
  if (asset.brand.publishingMode !== "GITHUB_PR") {
    return { error: "This brand does not publish through GitHub." };
  }

  const draft = asset.articleDraft;
  const pkg = buildPublishingPackage({
    brand: asset.brand,
    asset,
    draft,
    images: draft.imageAssets,
  });
  if (!pkg.ready || !pkg.article || !pkg.destination) {
    return { error: `Still blocked: ${pkg.errors[0]}` };
  }

  for (const file of pkg.files) {
    if (
      !isWritablePublishPath(
        file.path,
        config.config.contentDirectory,
        config.config.assetsDirectory,
      )
    ) {
      return {
        error: `Refusing to write ${file.path}: it is outside the brand's content and assets directories.`,
      };
    }
  }

  return {
    error: null,
    asset,
    draft,
    config: config.config,
    pkg,
    hash: packageFingerprint(pkg),
    ref: {
      owner: config.config.owner,
      repo: config.config.repo,
      branch: config.config.baseBranch,
    } as RepoRef,
  };
}

/**
 * Writes the package onto a `zuri/` branch and makes sure a pull request
 * exists for it. Nothing is ever committed to the base branch.
 */
async function pushPackage(
  prepared: Prepared & { error: null },
  branchOverride?: string,
) {
  const { ref, config, draft, pkg } = prepared;
  const article = pkg.article!;

  const base = await resolveBase(ref);
  if (config.baseBranch && base.branch !== config.baseBranch) {
    throw new Error(
      `Resolved branch ${base.branch} does not match the configured ${config.baseBranch}.`,
    );
  }

  const branch =
    branchOverride ??
    draft.publishingBranch ??
    `zuri/blog-${article.slug}-${shortId(draft.id)}`;

  // A branch left over from a previous attempt is reused, never duplicated.
  if (!(await branchExists(ref, branch))) {
    await createBranch(ref, branch, base.sha, base.branch);
  }

  for (const file of pkg.files) {
    const current = await readFile(ref, file.path, branch);
    if (file.kind === "MDX") {
      await writeFile(
        ref,
        branch,
        { path: file.path, action: current ? "update" : "create", content: pkg.mdx },
        current?.sha,
        `Publish: ${article.title}`,
      );
    } else if (file.sourceUrl) {
      const bytes = await fetchBytes(file.sourceUrl);
      await writeBinaryFile(
        ref,
        branch,
        file.path,
        bytes,
        current?.sha,
        `Add image for ${article.slug}`,
      );
    }
  }

  const cover = draft.imageAssets.find(
    (image) => image.kind === "COVER" && image.blobUrl,
  );
  const inlineCount = draft.imageAssets.filter(
    (image) => image.kind === "INLINE" && image.blobUrl,
  ).length;

  const body = [
    `**${article.title}**`,
    "",
    "- Slug: `" + article.slug + "`",
    `- Target keyword: ${article.targetKeyword}`,
    `- Cover: ${cover ? "yes" : "no"}`,
    `- Inline images: ${inlineCount}`,
    "",
    "Files:",
    ...pkg.files.map((file) => "- `" + file.path + "`"),
    "",
    `Public URL once merged: ${pkg.destination!.publicUrl}`,
    "",
    "Source: Zuri - Validation: Publishing Contract READY",
  ].join("\n");

  const pr =
    (await findPullRequest(ref, branch)) ??
    (await createPullRequest(
      ref,
      branch,
      base.branch,
      `Publish: ${article.title}`,
      body,
    ));

  return { branch, pr, baseBranch: base.branch };
}

async function persistPr(
  draftId: string,
  contentAssetId: string,
  branch: string,
  pr: { number: number; url: string },
  hash: string,
) {
  await getPrisma().articleDraft.update({
    where: { id: draftId },
    data: {
      reviewStatus: ArticleReviewStatus.PR_OPENED,
      publishingBranch: branch,
      prNumber: pr.number,
      prUrl: pr.url,
      prOpenedAt: new Date(),
      prPackageHash: hash,
      prClosedWithoutMerge: false,
    },
  });

  revalidatePath(`/dashboard/content/${contentAssetId}`);
  revalidatePath("/dashboard/content");
}

export async function createPublishingPr(
  _prevState: PublishState,
  formData: FormData,
): Promise<PublishState> {
  await requireSession();

  const contentAssetId = String(formData.get("contentAssetId") ?? "").trim();
  if (!contentAssetId) return { status: "error", message: "Missing article." };

  const prepared = await prepare(contentAssetId);
  if (prepared.error !== null) return { status: "error", message: prepared.error };

  // Never a second PR for the same article.
  if (prepared.draft.reviewStatus === ArticleReviewStatus.PR_OPENED) {
    return {
      status: "error",
      message: `Pull request #${prepared.draft.prNumber} is already open for this article.`,
    };
  }
  if (prepared.draft.reviewStatus !== ArticleReviewStatus.READY_FOR_REVIEW) {
    return { status: "error", message: "Mark the article ready for review first." };
  }

  try {
    const { branch, pr } = await pushPackage(prepared);
    await persistPr(prepared.draft.id, contentAssetId, branch, pr, prepared.hash);
    return { status: "done", message: `Pull request #${pr.number} opened.` };
  } catch (error) {
    // The article stays READY_FOR_REVIEW so the attempt can be repeated.
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Could not create the PR.",
    };
  }
}

/** Brings an existing pull request back in line with the article as it stands. */
export async function refreshPublishingPr(
  _prevState: PublishState,
  formData: FormData,
): Promise<PublishState> {
  await requireSession();

  const contentAssetId = String(formData.get("contentAssetId") ?? "").trim();
  if (!contentAssetId) return { status: "error", message: "Missing article." };

  const prepared = await prepare(contentAssetId);
  if (prepared.error !== null) return { status: "error", message: prepared.error };
  if (!prepared.draft.prNumber) {
    return { status: "error", message: "There is no pull request to refresh." };
  }

  try {
    const { branch, pr } = await pushPackage(prepared);
    await persistPr(prepared.draft.id, contentAssetId, branch, pr, prepared.hash);
    return {
      status: "done",
      message: `Pull request #${pr.number} now matches the article.`,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Could not refresh the PR.",
    };
  }
}

/* -------------------------------------------------------------------------- */
/* One-click publish                                                          */
/* -------------------------------------------------------------------------- */

export async function publishArticle(
  _prevState: PublishState,
  formData: FormData,
): Promise<PublishState> {
  await requireSession();

  const contentAssetId = String(formData.get("contentAssetId") ?? "").trim();
  if (!contentAssetId) return { status: "error", message: "Missing article." };

  const prepared = await prepare(contentAssetId);
  if (prepared.error !== null) return { status: "error", message: prepared.error };
  const { draft, hash } = prepared;

  // Publication truth is publicationState; reviewStatus only says whether the
  // editorial package is ready to leave. A first publish and a republish go
  // through exactly the same gate, so an unpublished article is never stuck.
  if (draft.publicationState === ArticlePublicationState.PUBLISHED) {
    return { status: "error", message: "This article is already published." };
  }
  if (
    draft.publicationState === ArticlePublicationState.PUBLISHING ||
    draft.publicationState === ArticlePublicationState.UNPUBLISHING
  ) {
    return {
      status: "error",
      message:
        "A publication change is already in flight — check the production status first.",
    };
  }
  if (
    draft.reviewStatus !== ArticleReviewStatus.READY_FOR_REVIEW &&
    draft.reviewStatus !== ArticleReviewStatus.PR_OPENED
  ) {
    return { status: "error", message: "Mark the article ready for review first." };
  }

  // A pull request that no longer matches the article must never be merged.
  if (
    draft.prNumber &&
    draft.reviewStatus === ArticleReviewStatus.PR_OPENED &&
    draft.prPackageHash !== hash
  ) {
    return {
      status: "error",
      message: "Article changed after PR creation - refresh the publishing PR first.",
    };
  }

  // The state before this attempt, restored on every failure so nothing is
  // ever left stuck in PUBLISHING.
  const previous = draft.publicationState;
  const prisma = getPrisma();
  await prisma.articleDraft.update({
    where: { id: draft.id },
    data: { publicationState: ArticlePublicationState.PUBLISHING },
  });

  // A republish never reuses the branch of the publication that was taken down:
  // that branch is already merged, and reusing it would merge nothing.
  const republish = previous === ArticlePublicationState.UNPUBLISHED;
  const branchOverride = republish
    ? `zuri/blog-${prepared.pkg.article!.slug}-republish-${randomUUID().slice(0, 6)}`
    : undefined;

  try {
    const { branch, pr } = await pushPackage(prepared, branchOverride);
    await persistPr(draft.id, contentAssetId, branch, pr, hash);

    const outcome = await mergeAndRecord(
      prepared,
      contentAssetId,
      branch,
      pr,
      "Published.",
    );
    if (outcome.status === "error") await restorePublicationState(draft.id, previous);
    return outcome;
  } catch (error) {
    await restorePublicationState(draft.id, previous);
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Publishing failed.",
    };
  }
}

/** Puts the publication axis back where it was after a failed attempt. */
async function restorePublicationState(
  draftId: string,
  previous: ArticlePublicationState,
) {
  await getPrisma().articleDraft.update({
    where: { id: draftId },
    data: { publicationState: previous },
  });
}

/* -------------------------------------------------------------------------- */
/* Merge detection                                                            */
/* -------------------------------------------------------------------------- */

export async function checkPublishingStatus(
  _prevState: PublishState,
  formData: FormData,
): Promise<PublishState> {
  await requireSession();

  const contentAssetId = String(formData.get("contentAssetId") ?? "").trim();
  if (!contentAssetId) return { status: "error", message: "Missing article." };

  const prisma = getPrisma();
  const asset = await prisma.contentAsset.findUnique({
    where: { id: contentAssetId },
    include: {
      brand: true,
      articleDraft: { include: { imageAssets: { orderBy: { order: "asc" } } } },
    },
  });
  if (!asset?.articleDraft) {
    return { status: "error", message: "This asset is not an article." };
  }

  const draft = asset.articleDraft;
  if (!draft.prNumber) {
    return { status: "error", message: "No pull request to check." };
  }

  const config = publishingConfig(asset.brand);
  if (!config.ok) {
    return {
      status: "error",
      message: `${asset.brand.name} is missing: ${config.missing.join(", ")}.`,
    };
  }

  try {
    const pr = await getPullRequest(
      { owner: config.config.owner, repo: config.config.repo },
      draft.prNumber,
    );

    if (pr.merged) {
      const pkg = buildPublishingPackage({
        brand: asset.brand,
        asset,
        draft,
        images: draft.imageAssets,
      });

      // What went live is what the PR carried, not what the editor holds now.
      const publishedHash = draft.prPackageHash ?? packageFingerprint(pkg);

      await prisma.articleDraft.update({
        where: { id: draft.id },
        data: {
          // Merged, not live: production still has to confirm the deployment.
          publicationState: ArticlePublicationState.PUBLISHING,
          reviewStatus: ArticleReviewStatus.PUBLISHED,
          mergedAt: pr.mergedAt ? new Date(pr.mergedAt) : new Date(),
          publishedUrl: pkg.destination?.publicUrl ?? null,
          publishedPackageHash: publishedHash,
          prClosedWithoutMerge: false,
          mergeCommitSha: pr.mergeCommitSha ?? draft.mergeCommitSha,
          lastPublishMergeCommitSha:
            pr.mergeCommitSha ?? draft.lastPublishMergeCommitSha,
        },
      });

      revalidatePath(`/dashboard/content/${contentAssetId}`);
      revalidatePath("/dashboard/content");
      return {
        status: "done",
        message: "Merged — waiting for the production deployment.",
      };
    }

    // Closed is not merged: a closed PR published nothing.
    if (pr.state === "closed") {
      await prisma.articleDraft.update({
        where: { id: draft.id },
        data: { prClosedWithoutMerge: true },
      });
      revalidatePath(`/dashboard/content/${contentAssetId}`);
      return {
        status: "error",
        message: `Pull request #${pr.number} was closed without being merged.`,
      };
    }

    await prisma.articleDraft.update({
      where: { id: draft.id },
      data: { prClosedWithoutMerge: false },
    });
    revalidatePath(`/dashboard/content/${contentAssetId}`);
    return {
      status: "done",
      message: `Pull request #${pr.number} is still open.`,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Could not read the PR.",
    };
  }
}

/** After a PR was closed without merging, the article goes back for review. */
export async function returnToReview(contentAssetId: string) {
  await requireSession();

  await getPrisma().articleDraft.updateMany({
    where: { contentAssetId },
    data: {
      reviewStatus: ArticleReviewStatus.READY_FOR_REVIEW,
      prClosedWithoutMerge: false,
      publishingBranch: null,
      prNumber: null,
      prUrl: null,
      prOpenedAt: null,
      prPackageHash: null,
    },
  });

  revalidatePath(`/dashboard/content/${contentAssetId}`);
  revalidatePath("/dashboard/content");
}

/**
 * Merges the pull request and, only once GitHub confirms it, records the
 * publication. A refusal leaves the article exactly where it was.
 */
async function mergeAndRecord(
  prepared: Prepared & { error: null },
  contentAssetId: string,
  branch: string,
  pr: { number: number; url: string },
  successMessage: string,
): Promise<PublishState> {
  const { ref, draft, pkg, hash } = prepared;

  const methods = await allowedMergeMethods(ref);
  if (!methods.length) {
    return {
      status: "error",
      message: "The repository allows no merge method. The pull request stays open.",
    };
  }

  let merged = false;
  let lastError = "";
  for (const method of methods) {
    try {
      const result = await mergePullRequest(
        ref,
        pr.number,
        `Publish: ${pkg.article!.title}`,
        method,
      );
      merged = result.merged;
      if (merged) break;
    } catch (error) {
      // A method the repo refuses is followed by the next allowed one; a
      // branch protection refusal simply ends the loop with its message.
      lastError = error instanceof Error ? error.message : "Merge refused.";
    }
  }

  // Published only once GitHub itself says the pull request is merged.
  const confirmed = await getPullRequest(ref, pr.number);
  if (!merged || !confirmed.merged) {
    return {
      status: "error",
      message:
        lastError || `GitHub did not merge #${pr.number}. The pull request stays open.`,
    };
  }

  const mergedAt = confirmed.mergedAt ? new Date(confirmed.mergedAt) : new Date();
  const publishedUrl = pkg.destination!.publicUrl;

  const prisma = getPrisma();
  await prisma.articleDraft.update({
    where: { id: draft.id },
    data: {
      // PUBLISHED is granted by production verification, never by a merge.
      publicationState: ArticlePublicationState.PUBLISHING,
      reviewStatus: ArticleReviewStatus.PUBLISHED,
      publishingBranch: branch,
      prNumber: pr.number,
      prUrl: pr.url,
      prPackageHash: hash,
      mergedAt,
      publishedUrl,
      publishedPackageHash: hash,
      prClosedWithoutMerge: false,
      mergeCommitSha: confirmed.mergeCommitSha,
      // Kept apart from the unpublish commit, which used to overwrite it.
      lastPublishMergeCommitSha: confirmed.mergeCommitSha,
      // The previous removal is over; its branch, PR and commit stay as history.
      unpublishRequestedAt: null,
      unpublishedAt: null,
      unpublishUrlStatus: null,
      // Merged is not live: the site still has to build and deploy.
      productionStatus: ProductionStatus.WAITING_FOR_DEPLOYMENT,
      productionDeploymentUrl: null,
      productionDeployedAt: null,
    },
  });

  // The previous pull request keeps its own row; nothing is rewritten.
  await prisma.articlePublication.create({
    data: {
      articleDraftId: draft.id,
      branch,
      prNumber: pr.number,
      prUrl: pr.url,
      packageHash: hash,
      publishedUrl,
      mergedAt,
    },
  });

  revalidatePath(`/dashboard/content/${contentAssetId}`);
  revalidatePath("/dashboard/content");
  return { status: "done", message: successMessage };
}

/** Republishes an article that changed after it went live. */
export async function publishUpdate(
  _prevState: PublishState,
  formData: FormData,
): Promise<PublishState> {
  await requireSession();

  const contentAssetId = String(formData.get("contentAssetId") ?? "").trim();
  if (!contentAssetId) return { status: "error", message: "Missing article." };

  const prepared = await prepare(contentAssetId);
  if (prepared.error !== null) return { status: "error", message: prepared.error };
  const { draft, pkg, hash } = prepared;

  if (draft.publicationState !== ArticlePublicationState.PUBLISHED) {
    return { status: "error", message: "Only a live article can be updated." };
  }
  if (draft.reviewStatus !== ArticleReviewStatus.NEEDS_UPDATE) {
    return { status: "error", message: "This article has no pending update." };
  }
  // Nothing changed means nothing to publish.
  if (draft.publishedPackageHash && draft.publishedPackageHash === hash) {
    return {
      status: "error",
      message: "The article is identical to the published version.",
    };
  }

  try {
    // A new branch every time: the merged pull request is never rewritten.
    const branch = `zuri/blog-${pkg.article!.slug}-update-${randomUUID().slice(0, 6)}`;
    const { pr } = await pushPackage(prepared, branch);

    const outcome = await mergeAndRecord(
      prepared,
      contentAssetId,
      branch,
      pr,
      "Update published.",
    );
    if (outcome.status === "error") {
      await restorePublicationState(draft.id, ArticlePublicationState.PUBLISHED);
    }
    return outcome;
  } catch (error) {
    // The article stays NEEDS_UPDATE and live so the attempt can be repeated.
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Could not publish the update.",
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Production deployment                                                      */
/* -------------------------------------------------------------------------- */

export async function checkProductionStatus(
  _prevState: PublishState,
  formData: FormData,
): Promise<PublishState> {
  await requireSession();

  const contentAssetId = String(formData.get("contentAssetId") ?? "").trim();
  if (!contentAssetId) return { status: "error", message: "Missing article." };

  const prisma = getPrisma();
  const asset = await prisma.contentAsset.findUnique({
    where: { id: contentAssetId },
    include: { brand: true, articleDraft: true },
  });
  if (!asset?.articleDraft) {
    return { status: "error", message: "This asset is not an article." };
  }

  const draft = asset.articleDraft;

  // Which commit proves what: a publish is verified against the publish merge,
  // a removal against the unpublish merge. They are never interchangeable.
  const unpublishing =
    draft.publicationState === ArticlePublicationState.UNPUBLISHING ||
    (draft.unpublishRequestedAt !== null && draft.unpublishedAt === null);
  const commitSha = unpublishing
    ? (draft.lastUnpublishMergeCommitSha ?? draft.mergeCommitSha)
    : (draft.lastPublishMergeCommitSha ?? draft.mergeCommitSha);
  if (!commitSha) {
    return { status: "error", message: "Nothing has been merged yet." };
  }
  if (!vercelConfigured()) {
    return { status: "error", message: "VERCEL_TOKEN is not set. See .env.example." };
  }

  const projectId = asset.brand.vercelProjectId?.trim();
  if (!projectId) {
    return {
      status: "error",
      message: `No Vercel project is configured for ${asset.brand.name}.`,
    };
  }

  try {
    const deployment = await findProductionDeployment(projectId, commitSha);

    if (!deployment) {
      await prisma.articleDraft.update({
        where: { id: draft.id },
        data: { productionStatus: ProductionStatus.WAITING_FOR_DEPLOYMENT },
      });
      revalidatePath(`/dashboard/content/${contentAssetId}`);
      return {
        status: "done",
        message: "No production deployment for this commit yet.",
      };
    }

    if (deployment.state === "ERROR" || deployment.state === "CANCELED") {
      await prisma.articleDraft.update({
        where: { id: draft.id },
        data: {
          productionStatus: ProductionStatus.DEPLOYMENT_FAILED,
          productionDeploymentUrl: deployment.inspectorUrl ?? deployment.url,
        },
      });
      revalidatePath(`/dashboard/content/${contentAssetId}`);
      return {
        status: "error",
        message:
          deployment.errorMessage ??
          `The production deployment ${deployment.state.toLowerCase()}.`,
      };
    }

    // Live only when Vercel itself says the production build is ready.
    if (deployment.state !== "READY") {
      await prisma.articleDraft.update({
        where: { id: draft.id },
        data: {
          productionStatus: ProductionStatus.WAITING_FOR_DEPLOYMENT,
          productionDeploymentUrl: deployment.inspectorUrl ?? deployment.url,
        },
      });
      revalidatePath(`/dashboard/content/${contentAssetId}`);
      return {
        status: "done",
        message: `Production deployment is ${deployment.state.toLowerCase()}.`,
      };
    }

    const deploymentUrl = deployment.inspectorUrl ?? deployment.url;
    const deployedAt = deployment.readyAt ? new Date(deployment.readyAt) : new Date();

    // A deployment that carries a removal proves the opposite of a publication.
    if (unpublishing) {
      await prisma.articleDraft.update({
        where: { id: draft.id },
        data: {
          productionDeploymentUrl: deploymentUrl,
          productionDeployedAt: deployedAt,
        },
      });
      const outcome = await finalizeUnpublish(contentAssetId);
      revalidatePath(`/dashboard/content/${contentAssetId}`);
      revalidatePath("/dashboard/content");
      return outcome?.gone
        ? {
            status: "done",
            message: `Unpublished — the page now answers ${outcome.urlStatus ?? "nothing"}.`,
          }
        : {
            status: "error",
            message: `The deployment is ready but ${draft.publishedUrl} still answers ${outcome?.urlStatus}. The article stays published in Zuri.`,
          };
    }

    // The deployment being ready is not the article being served: ask the URL.
    const publicUrl = draft.publishedUrl;
    const liveStatus = publicUrl
      ? await fetch(publicUrl, { redirect: "manual" })
          .then((response) => response.status)
          .catch(() => null)
      : null;
    const live = liveStatus !== null && liveStatus >= 200 && liveStatus < 300;

    if (!live) {
      await prisma.articleDraft.update({
        where: { id: draft.id },
        data: {
          productionStatus: ProductionStatus.WAITING_FOR_DEPLOYMENT,
          productionDeploymentUrl: deploymentUrl,
          productionDeployedAt: deployedAt,
        },
      });
      revalidatePath(`/dashboard/content/${contentAssetId}`);
      return {
        status: "error",
        message: publicUrl
          ? `The deployment is ready but ${publicUrl} answers ${liveStatus ?? "nothing"}. Not marked published.`
          : "No public URL to verify. Not marked published.",
      };
    }

    await prisma.articleDraft.update({
      where: { id: draft.id },
      data: {
        publicationState: ArticlePublicationState.PUBLISHED,
        productionStatus: ProductionStatus.LIVE,
        productionDeploymentUrl: deploymentUrl,
        productionDeployedAt: deployedAt,
        publishedUrl: publicUrl,
      },
    });

    revalidatePath(`/dashboard/content/${contentAssetId}`);
    revalidatePath("/dashboard/content");
    return { status: "done", message: "Live in production." };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Could not read Vercel.",
    };
  }
}
