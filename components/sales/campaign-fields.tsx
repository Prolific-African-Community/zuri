import { Field, TextArea } from "@/components/ui/field";
import { formatCriteria, formatList, readCriteria } from "@/lib/sales";

export type CampaignValues = {
  name: string;
  offer: string;
  description: string | null;
  geography: string[];
  industries: string[];
  targetCompanySize: string | null;
  idealCustomerProfile: string;
  painPoints: string[];
  valueProposition: string;
  primaryAngle: string;
  targetTicketMin: number | null;
  targetTicketMax: number | null;
  currency: string | null;
  preferredProfile: string[];
  exclusions: string[];
  scoringCriteria: unknown;
};

/** The same fields create and edit a campaign. Lists are one entry per line. */
export function CampaignFields({ campaign }: { campaign?: CampaignValues }) {
  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Name" name="name" required defaultValue={campaign?.name} />
        <Field label="Offer" name="offer" required defaultValue={campaign?.offer} />
      </div>
      <TextArea
        label="Description"
        name="description"
        rows={2}
        defaultValue={campaign?.description ?? ""}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextArea
          label="Geography"
          name="geography"
          hint="one per line"
          rows={3}
          defaultValue={formatList(campaign?.geography ?? [])}
        />
        <TextArea
          label="Industries"
          name="industries"
          hint="one per line"
          rows={3}
          defaultValue={formatList(campaign?.industries ?? [])}
        />
      </div>
      <div className="grid gap-5 sm:grid-cols-4">
        <Field
          label="Target size"
          name="targetCompanySize"
          placeholder="30–200 vehicles"
          defaultValue={campaign?.targetCompanySize ?? ""}
        />
        <Field
          label="Ticket min"
          name="targetTicketMin"
          type="number"
          min={0}
          defaultValue={campaign?.targetTicketMin ?? ""}
        />
        <Field
          label="Ticket max"
          name="targetTicketMax"
          type="number"
          min={0}
          defaultValue={campaign?.targetTicketMax ?? ""}
        />
        <Field
          label="Currency"
          name="currency"
          placeholder="EUR"
          defaultValue={campaign?.currency ?? ""}
        />
      </div>
      <TextArea
        label="Ideal customer profile"
        name="idealCustomerProfile"
        rows={3}
        defaultValue={campaign?.idealCustomerProfile ?? ""}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextArea
          label="Preferred profile"
          name="preferredProfile"
          hint="one per line"
          rows={5}
          defaultValue={formatList(campaign?.preferredProfile ?? [])}
        />
        <TextArea
          label="Exclusions"
          name="exclusions"
          hint="one per line"
          rows={5}
          defaultValue={formatList(campaign?.exclusions ?? [])}
        />
      </div>
      <TextArea
        label="Pain points"
        name="painPoints"
        hint="one per line"
        rows={4}
        defaultValue={formatList(campaign?.painPoints ?? [])}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextArea
          label="Value proposition"
          name="valueProposition"
          rows={3}
          defaultValue={campaign?.valueProposition ?? ""}
        />
        <TextArea
          label="Primary angle"
          name="primaryAngle"
          rows={3}
          defaultValue={campaign?.primaryAngle ?? ""}
        />
      </div>
      <TextArea
        label="Scoring criteria"
        name="scoringCriteria"
        hint="one per line · Criterion | weight"
        rows={4}
        defaultValue={formatCriteria(readCriteria(campaign?.scoringCriteria))}
      />
    </>
  );
}
