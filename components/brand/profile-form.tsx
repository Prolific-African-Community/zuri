import { Button } from "@/components/ui/button";
import { Field, TextArea } from "@/components/ui/field";
import type { BrandProfile } from "@/lib/generated/prisma/client";

export function BrandProfileForm({
  action,
  profile,
}: {
  action: (formData: FormData) => Promise<void>;
  profile: BrandProfile | null;
}) {
  return (
    <form action={action} className="grid gap-6">
      <TextArea
        label="Mission"
        name="mission"
        required
        rows={2}
        defaultValue={profile?.mission ?? ""}
        placeholder="Why this brand exists, in one sentence."
      />
      <TextArea
        label="Manifesto"
        name="manifesto"
        rows={5}
        defaultValue={profile?.manifesto ?? ""}
        placeholder="The longer statement of belief."
        hint="optional"
      />
      <TextArea
        label="Positioning"
        name="positioning"
        rows={3}
        defaultValue={profile?.positioning ?? ""}
        placeholder="Where this brand sits in its market, and against what."
        hint="optional"
      />
      <TextArea
        label="Value proposition"
        name="valueProposition"
        rows={3}
        defaultValue={profile?.valueProposition ?? ""}
        placeholder="The promise made to the audience."
        hint="optional"
      />
      <TextArea
        label="Voice description"
        name="voiceDescription"
        rows={3}
        defaultValue={profile?.voiceDescription ?? ""}
        placeholder="How this brand sounds when it speaks."
        hint="optional"
      />
      <Field
        label="Language"
        name="language"
        defaultValue={profile?.language ?? ""}
        placeholder="en"
        hint="optional"
        autoComplete="off"
        className="sm:max-w-40"
      />

      <div className="mt-1 flex items-center gap-3 border-t border-line pt-6">
        <Button type="submit">Save profile</Button>
        <p className="type-meta">Mission is required.</p>
      </div>
    </form>
  );
}
