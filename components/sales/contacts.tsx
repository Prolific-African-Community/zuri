import {
  removeContact,
  setPrimaryContact,
  updateContact,
} from "@/app/dashboard/sales/actions";
import { hostname } from "@/components/sales/evidence";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { Field, Select } from "@/components/ui/field";
import { CONFIDENCES, DECISION_ROLES, contactName, humanize } from "@/lib/sales";

export type ContactItem = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  jobTitle: string | null;
  seniority: string | null;
  decisionRole: string;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  linkedinUrl: string | null;
  sourceUrl: string | null;
  sourceName: string | null;
  isPrimary: boolean;
  confidence: string;
};

export function ContactFields({ contact }: { contact?: ContactItem }) {
  return (
    <>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="First name" name="firstName" defaultValue={contact?.firstName ?? ""} />
        <Field label="Last name" name="lastName" defaultValue={contact?.lastName ?? ""} />
        <Field label="Job title" name="jobTitle" defaultValue={contact?.jobTitle ?? ""} />
      </div>
      <div className="grid gap-5 sm:grid-cols-3">
        <Select
          label="Decision role"
          name="decisionRole"
          defaultValue={contact?.decisionRole ?? "UNKNOWN"}
        >
          {DECISION_ROLES.map((value) => (
            <option key={value} value={value}>
              {humanize(value)}
            </option>
          ))}
        </Select>
        <Field label="Seniority" name="seniority" defaultValue={contact?.seniority ?? ""} />
        <Select
          label="Confidence"
          name="confidence"
          defaultValue={contact?.confidence ?? "MEDIUM"}
        >
          {CONFIDENCES.map((value) => (
            <option key={value} value={value}>
              {humanize(value)}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Email" name="email" type="email" defaultValue={contact?.email ?? ""} />
        <Field label="Phone" name="phone" type="tel" defaultValue={contact?.phone ?? ""} />
        <Field label="Mobile" name="mobile" type="tel" defaultValue={contact?.mobile ?? ""} />
      </div>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field
          label="LinkedIn"
          name="linkedinUrl"
          type="url"
          defaultValue={contact?.linkedinUrl ?? ""}
        />
        <Field
          label="Source URL"
          name="sourceUrl"
          type="url"
          defaultValue={contact?.sourceUrl ?? ""}
        />
        <Field label="Source name" name="sourceName" defaultValue={contact?.sourceName ?? ""} />
      </div>
    </>
  );
}

export function ContactRow({
  prospectId,
  contact,
  assessment,
}: {
  prospectId: string;
  contact: ContactItem;
  /** The brief's view of this person, when one has been generated. */
  assessment?: string | null;
}) {
  const reach = [contact.email, contact.phone, contact.mobile].filter(Boolean);

  return (
    <li className="py-4 first:pt-0">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-[0.9375rem] font-medium tracking-[-0.01em]">
          {contactName(contact)}
        </span>
        {contact.isPrimary ? <Badge tone="accent">Primary</Badge> : null}
        <Badge tone={contact.decisionRole === "DECISION_MAKER" ? "accent" : "neutral"}>
          {humanize(contact.decisionRole)}
        </Badge>
      </div>
      <p className="type-meta mt-1">
        {[contact.jobTitle, contact.seniority, `${humanize(contact.confidence)} confidence`]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {reach.length || contact.linkedinUrl ? (
        <p className="type-body mt-1.5 text-ink-2">
          {reach.join(" · ")}
          {contact.linkedinUrl ? (
            <>
              {reach.length ? " · " : ""}
              <a
                href={contact.linkedinUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="rounded-md text-accent-ink transition-colors hover:text-accent-strong"
              >
                LinkedIn
              </a>
            </>
          ) : null}
        </p>
      ) : null}
      {assessment ? <p className="type-meta mt-1.5 max-w-2xl text-ink-2">{assessment}</p> : null}
      {contact.sourceUrl || contact.sourceName ? (
        <p className="type-meta mt-1">
          Source:{" "}
          {contact.sourceUrl ? (
            <a
              href={contact.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-md text-accent-ink transition-colors hover:text-accent-strong"
            >
              {contact.sourceName ?? hostname(contact.sourceUrl)}
            </a>
          ) : (
            contact.sourceName
          )}
        </p>
      ) : null}

      <div className="mt-2 flex flex-wrap items-start gap-x-5 gap-y-2">
        {contact.isPrimary ? null : (
          <form action={setPrimaryContact.bind(null, prospectId, contact.id)}>
            <button
              type="submit"
              className="type-meta rounded-md text-accent-ink transition-colors hover:text-accent-strong"
            >
              Set primary
            </button>
          </form>
        )}
        <Disclosure summary="Edit">
          <form
            action={updateContact.bind(null, prospectId, contact.id)}
            className="mt-3 grid max-w-3xl gap-4 rounded-xl border border-line bg-subtle p-5"
          >
            <ContactFields contact={contact} />
            <div>
              <Button type="submit" size="sm">
                Save contact
              </Button>
            </div>
          </form>
        </Disclosure>
        <form action={removeContact.bind(null, prospectId, contact.id)}>
          <button
            type="submit"
            className="type-meta rounded-md text-ink-4 transition-colors hover:text-ink-2"
          >
            Remove
          </button>
        </form>
      </div>
    </li>
  );
}
