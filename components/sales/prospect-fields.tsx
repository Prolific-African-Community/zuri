import { Field, Select, TextArea } from "@/components/ui/field";
import { PRIORITIES, formatList, humanize } from "@/lib/sales";

export type ProspectValues = {
  name: string;
  website: string | null;
  country: string | null;
  city: string | null;
  industry: string | null;
  description: string | null;
  employeeCount: number | null;
  revenue: string | null;
  fleetSize: number | null;
  activities: string[];
  locations: string[];
  linkedinUrl: string | null;
  companyPhone?: string | null;
  companyEmail?: string | null;
  contactPageUrl?: string | null;
  owner: string | null;
  notes: string | null;
  priority: string;
};

/** Basic company data. Qualification, maturity and pipeline have their own forms. */
export function ProspectFields({ prospect }: { prospect?: ProspectValues }) {
  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Company" name="name" required defaultValue={prospect?.name} />
        <Field
          label="Website"
          name="website"
          type="url"
          placeholder="https://"
          defaultValue={prospect?.website ?? ""}
        />
      </div>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Country" name="country" defaultValue={prospect?.country ?? ""} />
        <Field label="City" name="city" defaultValue={prospect?.city ?? ""} />
        <Field label="Industry" name="industry" defaultValue={prospect?.industry ?? ""} />
      </div>
      <TextArea
        label="Description"
        name="description"
        rows={3}
        defaultValue={prospect?.description ?? ""}
      />
      <div className="grid gap-5 sm:grid-cols-3">
        <Field
          label="Employees"
          name="employeeCount"
          type="number"
          min={0}
          defaultValue={prospect?.employeeCount ?? ""}
        />
        <Field
          label="Fleet size"
          name="fleetSize"
          type="number"
          min={0}
          defaultValue={prospect?.fleetSize ?? ""}
        />
        <Field label="Revenue" name="revenue" defaultValue={prospect?.revenue ?? ""} />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <TextArea
          label="Activities"
          name="activities"
          hint="one per line"
          rows={3}
          defaultValue={formatList(prospect?.activities ?? [])}
        />
        <TextArea
          label="Locations"
          name="locations"
          hint="one per line"
          rows={3}
          defaultValue={formatList(prospect?.locations ?? [])}
        />
      </div>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Switchboard" name="companyPhone" type="tel" defaultValue={prospect?.companyPhone ?? ""} />
        <Field label="Generic email" name="companyEmail" type="email" defaultValue={prospect?.companyEmail ?? ""} />
        <Field label="Contact page" name="contactPageUrl" type="url" defaultValue={prospect?.contactPageUrl ?? ""} />
      </div>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field
          label="LinkedIn"
          name="linkedinUrl"
          type="url"
          defaultValue={prospect?.linkedinUrl ?? ""}
        />
        <Field label="Owner" name="owner" defaultValue={prospect?.owner ?? ""} />
        <Select label="Priority" name="priority" defaultValue={prospect?.priority ?? "MEDIUM"}>
          {PRIORITIES.map((value) => (
            <option key={value} value={value}>
              {humanize(value)}
            </option>
          ))}
        </Select>
      </div>
      <TextArea label="Notes" name="notes" rows={3} defaultValue={prospect?.notes ?? ""} />
    </>
  );
}
