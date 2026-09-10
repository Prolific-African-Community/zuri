import {
  CheckPublishingStatus,
  CreatePublishingPr,
  CheckProductionStatus,
  MarkReadyForReview,
  PublishArticle,
  PublishUpdate,
  ReturnToReview,
} from "@/components/content/review-controls";
import { MdxPreview } from "@/components/content/mdx-preview";
import { Badge } from "@/components/ui/badge";
import { Disclosure } from "@/components/ui/disclosure";

import type { PublishingPackage } from "@/lib/publishing-package";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="sm:flex sm:gap-6">
      <dt className="type-label shrink-0 sm:w-32 sm:pt-0.5">{label}</dt>
      <dd className="type-body mt-1 break-words text-ink-2 sm:mt-0">
        {value || "—"}
      </dd>
    </div>
  );
}

export type PreviewImage = {
  kind: "COVER" | "INLINE";
  order: number;
  alt: string;
  caption: string | null;
  blobUrl: string | null;
  publicPath: string;
};

export type PullRequestView = {
  number: number;
  url: string;
  branch: string;
  openedAt: string;
  files: string[];
  stale: boolean;
  closedWithoutMerge: boolean;
};

export type PublicationView = {
  prNumber: number;
  prUrl: string;
  branch: string;
  mergedAt: string;
};

export type PublishedView = {
  url: string;
  mergedAt: string;
  outdated: boolean;
  production: {
    status: string;
    deploymentUrl: string | null;
    deployedAt: string | null;
  };
};

export function PublishingPreview({
  contentAssetId,
  pkg,
  images,
  reviewStatus,
  pullRequest,
  published,
  publications,
  title,
  excerpt,
}: {
  contentAssetId: string;
  pkg: PublishingPackage;
  images: PreviewImage[];
  reviewStatus: string;
  pullRequest: PullRequestView | null;
  published: PublishedView | null;
  publications: PublicationView[];
  title: string;
  excerpt: string;
}) {
  const { article, destination } = pkg;
  const cover = images.find((image) => image.kind === "COVER" && image.blobUrl);
  const inline = images
    .filter((image) => image.kind === "INLINE" && image.blobUrl)
    .sort((a, b) => a.order - b.order);

  return (
    <div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Badge tone={pkg.ready ? "accent" : "muted"}>
            {pkg.ready ? "ready" : "blocked"}
          </Badge>
          <Badge
            tone={
              reviewStatus === "DRAFT" || reviewStatus === "NEEDS_UPDATE"
                ? "neutral"
                : "accent"
            }
          >
            {reviewStatus.toLowerCase().replace(/_/g, " ")}
          </Badge>
          <span className="type-meta">
            {pkg.ready
              ? "Every check passes. This package can go to review."
              : `${pkg.errors.length} thing${pkg.errors.length === 1 ? "" : "s"} to fix first.`}
          </span>
        </div>

        {pkg.errors.length ? (
          <ul className="mt-4 max-w-2xl space-y-1.5">
            {pkg.errors.map((error) => (
              <li key={error} className="type-body text-ink-2">
                {error}
              </li>
            ))}
          </ul>
        ) : null}

        {published ? (
          <div className="mt-5 rounded-lg border border-line bg-subtle p-5">
            <div className="flex flex-wrap items-center gap-2.5">
              <Badge tone={published.outdated ? "muted" : "accent"}>
                {published.outdated ? "published version is outdated" : "published"}
              </Badge>
              <Badge
                tone={published.production.status === "LIVE" ? "accent" : "muted"}
              >
                {published.production.status.toLowerCase().replace(/_/g, " ")}
              </Badge>
              {pullRequest ? (
                <a
                  href={pullRequest.url}
                  target="_blank"
                  rel="noreferrer"
                  className="type-meta rounded-md text-accent-ink transition-colors hover:text-accent-strong"
                >
                  Pull request #{pullRequest.number}
                </a>
              ) : null}
            </div>
            <dl className="mt-4 grid gap-2">
              <Row label="Public URL" value={published.url} />
              <Row label="Merged at" value={published.mergedAt} />
              {published.production.deployedAt ? (
                <Row label="Deployed at" value={published.production.deployedAt} />
              ) : null}
            </dl>

            <p className="type-meta mt-3">
              {published.production.status === "LIVE"
                ? "Live in production."
                : published.production.status === "DEPLOYMENT_FAILED"
                  ? "Production deployment failed — the merge is on the branch but the site was not updated."
                  : "Publishing to production… merged, waiting for the production build."}
              {published.production.deploymentUrl ? (
                <>
                  {" "}
                  <a
                    href={published.production.deploymentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md text-accent-ink transition-colors hover:text-accent-strong"
                  >
                    See the deployment
                  </a>
                </>
              ) : null}
            </p>

            <CheckProductionStatus contentAssetId={contentAssetId} />
            <p className="type-meta mt-3">
              <a
                href={published.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-md text-accent-ink transition-colors hover:text-accent-strong"
              >
                Open the live article
              </a>
            </p>
            {published.outdated ? (
              <PublishUpdate contentAssetId={contentAssetId} />
            ) : null}
            {published.outdated ? (
              <p className="type-meta mt-4 text-ink-3">
                The article changed since it went live. The published version is
                still the older one until this update is published.
              </p>
            ) : null}
          </div>
        ) : pullRequest ? (
          <div className="mt-5 rounded-lg border border-line bg-subtle p-5">
            <div className="flex flex-wrap items-center gap-2.5">
              <Badge tone="accent">PR opened</Badge>
              <a
                href={pullRequest.url}
                target="_blank"
                rel="noreferrer"
                className="type-meta rounded-md text-accent-ink transition-colors hover:text-accent-strong"
              >
                Pull request #{pullRequest.number} on GitHub
              </a>
              {pullRequest.closedWithoutMerge ? (
                <Badge tone="muted">closed without merge</Badge>
              ) : null}
              {pullRequest.stale ? <Badge tone="muted">changes after PR</Badge> : null}
            </div>
            <p className="type-meta mt-2">branch {pullRequest.branch}</p>
            <p className="type-label mt-4">Files published in the PR</p>
            <ul className="mt-2 space-y-1">
              {pullRequest.files.map((path) => (
                <li key={path} className="type-meta break-all">
                  {path}
                </li>
              ))}
            </ul>
            {pullRequest.closedWithoutMerge ? (
              <>
                <p className="type-meta mt-4 text-ink-2">
                  PR closed without merge — nothing was published.
                </p>
                <ReturnToReview contentAssetId={contentAssetId} />
              </>
            ) : (
              <>
                <PublishArticle
                  contentAssetId={contentAssetId}
                  ready={pkg.ready}
                  stale={pullRequest.stale}
                />
                <CheckPublishingStatus contentAssetId={contentAssetId} />
              </>
            )}

            <p className="type-meta mt-4 text-ink-3">
              {pullRequest.stale
                ? "The article changed after this PR was opened — the branch no longer matches. Zuri will not silently push a second one."
                : "Nothing was merged or deployed. The branch is waiting for your review."}
            </p>
          </div>
        ) : (
          <>
            <MarkReadyForReview
              contentAssetId={contentAssetId}
              ready={pkg.ready}
              reviewStatus={reviewStatus}
            />
            {reviewStatus === "READY_FOR_REVIEW" ? (
              <>
                <PublishArticle
                  contentAssetId={contentAssetId}
                  ready={pkg.ready}
                  stale={false}
                />
                <CreatePublishingPr
                  contentAssetId={contentAssetId}
                  ready={pkg.ready}
                />
              </>
            ) : null}
          </>
        )}

        {destination ? (
          <div className="mt-6 border-t border-line pt-5">
            <p className="type-label">Destination</p>
            <dl className="mt-3 grid gap-2">
              <Row label="Brand" value={destination.brandName} />
              <Row label="Repository" value={destination.repository} />
              <Row label="Branch" value={destination.branch} />
              <Row label="Content path" value={destination.contentPath} />
              <Row label="Public URL" value={destination.publicUrl} />
            </dl>
          </div>
        ) : null}

        {article ? (
          <>
            <div className="mt-6 border-t border-line pt-5">
              <p className="type-label">Article</p>
              <dl className="mt-3 grid gap-2">
                <Row label="Title" value={article.title} />
                <Row label="Slug" value={article.slug} />
                <Row label="Excerpt" value={article.excerpt} />
                <Row label="Author" value={article.author} />
                <Row label="Published at" value={article.publishedAt.slice(0, 10)} />
                <Row label="Category" value={article.category} />
                <Row label="Tags" value={article.tags.join(", ")} />
                <Row label="Target keyword" value={article.targetKeyword} />
              </dl>
            </div>

            <div className="mt-6 border-t border-line pt-5">
              <p className="type-label">SEO</p>
              <dl className="mt-3 grid gap-2">
                <Row label="Meta title" value={article.metaTitle} />
                <Row label="Meta description" value={article.metaDescription} />
                <Row label="Canonical" value={article.canonicalUrl ?? "none"} />
              </dl>
            </div>
          </>
        ) : null}

        <div className="mt-6 border-t border-line pt-5">
          <p className="type-label">Files to publish</p>
          <ul className="mt-3 space-y-1.5">
            {pkg.files.map((file) => (
              <li key={file.path} className="flex flex-wrap items-baseline gap-x-3">
                <Badge tone="muted">{file.kind.toLowerCase()}</Badge>
                <span className="type-body break-all text-ink-2">{file.path}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6 border-t border-line pt-5">
          <p className="type-label">What goes live</p>
          <div className="mt-4 flex flex-wrap items-start gap-5">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cover.blobUrl!}
                alt={cover.alt}
                className="w-48 rounded-lg border border-line"
              />
            ) : null}
            <div className="min-w-56 flex-1">
              <p className="type-section-title">{title}</p>
              {excerpt ? (
                <p className="type-body mt-2 max-w-xl text-ink-3">{excerpt}</p>
              ) : null}
              <p className="type-meta mt-3">
                {inline.length
                  ? `${inline.length} illustration${inline.length === 1 ? "" : "s"} included`
                  : "No illustration"}
              </p>
            </div>
          </div>
        </div>

        {publications.length ? (
          <div className="mt-6 border-t border-line pt-5">
            <p className="type-label">Publication history</p>
            <ul className="mt-3 space-y-1.5">
              {publications.map((entry) => (
                <li key={entry.prNumber} className="type-meta">
                  <a
                    href={entry.prUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md text-accent-ink transition-colors hover:text-accent-strong"
                  >
                    #{entry.prNumber}
                  </a>{" "}
                  merged {entry.mergedAt.slice(0, 10)} · {entry.branch}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-6 border-t border-line pt-5">
          <details open>
            <summary className="type-label cursor-pointer select-none">
              Final preview — exactly what goes online
            </summary>

            <article className="mt-6 max-w-2xl">
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cover.blobUrl!}
                  alt={cover.alt}
                  className="w-full rounded-lg border border-line"
                />
              ) : null}

              <h2 className="type-display mt-6">{title}</h2>
              {excerpt ? (
                <p className="type-body mt-3 text-ink-3">{excerpt}</p>
              ) : null}
              {article ? (
                <p className="type-meta mt-3">
                  {[
                    article.author,
                    article.publishedAt.slice(0, 10),
                    article.category,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  {article.tags.length ? ` · ${article.tags.join(", ")}` : ""}
                </p>
              ) : null}

              <div className="mt-8 border-t border-line pt-8">
                <MdxPreview content={article?.content ?? ""} />
              </div>

              {article?.internalLinks.length ? (
                <div className="mt-8 border-t border-line pt-5">
                  <p className="type-label">Internal links</p>
                  <ul className="mt-2 space-y-1">
                    {article.internalLinks.map((link) => (
                      <li key={link.href} className="type-meta">
                        {link.anchor} → {link.href}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </article>
          </details>
        </div>

        {pkg.mdx ? (
          <div className="mt-6 border-t border-line pt-5">
            <Disclosure summary="View raw MDX">
              <pre className="type-meta max-h-[32rem] overflow-auto rounded-lg bg-sunken p-4 whitespace-pre-wrap text-ink-2">
                {pkg.mdx}
              </pre>
            </Disclosure>
          </div>
        ) : null}
    </div>
  );
}
