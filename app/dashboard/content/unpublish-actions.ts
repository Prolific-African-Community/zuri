"use server";

import { coverTargetPath } from "@/lib/article-images";
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
  deleteFile,
  findPullRequest,
  getPullRequest,
  mergePullRequest,
  readFile,
  resolveBase,
  type RepoRef,
} from "@/lib/github";
import { getPrisma } from "@/lib/prisma";
import { isWritablePublishPath } from "@/lib/publishing-package";
import { publishingConfig } from "@/lib/publishing";
import { requireSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";

export type UnpublishState = { status: "idle" | "done" | "error"; message: string };

function refresh(assetId: string) {
  revalidatePath(`/dashboard/content/${assetId}`);
  revalidatePath("/dashboard/content");
}

/**
 * Takes a published article back off the site. The paths are derived from the
 * brand's publishing config and the article slug — never from the client — and
 * only files that actually exist on the branch are removed.
 */
export async function unpublishArticle(
  _prevState: UnpublishState,
  formData: FormData,
): Promise<UnpublishState> {
  await requireSession();

  const assetId = String(formData.get("assetId") ?? "").trim();
  if (!assetId) return { status: "error", message: "Missing article." };

  const prisma = getPrisma();
  const asset = await prisma.contentAsset.findUnique({
    where: { id: assetId },
    include: { brand: true, articleDraft: { include: { publications: true } } },
  });
  if (!asset?.articleDraft) {
    return { status: "error", message: "This asset is not an article." };
  }

  const draft = asset.articleDraft;

  // Only something that is online right now can be taken off, and that is
  // publicationState's question alone — not the asset status, not reviewStatus.
  if (draft.publicationState === ArticlePublicationState.UNPUBLISHED) {
    return { status: "error", message: "This article is already unpublished." };
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
  if (draft.publicationState !== ArticlePublicationState.PUBLISHED) {
    return { status: "error", message: "This article was never published." };
  }

  const config = publishingConfig(asset.brand);
  if (!config.ok) {
    return {
      status: "error",
      message: `${asset.brand.name} is missing: ${config.missing.join(", ")}.`,
    };
  }
  const { owner, repo, contentDirectory, assetsDirectory, publicRoute, extension } =
    config.config;

  // Derived from the config and the slug: exactly the two files this workflow
  // publishes. Historical inline images are left alone.
  const paths = [
    `${contentDirectory}/${draft.slug}.${extension}`,
    coverTargetPath(assetsDirectory, publicRoute, draft.slug),
  ];
  for (const path of paths) {
    if (!isWritablePublishPath(path, contentDirectory, assetsDirectory)) {
      return {
        status: "error",
        message: `Refusing to touch ${path}: it is outside the brand's directories.`,
      };
    }
  }

  const ref: RepoRef = { owner, repo, branch: config.config.baseBranch };

  // In flight from here on; every failure below puts it back to PUBLISHED.
  await prisma.articleDraft.update({
    where: { id: draft.id },
    data: {
      publicationState: ArticlePublicationState.UNPUBLISHING,
      unpublishRequestedAt: new Date(),
    },
  });

  const restorePublished = () =>
    prisma.articleDraft.update({
      where: { id: draft.id },
      data: {
        publicationState: ArticlePublicationState.PUBLISHED,
        unpublishRequestedAt: null,
      },
    });

  try {
    const base = await resolveBase(ref);
    if (config.config.baseBranch && base.branch !== config.config.baseBranch) {
      await restorePublished();
      return {
        status: "error",
        message: `Resolved branch ${base.branch} does not match the configured ${config.config.baseBranch}.`,
      };
    }

    // A fresh branch every time: the branch of a previous removal is already
    // merged, and reusing it would find nothing left to delete.
    const branch = `zuri/blog-${draft.slug}-unpublish-${randomUUID().slice(0, 6)}`;

    if (!(await branchExists(ref, branch))) {
      await createBranch(ref, branch, base.sha, base.branch);
    }

    const removed: string[] = [];
    for (const path of paths) {
      const current = await readFile(ref, path, branch);
      // A file that is not there needs no deletion, and its absence is not an
      // error: the banner is optional.
      if (!current) continue;
      await deleteFile(
        ref,
        branch,
        path,
        current.sha,
        `Unpublish: ${asset.title ?? draft.slug}`,
      );
      removed.push(path);
    }

    if (!removed.length) {
      await restorePublished();
      return {
        status: "error",
        message: "Nothing to remove: neither file is on the repository.",
      };
    }

    const body = [
      `**${asset.title ?? draft.slug}**`,
      "",
      `- Slug: \`${draft.slug}\``,
      `- Files removed:`,
      ...removed.map((path) => `  - \`${path}\``),
      "",
      draft.publishedUrl ? `Was live at ${draft.publishedUrl}` : "",
      "",
      "Source: Zuri · Action: archive / unpublish",
    ]
      .filter((line) => line !== "")
      .join("\n");

    const pr =
      (await findPullRequest(ref, branch)) ??
      (await createPullRequest(
        ref,
        branch,
        base.branch,
        `Unpublish: ${asset.title ?? draft.slug}`,
        body,
      ));

    const methods = await allowedMergeMethods(ref);
    let merged = false;
    let lastError = "";
    for (const method of methods) {
      try {
        const result = await mergePullRequest(
          ref,
          pr.number,
          `Unpublish: ${asset.title ?? draft.slug}`,
          method,
        );
        merged = result.merged;
        if (merged) break;
      } catch (error) {
        lastError = error instanceof Error ? error.message : "Merge refused.";
      }
    }

    const confirmed = await getPullRequest(ref, pr.number);
    if (!merged || !confirmed.merged) {
      // The article stays published: nothing changed on the site.
      await prisma.articleDraft.update({
        where: { id: draft.id },
        data: {
          publicationState: ArticlePublicationState.PUBLISHED,
          unpublishRequestedAt: null,
          unpublishBranch: branch,
          unpublishPrNumber: pr.number,
          unpublishPrUrl: pr.url,
        },
      });
      refresh(assetId);
      return {
        status: "error",
        message:
          lastError ||
          `GitHub did not merge #${pr.number}. The article is still online.`,
      };
    }

    // Merged is not gone: the site still has to rebuild.
    await prisma.articleDraft.update({
      where: { id: draft.id },
      data: {
        unpublishBranch: branch,
        unpublishPrNumber: pr.number,
        unpublishPrUrl: pr.url,
        mergeCommitSha: confirmed.mergeCommitSha,
        // The publish commit stays where it is; only this one is rewritten.
        lastUnpublishMergeCommitSha: confirmed.mergeCommitSha,
        productionStatus: ProductionStatus.WAITING_FOR_DEPLOYMENT,
        productionDeploymentUrl: null,
        productionDeployedAt: null,
      },
    });

    refresh(assetId);
    return {
      status: "done",
      message: `Removed ${removed.length} file${removed.length === 1 ? "" : "s"} in #${pr.number}. Waiting for the production deployment.`,
    };
  } catch (error) {
    await restorePublished();
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Could not unpublish the article.",
    };
  }
}

/**
 * Called once production has confirmed the removal: reads the public URL and
 * records the article as unpublished only if the page really stopped serving
 * it. Unpublishing never archives — the asset stays in active Content, and
 * `archivedAt` / `ContentAsset.status` are deliberately left untouched.
 */
export async function finalizeUnpublish(assetId: string) {
  const prisma = getPrisma();
  const asset = await prisma.contentAsset.findUnique({
    where: { id: assetId },
    include: { articleDraft: true },
  });
  const draft = asset?.articleDraft;
  if (!draft?.unpublishRequestedAt || draft.unpublishedAt) return null;

  let urlStatus: number | null = null;
  if (draft.publishedUrl) {
    urlStatus = await fetch(draft.publishedUrl, { redirect: "manual" })
      .then((response) => response.status)
      .catch(() => null);
  }

  // Still serving the article means the removal is not effective, whatever
  // GitHub and Vercel reported.
  const gone = urlStatus === null || urlStatus >= 400 || urlStatus === 301 || urlStatus === 302;

  await prisma.articleDraft.update({
    where: { id: draft.id },
    data: {
      unpublishUrlStatus: urlStatus,
      ...(gone
        ? {
            publicationState: ArticlePublicationState.UNPUBLISHED,
            unpublishedAt: new Date(),
            // The package that was live is still valid, so the article comes
            // back ready to be published again; editing it resets this to
            // DRAFT through resetReview, which is the normal path.
            reviewStatus: ArticleReviewStatus.READY_FOR_REVIEW,
            // Nothing is served at that address any more.
            publishedUrl: null,
            productionStatus: ProductionStatus.NOT_DEPLOYED,
            productionDeploymentUrl: null,
            productionDeployedAt: null,
          }
        : {}),
    },
  });

  revalidatePath(`/dashboard/content/${assetId}`);
  revalidatePath("/dashboard/content");
  return { urlStatus, gone };
}
