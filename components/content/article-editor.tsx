import { updateArticleDraft } from "@/app/dashboard/content/actions";
import { ArticleForm } from "@/components/content/article-form";
import {
  ArticleImages,
  type ArticleImageView,
} from "@/components/content/article-images";
import { ArticleWorkspace } from "@/components/content/article-workspace";
import {
  Distribution,
  type BusinessPostView,
} from "@/components/content/distribution";
import { MdxPreview } from "@/components/content/mdx-preview";
import {
  PublishingPreview,
  type PreviewImage,
  type PublicationView,
  type PublishedView,
  type PullRequestView,
} from "@/components/content/publishing-preview";
import { Badge } from "@/components/ui/badge";
import { Field, TextArea } from "@/components/ui/field";
import { Panel, Section } from "@/components/ui/layout";
import {
  formatLinks,
  readLinks,
  toArticlePackage,
  toDateTimeLocal,
  type ArticleDraftLike,
} from "@/lib/article";
import { validateArticlePackage } from "@/lib/publishing";
import type { PublishingPackage } from "@/lib/publishing-package";

export type ArticleEditorAsset = {
  id: string;
  title: string | null;
  content: string;
};

export function ArticleEditor({
  asset,
  draft,
  images,
  publishing,
  reviewStatus,
  pullRequest,
  published,
  publications,
  businessPost,
  publicUrl,
  bannerUrl,
  businessLocation,
  brandId,
  opportunityId,
}: {
  asset: ArticleEditorAsset;
  draft: ArticleDraftLike;
  images: ArticleImageView[];
  publishing: PublishingPackage;
  reviewStatus: string;
  pullRequest: PullRequestView | null;
  published: PublishedView | null;
  publications: PublicationView[];
  businessPost: BusinessPostView | null;
  publicUrl: string | null;
  bannerUrl: string | null;
  businessLocation: string | null;
  brandId: string;
  opportunityId: string | null;
}) {
  const save = updateArticleDraft.bind(null, asset.id);
  const validation = validateArticlePackage(toArticlePackage(asset, draft));

  const write = (
    <ArticleForm action={save} status={reviewStatus}>
      <Field
        label="Title"
        name="title"
        required
        defaultValue={asset.title ?? ""}
        autoComplete="off"
      />
      <TextArea label="Excerpt" name="excerpt" rows={2} defaultValue={draft.excerpt} />
      <TextArea
        label="Content"
        name="content"
        required
        rows={24}
        defaultValue={asset.content}
        hint="MDX — headings, paragraphs, lists"
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Author"
          name="author"
          defaultValue={draft.author}
          autoComplete="off"
        />
        <Field
          label="Published at"
          name="publishedAt"
          type="datetime-local"
          defaultValue={toDateTimeLocal(draft.publishedAt)}
        />
      </div>

      <details className="border-t border-line pt-5">
        <summary className="type-label cursor-pointer select-none">
          Preview the body
        </summary>
        <div className="mt-5">
          <MdxPreview content={asset.content} />
        </div>
      </details>
    </ArticleForm>
  );

  const media = <ArticleImages contentAssetId={asset.id} images={images} />;

  const seo = (
    <>
      <div className="mb-8">
        <div className="flex flex-wrap items-center gap-2.5">
          <Badge tone={validation.ok ? "accent" : "muted"}>
            {validation.ok ? "valid" : "invalid"}
          </Badge>
          <span className="type-meta">
            {validation.ok
              ? "Every contract field is present and well-formed."
              : `${validation.errors.length} problem${validation.errors.length === 1 ? "" : "s"} to fix before publishing.`}
          </span>
        </div>
        {validation.ok ? null : (
          <ul className="mt-4 max-w-2xl space-y-1.5">
            {validation.errors.map((error) => (
              <li key={error} className="type-body text-ink-2">
                {error}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ArticleForm action={save} status={reviewStatus}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Slug"
            name="slug"
            defaultValue={draft.slug}
            placeholder="a-clear-lowercase-slug"
            autoComplete="off"
          />
          <Field
            label="Category"
            name="category"
            defaultValue={draft.category}
            autoComplete="off"
          />
          <Field
            label="Target keyword"
            name="targetKeyword"
            defaultValue={draft.targetKeyword}
            autoComplete="off"
          />
          <Field
            label="Tags"
            name="tags"
            defaultValue={draft.tags.join(", ")}
            hint="comma separated"
            autoComplete="off"
          />
        </div>
        <Field
          label="Meta title"
          name="metaTitle"
          defaultValue={draft.metaTitle}
          hint="70 characters max"
          autoComplete="off"
        />
        <TextArea
          label="Meta description"
          name="metaDescription"
          rows={2}
          defaultValue={draft.metaDescription}
          hint="165 characters max"
        />
        <Field
          label="Canonical URL"
          name="canonicalUrl"
          type="url"
          defaultValue={draft.canonicalUrl ?? ""}
          hint="optional"
          autoComplete="off"
        />
        <TextArea
          label="Internal links"
          name="internalLinks"
          rows={3}
          defaultValue={formatLinks(readLinks(draft.internalLinks))}
          hint="one per line: /path | anchor text"
        />
      </ArticleForm>
    </>
  );

  const publish = (
    <>
      <PublishingPreview
      contentAssetId={asset.id}
      pkg={publishing}
      images={images as PreviewImage[]}
      reviewStatus={reviewStatus}
      pullRequest={pullRequest}
      published={published}
      publications={publications}
      title={asset.title ?? "Untitled"}
      excerpt={draft.excerpt}
      />
      <Distribution
        assetId={asset.id}
        post={businessPost}
        targetUrl={publicUrl}
        bannerUrl={bannerUrl}
        location={businessLocation}
        brandId={brandId}
        opportunityId={opportunityId}
      />
    </>
  );

  return (
    <Section className="mt-2">
      <Panel>
        <ArticleWorkspace write={write} media={media} seo={seo} publish={publish} />
      </Panel>
    </Section>
  );
}
