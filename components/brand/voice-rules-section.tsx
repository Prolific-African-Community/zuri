import {
  createVoiceRule,
  deleteVoiceRule,
  updateVoiceRule,
} from "@/app/dashboard/brands/[brandId]/actions";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { Select, TextArea } from "@/components/ui/field";
import type { VoiceRule } from "@/lib/generated/prisma/client";

function TypeSelect({ defaultValue }: { defaultValue?: VoiceRule["type"] }) {
  return (
    <Select label="Type" name="type" defaultValue={defaultValue ?? "DO"}>
      <option value="DO">Do</option>
      <option value="DONT">Don&apos;t</option>
    </Select>
  );
}

function Column({
  brandId,
  title,
  type,
  rules,
}: {
  brandId: string;
  title: string;
  type: VoiceRule["type"];
  rules: VoiceRule[];
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2.5">
        <h3 className="type-section-title">{title}</h3>
        <span className="type-meta">{rules.length}</span>
      </div>

      {rules.length ? (
        <ul className="mt-4 space-y-3">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="rounded-lg bg-subtle px-4 py-3 transition-colors duration-200 hover:bg-sunken"
            >
              <p className="type-body text-ink-2">{rule.rule}</p>
              <Disclosure summary="Edit" className="mt-2">
                <form
                  action={updateVoiceRule.bind(null, brandId, rule.id)}
                  className="grid gap-4"
                >
                  <TextArea
                    label="Rule"
                    name="rule"
                    required
                    rows={3}
                    defaultValue={rule.rule}
                  />
                  <TypeSelect defaultValue={rule.type} />
                  <div className="flex items-center gap-2">
                    <Button type="submit" size="sm">
                      Save
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      variant="ghost"
                      formNoValidate
                      formAction={deleteVoiceRule.bind(null, brandId, rule.id)}
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
        <p className="type-meta mt-4">
          Nothing recorded {type === "DO" ? "to do" : "to avoid"} yet.
        </p>
      )}
    </div>
  );
}

export function VoiceRulesSection({
  brandId,
  voiceRules,
}: {
  brandId: string;
  voiceRules: VoiceRule[];
}) {
  return (
    <>
      <div className="grid gap-10 sm:grid-cols-2">
        <Column
          brandId={brandId}
          title="Do"
          type="DO"
          rules={voiceRules.filter((rule) => rule.type === "DO")}
        />
        <Column
          brandId={brandId}
          title="Don't"
          type="DONT"
          rules={voiceRules.filter((rule) => rule.type === "DONT")}
        />
      </div>

      <Disclosure summary="Add a rule" tone="accent" className="mt-8">
        <form
          action={createVoiceRule.bind(null, brandId)}
          className="grid max-w-2xl gap-6 rounded-xl border border-line bg-subtle p-6"
        >
          <TextArea
            label="Rule"
            name="rule"
            required
            rows={3}
            placeholder="Prefer concrete language."
          />
          <TypeSelect />
          <div className="border-t border-line pt-6">
            <Button type="submit">Add rule</Button>
          </div>
        </form>
      </Disclosure>
    </>
  );
}
