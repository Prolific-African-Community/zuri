import {
  createGoldenExample,
  deleteGoldenExample,
  updateGoldenExample,
} from "@/app/dashboard/brands/[brandId]/actions";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { Field, TextArea } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/layout";
import type { GoldenExample } from "@/lib/generated/prisma/client";

function ExampleFields({ example }: { example?: GoldenExample }) {
  return (
    <>
      <Field
        label="Title"
        name="title"
        defaultValue={example?.title ?? ""}
        placeholder="Which Excel is the final one?"
        hint="optional"
        autoComplete="off"
      />
      <TextArea
        label="Content"
        name="content"
        required
        rows={6}
        defaultValue={example?.content ?? ""}
        placeholder="The piece itself, exactly as it was published."
      />
      <TextArea
        label="Notes"
        name="notes"
        rows={3}
        defaultValue={example?.notes ?? ""}
        placeholder="Why this one worked."
        hint="optional"
      />
    </>
  );
}

export function GoldenExamplesSection({
  brandId,
  goldenExamples,
}: {
  brandId: string;
  goldenExamples: GoldenExample[];
}) {
  return (
    <>
      {goldenExamples.length ? (
        <ul className="divide-y divide-line">
          {goldenExamples.map((example) => (
            <li key={example.id} className="py-6 first:pt-0">
              {example.title ? (
                <h3 className="text-[0.9375rem] font-medium tracking-[-0.01em]">
                  {example.title}
                </h3>
              ) : null}
              <p
                className={`type-body max-w-2xl whitespace-pre-line text-ink-2 ${example.title ? "mt-1.5" : ""}`}
              >
                {example.content}
              </p>
              {example.notes ? (
                <p className="type-meta mt-3 max-w-2xl">{example.notes}</p>
              ) : null}

              <Disclosure summary="Edit" className="mt-4">
                <form
                  action={updateGoldenExample.bind(null, brandId, example.id)}
                  className="grid max-w-2xl gap-6 rounded-xl border border-line bg-subtle p-6"
                >
                  <ExampleFields example={example} />
                  <div className="flex items-center gap-3 border-t border-line pt-6">
                    <Button type="submit">Save example</Button>
                    <Button
                      type="submit"
                      variant="ghost"
                      formNoValidate
                      formAction={deleteGoldenExample.bind(
                        null,
                        brandId,
                        example.id,
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
          title="No golden examples yet"
          description="Keep the pieces that worked. They are the reference for everything written next."
        />
      )}

      <Disclosure summary="Add an example" tone="accent" className="mt-8">
        <form
          action={createGoldenExample.bind(null, brandId)}
          className="grid max-w-2xl gap-6 rounded-xl border border-line bg-subtle p-6"
        >
          <ExampleFields />
          <div className="border-t border-line pt-6">
            <Button type="submit">Add example</Button>
          </div>
        </form>
      </Disclosure>
    </>
  );
}
