import {
  approveContentAsset,
  archiveContentAsset,
  restoreContentAsset,
  updateContentAsset,
} from "@/app/dashboard/content/actions";
import {
  ScheduleForm,
  dateTime,
  statusTone,
  type ContentRowData,
} from "@/components/content/content-row";
import { ArticleEditor } from "@/components/content/article-editor";
import { DeleteArticle } from "@/components/content/delete-article";
import { MetaCreative } from "@/components/content/meta-creative";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { Field, TextArea } from "@/components/ui/field";
import { Page, Panel, Section } from "@/components/ui/layout";
import { coverPublicPath, inlinePublicPath } from "@/lib/article-images";
import { getPrisma } from "@/lib/prisma";
import { publishingConfig } from "@/lib/publishing";
import {
  buildPublishingPackage,
  packageFingerprint,
} from "@/lib/publishing-package";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ContentAssetPage({
  params,
}: PageProps<"/dashboard/content/[assetId]">) {
  const { assetId } = await params;
  const asset = await getPrisma().contentAsset.findUnique({
    where: { id: assetId },
    include: {
      brand: true,
      opportunity: { select: { id: true, title: true } },
      visualAsset: true,
      metaCreative: true,
      articleDraft: {
        include: {
          imageAssets: { orderBy: { order: "asc" } },
          publications: { orderBy: { mergedAt: "desc" } },
        },
      },
    },
  });
  if (!asset) notFound();

  const archived = asset.archivedAt !== null;
  // Live or mid-flight: the archive shelf is closed until publication settles.
  const livePublication =
    asset.articleDraft?.publicationState === "PUBLISHED" ||
    asset.articleDraft?.publicationState === "PUBLISHING" ||
    asset.articleDraft?.publicationState === "UNPUBLISHING";
  const article = asset.articleDraft;
  const meta = asset.channel === "FACEBOOK" || asset.channel === "INSTAGRAM";
  const creative = asset.metaCreative
    ? {
        hook: asset.metaCreative.hook,
        copy: asset.metaCreative.copy,
        cta: asset.metaCreative.cta,
        visualRecommendation: asset.metaCreative.visualRecommendation,
        imagePrompt: asset.metaCreative.imagePrompt,
        imageUrl: asset.metaCreative.imageUrl,
        productionPrompt: asset.metaCreative.productionPrompt,
        sections: Array.isArray(asset.metaCreative.brief)
          ? (asset.metaCreative.brief as { label: string; body: string }[])
          : [],
      }
    : null;

  const articlePackage = asset.articleDraft
    ? buildPublishingPackage({
        brand: asset.brand,
        asset,
        draft: asset.articleDraft,
        images: asset.articleDraft.imageAssets,
      })
    : null;

  const draftRow = asset.articleDraft;
  const publications = (draftRow?.publications ?? []).map((entry) => ({
    prNumber: entry.prNumber,
    prUrl: entry.prUrl,
    branch: entry.branch,
    mergedAt: entry.mergedAt.toISOString(),
  }));
  const pullRequest =
    draftRow?.prNumber && draftRow.prUrl && articlePackage
      ? {
          number: draftRow.prNumber,
          url: draftRow.prUrl,
          branch: draftRow.publishingBranch ?? "",
          openedAt: draftRow.prOpenedAt?.toISOString() ?? "",
          files: articlePackage.files.map((file) => file.path),
          // The package is re-fingerprinted on every read, so a later edit shows.
          stale:
            !draftRow.prPackageHash ||
            packageFingerprint(articlePackage) !== draftRow.prPackageHash,
          closedWithoutMerge: draftRow.prClosedWithoutMerge,
        }
      : null;

  // Drift is judged on every read, so a published article never quietly lies.
  const publishedOutdated =
    !!draftRow?.publishedPackageHash &&
    !!articlePackage &&
    packageFingerprint(articlePackage) !== draftRow.publishedPackageHash;

  // Only the publication axis decides what the Publish tab shows.
  const publicationState = draftRow?.publicationState ?? "NEVER_PUBLISHED";

  const published =
    draftRow &&
    (publicationState === "PUBLISHED" || publicationState === "PUBLISHING") &&
    draftRow.publishedUrl
      ? {
          url: draftRow.publishedUrl,
          mergedAt: draftRow.mergedAt?.toISOString() ?? "",
          outdated:
            publishedOutdated || draftRow.reviewStatus === "NEEDS_UPDATE",
          production: {
            status: draftRow.productionStatus,
            deploymentUrl: draftRow.productionDeploymentUrl,
            deployedAt: draftRow.productionDeployedAt?.toISOString() ?? null,
          },
        }
      : null;

  // Public paths are derived, never stored twice: the slug is the only source.
  const publishing = publishingConfig(asset.brand);
  const articleImages = asset.articleDraft
    ? asset.articleDraft.imageAssets.map((image) => ({
        id: image.id,
        kind: image.kind,
        order: image.order,
        purpose: image.purpose,
        insertionPoint: image.insertionPoint,
        concept: image.concept,
        alt: image.alt,
        caption: image.caption,
        blobUrl: image.blobUrl,
        targetPath: image.targetPath,
        publicPath: publishing.ok
          ? image.kind === "COVER"
            ? coverPublicPath(publishing.config.publicRoute, asset.articleDraft!.slug)
            : inlinePublicPath(
                publishing.config.publicRoute,
                asset.articleDraft!.slug,
                image.order,
              )
          : "",
      }))
    : [];

  // The amplification post lives beside the article, linked by its opportunity.
  const businessPost = article
    ? await getPrisma().contentAsset.findFirst({
        where: {
          brandId: asset.brandId,
          channel: "GOOGLE_BUSINESS",
          opportunityId: asset.opportunityId,
          archivedAt: null,
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          content: true,
          status: true,
          googleBusinessPostName: true,
          googleBusinessPublishedAt: true,
          googleBusinessError: true,
        },
      })
    : null;

  return (
    <Page width="narrow">
      <Link
        href="/dashboard/content"
        className="type-meta group inline-flex items-center gap-1.5 rounded-md transition-colors hover:text-ink"
      >
        <span
          aria-hidden
          className="transition-transform duration-200 group-hover:-translate-x-0.5"
        >
          ←
        </span>
        Content
      </Link>

      <header className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="type-label">
            {asset.brand.name} · {asset.channel.toLowerCase()} ·{" "}
            {asset.type.toLowerCase().replace("_", " ")}
          </p>
          <h1 className="type-page-title mt-3">
            {asset.title ?? "Untitled draft"}
          </h1>
          <p className="type-meta mt-2">
            Created {dateTime.format(asset.createdAt)}
            {asset.scheduledAt
              ? ` · scheduled ${dateTime.format(asset.scheduledAt)}`
              : ""}
          </p>
        </div>
        <Badge tone={statusTone(asset.status)}>
          {asset.status.toLowerCase()}
        </Badge>
      </header>

      <Section title={article ? "Article" : "Post"} className="mt-12">
        {article ? null : (
          <p className="type-body max-w-2xl whitespace-pre-line text-ink-2">
            {asset.content}
          </p>
        )}

        <div className={article ? "flex flex-wrap items-center gap-3" : "mt-6 flex flex-wrap items-center gap-3"}>
          {asset.status === "APPROVED" ? null : (
            <form action={approveContentAsset.bind(null, asset.id)}>
              <Button type="submit" size="sm">
                Approve
              </Button>
            </form>
          )}
          {archived || !livePublication ? (
            <form
              action={
                archived
                  ? restoreContentAsset.bind(null, asset.id)
                  : archiveContentAsset.bind(null, asset.id)
              }
            >
              <Button type="submit" variant="secondary" size="sm">
                {archived ? "Restore" : "Archive"}
              </Button>
            </form>
          ) : (
            // Taking a live article off the shelf means taking it off the site:
            // that is Unpublish, in the Publish tab, never a quiet archive.
            <p className="type-meta text-ink-3">
              {publicationState === "PUBLISHING"
                ? "Publishing — waiting for the live deployment to be confirmed."
                : publicationState === "UNPUBLISHING"
                  ? "Unpublishing — waiting for the site removal to be confirmed."
                  : "Live — unpublish it in Publish before archiving."}
            </p>
          )}
          {asset.opportunity ? (
            <Link
              href="/dashboard/opportunities"
              className="type-meta rounded-md text-accent-ink transition-colors hover:text-accent-strong"
            >
              Source: {asset.opportunity.title}
            </Link>
          ) : null}
        </div>
      </Section>

      {meta ? (
        <MetaCreative
          assetId={asset.id}
          channel={asset.channel}
          contentType={asset.type}
          draftBody={asset.content}
          creative={creative}
        />
      ) : null}

      {article ? null : (
        <Section title="Schedule">
          <ScheduleForm asset={asset as unknown as ContentRowData} />
        </Section>
      )}

      {/* The social visual engine has no place on an article. */}
      {!article && !meta && asset.visualAsset && asset.visualAsset.type !== "NONE" ? (
        <Section title="Visual">
          <div className="flex flex-wrap items-center gap-2.5">
            <Badge tone="accent">
              {asset.visualAsset.type.toLowerCase().replace("_", " ")}
            </Badge>
            {asset.visualAsset.reason ? (
              <span className="type-meta">{asset.visualAsset.reason}</span>
            ) : null}
          </div>
          {asset.visualAsset.concept ? (
            <p className="type-body mt-2 max-w-2xl text-ink-3">
              {asset.visualAsset.concept}
            </p>
          ) : null}
          {asset.visualAsset.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={asset.visualAsset.imageUrl}
              alt={asset.visualAsset.concept ?? "Generated visual"}
              className="mt-4 w-full max-w-sm rounded-lg border border-line"
            />
          ) : (
            <p className="type-meta mt-3">
              Not rendered yet — generate it from the opportunity.
            </p>
          )}
        </Section>
      ) : null}

      {asset.articleDraft ? (
        <ArticleEditor
          asset={asset}
          draft={asset.articleDraft}
          images={articleImages}
          publishing={articlePackage!}
          reviewStatus={asset.articleDraft.reviewStatus}
          publicationState={publicationState}
          archived={archived}
          pullRequest={pullRequest}
          published={published}
          publications={publications}
          unpublish={{
            requestedAt: draftRow?.unpublishRequestedAt?.toISOString() ?? null,
            unpublishedAt: draftRow?.unpublishedAt?.toISOString() ?? null,
            prNumber: draftRow?.unpublishPrNumber ?? null,
            prUrl: draftRow?.unpublishPrUrl ?? null,
            branch: draftRow?.unpublishBranch ?? null,
            urlStatus: draftRow?.unpublishUrlStatus ?? null,
          }}
          businessPost={
            businessPost
              ? {
                  id: businessPost.id,
                  title: businessPost.title,
                  content: businessPost.content,
                  status: businessPost.status,
                  googlePostName: businessPost.googleBusinessPostName,
                  googlePublishedAt:
                    businessPost.googleBusinessPublishedAt?.toISOString() ?? null,
                  googleError: businessPost.googleBusinessError,
                }
              : null
          }
          businessLocation={asset.brand.googleBusinessLocationName}
          brandId={asset.brandId}
          opportunityId={asset.opportunityId}
          publicUrl={draftRow?.publishedUrl ?? articlePackage?.destination?.publicUrl ?? null}
          bannerUrl={
            articleImages.find((image) => image.kind === "COVER")?.blobUrl ?? null
          }
        />
      ) : null}

      {article ? (
        <DeleteArticle
          assetId={asset.id}
          title={asset.title ?? "this article"}
          reviewStatus={article.reviewStatus}
          published={
            publicationState !== "NEVER_PUBLISHED" || publications.length > 0
          }
        />
      ) : null}

      {article || meta ? null : (
        <Section title="Edit">
          <Disclosure summary="Edit content">
            <Panel className="max-w-2xl">
              <form
                action={updateContentAsset.bind(null, asset.id)}
                className="grid gap-5"
              >
                <Field
                  label="Title"
                  name="title"
                  defaultValue={asset.title ?? ""}
                  hint="optional"
                  autoComplete="off"
                />
                <TextArea
                  label="Content"
                  name="content"
                  required
                  rows={12}
                  defaultValue={asset.content}
                />
                <div className="border-t border-line pt-5">
                  <Button type="submit">Save changes</Button>
                </div>
              </form>
            </Panel>
          </Disclosure>
        </Section>
      )}
    </Page>
  );
}
