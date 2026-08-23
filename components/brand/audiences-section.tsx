import {
  createAudience,
  deleteAudience,
  updateAudience,
} from "@/app/dashboard/brands/[brandId]/actions";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { Field, TextArea } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/layout";
import { listText } from "@/lib/brands";
import type { Audience } from "@/lib/generated/prisma/client";

function AudienceFields({ audience }: { audience?: Audience }) {
  return (
    <>
      <Field
        label="Name"
        name="name"
        required
        defaultValue={audience?.name}
        placeholder="CFOs of mid-market groups"
        autoComplete="off"
      />
      <TextArea
        label="Description"
        name="description"
        rows={3}
        defaultValue={audience?.description ?? ""}
        placeholder="Who they are and what their day looks like."
      />
      <div className="grid gap-6 sm:grid-cols-2">
        <TextArea
          label="Pains"
          name="pains"
          rows={4}
          defaultValue={listText(audience?.pains)}
          hint="one per line"
        />
        <TextArea
          label="Motivations"
          name="motivations"
          rows={4}
          defaultValue={listText(audience?.motivations)}
          hint="one per line"
        />
        <TextArea
          label="Objections"
          name="objections"
          rows={4}
          defaultValue={listText(audience?.objections)}
          hint="one per line"
        />
        <TextArea
          label="Vocabulary"
          name="vocabulary"
          rows={4}
          defaultValue={listText(audience?.vocabulary)}
          hint="one per line"
        />
      </div>
    </>
  );
}

function List({ label, values }: { label: string; values: string[] }) {
  if (!values.length) return null;
  return (
    <div>
      <p className="type-label">{label}</p>
      <ul className="mt-2 space-y-1">
        {values.map((value) => (
          <li key={value} className="type-body text-ink-2">
            {value}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AudiencesSection({
  brandId,
  audiences,
}: {
  brandId: string;
  audiences: Audience[];
}) {
  return (
    <>
      {audiences.length ? (
        <ul className="divide-y divide-line">
          {audiences.map((audience) => (
            <li key={audience.id} className="py-6 first:pt-0">
              <h3 className="text-[0.9375rem] font-medium tracking-[-0.01em]">
                {audience.name}
              </h3>
              {audience.description ? (
                <p className="type-body mt-1.5 max-w-2xl text-ink-3">
                  {audience.description}
                </p>
              ) : null}

              <div className="mt-5 grid gap-6 sm:grid-cols-2">
                <List label="Pains" values={audience.pains} />
                <List label="Motivations" values={audience.motivations} />
                <List label="Objections" values={audience.objections} />
                <List label="Vocabulary" values={audience.vocabulary} />
              </div>

              <Disclosure summary="Edit" className="mt-5">
                <form
                  action={updateAudience.bind(null, brandId, audience.id)}
                  className="grid max-w-2xl gap-6 rounded-xl border border-line bg-subtle p-6"
                >
                  <AudienceFields audience={audience} />
                  <div className="flex items-center gap-3 border-t border-line pt-6">
                    <Button type="submit">Save audience</Button>
                    <Button
                      type="submit"
                      variant="ghost"
                      formNoValidate
                      formAction={deleteAudience.bind(null, brandId, audience.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </form>
              </Disclosure>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="No audiences yet"
          description="Describe who this brand speaks to before anything is written for them."
        />
      )}

      <Disclosure summary="Add an audience" tone="accent" className="mt-8">
        <form
          action={createAudience.bind(null, brandId)}
          className="grid max-w-2xl gap-6 rounded-xl border border-line bg-subtle p-6"
        >
          <AudienceFields />
          <div className="border-t border-line pt-6">
            <Button type="submit">Add audience</Button>
          </div>
        </form>
      </Disclosure>
    </>
  );
}
