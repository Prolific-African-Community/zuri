import {
  createCompetitor,
  deleteCompetitor,
  updateCompetitor,
} from "@/app/dashboard/brands/[brandId]/actions";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { Field, TextArea } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/layout";
import type { Competitor } from "@/lib/generated/prisma/client";

function CompetitorFields({ competitor }: { competitor?: Competitor }) {
  return (
    <>
      <div className="grid gap-6 sm:grid-cols-2">
        <Field
          label="Name"
          name="name"
          required
          defaultValue={competitor?.name}
          placeholder="Acme Finance"
          autoComplete="off"
        />
        <Field
          label="Website URL"
          name="websiteUrl"
          type="url"
          required
          defaultValue={competitor?.websiteUrl}
          placeholder="https://acme.com"
          autoComplete="off"
        />
      </div>
      <TextArea
        label="Description"
        name="description"
        rows={3}
        defaultValue={competitor?.description ?? ""}
        placeholder="What they do, and where they overlap."
        hint="optional"
      />
    </>
  );
}

export function CompetitorsSection({
  brandId,
  competitors,
}: {
  brandId: string;
  competitors: Competitor[];
}) {
  return (
    <>
      {competitors.length ? (
        <ul className="divide-y divide-line">
          {competitors.map((competitor) => (
            <li key={competitor.id} className="py-5 first:pt-0">
              <h3 className="text-[0.9375rem] font-medium tracking-[-0.01em]">
                {competitor.name}
              </h3>
              <a
                href={competitor.websiteUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="type-meta mt-1 inline-block rounded-md transition-colors hover:text-accent-ink"
              >
                {competitor.websiteUrl}
              </a>
              {competitor.description ? (
                <p className="type-body mt-1.5 max-w-2xl text-ink-3">
                  {competitor.description}
                </p>
              ) : null}

              <Disclosure summary="Edit" className="mt-3">
                <form
                  action={updateCompetitor.bind(null, brandId, competitor.id)}
                  className="grid max-w-2xl gap-6 rounded-xl border border-line bg-subtle p-6"
                >
                  <CompetitorFields competitor={competitor} />
                  <div className="flex items-center gap-3 border-t border-line pt-6">
                    <Button type="submit">Save competitor</Button>
                    <Button
                      type="submit"
                      variant="ghost"
                      formNoValidate
                      formAction={deleteCompetitor.bind(
                        null,
                        brandId,
                        competitor.id,
                      )}
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
          title="No competitors yet"
          description="Track who else is speaking to this brand's audience."
        />
      )}

      <Disclosure summary="Add a competitor" tone="accent" className="mt-8">
        <form
          action={createCompetitor.bind(null, brandId)}
          className="grid max-w-2xl gap-6 rounded-xl border border-line bg-subtle p-6"
        >
          <CompetitorFields />
          <div className="border-t border-line pt-6">
            <Button type="submit">Add competitor</Button>
          </div>
        </form>
      </Disclosure>
    </>
  );
}
