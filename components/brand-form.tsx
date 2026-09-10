import { Button } from "@/components/ui/button";
import { Field, Select, TextArea } from "@/components/ui/field";
import type { Brand, BrandProfile } from "@/lib/generated/prisma/client";

type BrandFormProps = {
  action: (formData: FormData) => Promise<void>;
  brand?: Brand & { profile: BrandProfile | null };
  submitLabel: string;
  /** Mission lives in the Brand Profile form once a brand exists. */
  showMission?: boolean;
};

export function BrandForm({
  action,
  brand,
  submitLabel,
  showMission = true,
}: BrandFormProps) {
  return (
    <form action={action} className="grid gap-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <Field
          label="Name"
          name="name"
          required
          defaultValue={brand?.name}
          placeholder="Proliquid"
          autoComplete="off"
        />
        <Field
          label="Slug"
          name="slug"
          required
          defaultValue={brand?.slug}
          placeholder="proliquid"
          hint="lowercase"
          autoComplete="off"
          pattern="[A-Za-z0-9\- ]+"
          title="Letters, numbers, spaces and dashes."
        />
      </div>

      <Field
        label="Website URL"
        name="websiteUrl"
        type="url"
        defaultValue={brand?.websiteUrl ?? ""}
        placeholder="https://example.com"
        hint="optional"
      />

      <TextArea
        label="Description"
        name="description"
        defaultValue={brand?.description ?? ""}
        placeholder="What this brand does, in one or two sentences."
        hint="optional"
      />

      {showMission ? (
        <TextArea
          label="Mission"
          name="mission"
          defaultValue={brand?.profile?.mission ?? ""}
          placeholder="Make value flow."
          hint="optional"
        />
      ) : null}

      {brand ? (
        <div className="grid gap-6 border-t border-line pt-6 sm:grid-cols-3">
          <Field
            label="GitHub owner"
            name="githubOwner"
            defaultValue={brand.githubOwner ?? ""}
            placeholder="acme-inc"
            hint="optional"
            autoComplete="off"
          />
          <Field
            label="GitHub repo"
            name="githubRepo"
            defaultValue={brand.githubRepo ?? ""}
            placeholder="website"
            autoComplete="off"
          />
          <Field
            label="Base branch"
            name="githubBranch"
            defaultValue={brand.githubBranch ?? ""}
            placeholder="main"
            hint="defaults to the repo default"
            autoComplete="off"
          />
        </div>
      ) : null}

      {brand ? (
        <div className="grid gap-6 border-t border-line pt-6">
          <p className="type-label">Publishing</p>
          <div className="grid gap-6 sm:grid-cols-2">
            <Select
              label="Content format"
              name="contentFormat"
              defaultValue={brand.contentFormat}
            >
              <option value="MDX">MDX</option>
              <option value="MARKDOWN">Markdown</option>
            </Select>
            <Select
              label="Publishing mode"
              name="publishingMode"
              defaultValue={brand.publishingMode}
            >
              <option value="GITHUB_PR">GitHub pull request</option>
            </Select>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <Field
              label="Content directory"
              name="contentDirectory"
              defaultValue={brand.contentDirectory ?? ""}
              placeholder="content/blog"
              hint="where article files are written"
              autoComplete="off"
            />
            <Field
              label="Public route"
              name="publicRoute"
              defaultValue={brand.publicRoute ?? ""}
              placeholder="/blog"
              hint="where they are read on the site"
              autoComplete="off"
            />
            <Field
              label="Assets directory"
              name="assetsDirectory"
              defaultValue={brand.assetsDirectory ?? ""}
              placeholder="public/blog"
              autoComplete="off"
            />
            <Field
              label="Google Ads customer ID"
              name="googleAdsCustomerId"
              defaultValue={brand.googleAdsCustomerId ?? ""}
              placeholder="1234567890"
              hint="the account this brand advertises in"
              autoComplete="off"
            />
            <Field
              label="Vercel project"
              name="vercelProjectId"
              defaultValue={brand.vercelProjectId ?? ""}
              placeholder="prj_… or the project name"
              hint="to confirm production deployments"
              autoComplete="off"
            />
            <Field
              label="Publishing branch"
              name="defaultBranch"
              defaultValue={brand.defaultBranch ?? ""}
              placeholder="main"
              hint="falls back to the base branch"
              autoComplete="off"
            />
          </div>
        </div>
      ) : null}

      {brand ? (
        <Select label="Status" name="status" defaultValue={brand.status}>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="ARCHIVED">Archived</option>
        </Select>
      ) : null}

      <div className="mt-1 flex items-center gap-3 border-t border-line pt-6">
        <Button type="submit">{submitLabel}</Button>
        <p className="type-meta">Name and slug are required.</p>
      </div>
    </form>
  );
}
