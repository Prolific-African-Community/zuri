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
