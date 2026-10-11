import {
  addContact,
  addEvidence,
  addInteraction,
  deleteProspect,
  updateDigitalMaturity,
  updatePipeline,
  updateProspect,
  updateQualification,
} from "@/app/dashboard/sales/actions";
import { ConfirmDelete } from "@/components/sales/confirm-delete";
import { ContactFields, ContactRow } from "@/components/sales/contacts";
import { GenerateIntelligence } from "@/components/sales/generate-intelligence";
import {
  AnalysisPanel,
  AnalyzeInteraction,
  ConfirmGroup,
} from "@/components/sales/interaction-learning";
import { dateNeedsConfirmation, type Analysis, type Proposal } from "@/lib/interaction-learning";
import { scoringIsStale } from "@/lib/prospect-scoring";
import { RescoreButton } from "@/components/sales/rescore-button";
import { EvidenceFields, EvidenceList, hostname } from "@/components/sales/evidence";
import { ProspectFields } from "@/components/sales/prospect-fields";
import {
  BulletList,
  ContactabilityBadge,
  EvidenceTypeBadge,
  Facts,
  PriorityLabel,
  QualificationBadge,
  SalesNav,
  Score,
} from "@/components/sales/sales-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { Field, Select, TextArea } from "@/components/ui/field";
import { Page, PageHeader, Panel, Section } from "@/components/ui/layout";
import { TabNav } from "@/components/ui/tab-nav";
import { FLAG_LABELS } from "@/lib/contactability";
import { getPrisma } from "@/lib/prisma";
import {
  SALES_LANGUAGE,
  detectLanguage,
  intelligenceFingerprint,
  type DecisionMakerAssessment,
  type FitFactor,
  type PainPoint,
  type QualificationPriority,
} from "@/lib/sales-intelligence";
import { loadIntelligenceInput } from "@/lib/sales-intelligence-input";
import {
  CONFIDENCES,
  INTERACTION_TYPES,
  PROSPECT_STATUSES,
  contactName,
  formatList,
  formatTicket,
  humanize,
  toDateInput,
} from "@/lib/sales";
import { salesView } from "@/lib/sales-view";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

const dateTime = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const TABS = ["overview", "intelligence", "contacts", "evidence", "interactions"] as const;
type Tab = (typeof TABS)[number];
const VIEWS = ["qualification", "call", "objections"] as const;
type View = (typeof VIEWS)[number];

function explanationText(value: unknown) {
  if (value && typeof value === "object" && "text" in value) {
    return String((value as { text: unknown }).text);
  }
  return "";
}

/** Json columns are read defensively: a malformed row renders as empty. */
function arrayOf<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function Paragraphs({ text }: { text: string }) {
  return (
    <div className="grid max-w-2xl gap-3">
      {text
        .split(/\n{2,}/)
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => (
          <p key={part.slice(0, 40)} className="type-body text-ink-2 whitespace-pre-line">
            {part}
          </p>
        ))}
    </div>
  );
}

function NotGenerated() {
  return (
    <p className="type-meta rounded-lg border border-dashed border-line-strong px-4 py-3 text-ink-4">
      Generate intelligence to fill this from the stored evidence.
    </p>
  );
}

const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

function Phone({ value, strong }: { value: string; strong?: boolean }) {
  return (
    <a
      href={telHref(value)}
      className={
        strong
          ? "text-[1.25rem] font-semibold tabular-nums tracking-[-0.02em] text-ink transition-colors hover:text-accent-ink"
          : "font-medium tabular-nums text-ink transition-colors hover:text-accent-ink"
      }
    >
      {value}
    </a>
  );
}

const PHONE_SOURCE_LABELS: Record<string, string> = {
  TEL_LINK: "official website",
  STRUCTURED_DATA: "official website",
  LABELLED_TEXT: "official website",
  PLAIN_TEXT: "official website",
  MAPS: "Google Maps listing",
  MANUAL: "entered by hand",
};

function ContactLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="type-label w-24 shrink-0">{label}</span>
      <span className="type-body min-w-0 break-words text-ink-2">{children}</span>
    </div>
  );
}

/** One applied change, in plain words, for the interaction history. */
function describeProposal(p: Proposal) {
  switch (p.kind) {
    case "NEW_FACT":
      return `New fact: ${p.statement}`;
    case "RESOLVE_UNKNOWN":
      return `Resolved: “${p.evidenceStatement}”`;
    case "SUPERSEDE":
      return `Superseded: “${p.evidenceStatement}”`;
    case "FIELD":
      return `${humanize(p.field.replace(/([A-Z])/g, "_$1"))}: ${p.previous ?? "—"} → ${p.value}`;
    case "CONTACT":
      return `${p.contactName}${p.decisionRole ? ` → ${humanize(p.decisionRole)}` : ""}${p.makePrimary ? " · now primary" : ""}`;
    case "PIPELINE":
      return `Pipeline: ${humanize(p.from)} → ${humanize(p.to)}`;
    case "NEXT_ACTION":
      return `Next action: ${p.text}`;
  }
}

export default async function ProspectPage({
  params,
  searchParams,
}: PageProps<"/dashboard/sales/prospects/[id]">) {
  const { id } = await params;
  const query = await searchParams;
  const tabParam = Array.isArray(query.tab) ? query.tab[0] : query.tab;
  const viewParam = Array.isArray(query.view) ? query.view[0] : query.view;
  const tab: Tab = (TABS as readonly string[]).includes(tabParam ?? "") ? (tabParam as Tab) : "overview";
  const view: View = (VIEWS as readonly string[]).includes(viewParam ?? "") ? (viewParam as View) : "qualification";

  const prospect = await getPrisma().prospect.findUnique({
    where: { id },
    include: {
      brand: { select: { name: true } },
      campaign: { select: { id: true, name: true, status: true } },
      evidence: { orderBy: { createdAt: "asc" } },
      contacts: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        include: { _count: { select: { interactions: true } } },
      },
      interactions: {
        orderBy: { occurredAt: "desc" },
        include: { contact: true },
      },
      intelligence: true,
    },
  });
  if (!prospect) notFound();

  const base = `/dashboard/sales/prospects/${prospect.id}`;
  const intelligence = prospect.intelligence;
  const sales = salesView(prospect);
  const { contactability, qualification } = sales;
  const entry = contactability.entryPoint;
  const scoringStale = await scoringIsStale(prospect.id);
  const nextDateUnconfirmed =
    Boolean(prospect.nextAction) && !prospect.nextActionAt && dateNeedsConfirmation(prospect.nextAction);
  const input = intelligence ? await loadIntelligenceInput(prospect.id) : null;
  const stale = Boolean(
    intelligence && input && intelligenceFingerprint(input) !== intelligence.sourceFingerprint,
  );
  const learnedSinceBrief = Boolean(
    intelligence &&
      prospect.interactions.some(
        (item) => item.appliedAt && item.appliedAt > intelligence.generatedAt,
      ),
  );
  const factors = intelligence
    ? arrayOf<FitFactor>((intelligence.fitExplanation as { factors?: unknown })?.factors)
    : [];
  const confidenceNotes = intelligence
    ? arrayOf<string>(
        (intelligence.fitExplanation as { confidenceNotes?: unknown })?.confidenceNotes,
      )
    : [];
  const painPointsAi = arrayOf<PainPoint>(intelligence?.likelyPainPoints);
  const priorities = arrayOf<QualificationPriority>(intelligence?.qualificationPriorities);
  const assessments = new Map(
    arrayOf<DecisionMakerAssessment>(intelligence?.decisionMakers).map((item) => [
      item.contactId,
      item,
    ]),
  );
  const gatekeeper = (intelligence?.gatekeeperScript ?? {}) as {
    opening?: string;
    ifAskedWhy?: string;
  };
  const discoveryQuestions = arrayOf<string>(intelligence?.discoveryQuestions);
  const objections = arrayOf<{ objection: string; response: string }>(intelligence?.objections);

  // Sales Intelligence is French-only; a brief written before that policy is flagged, never rewritten.
  const expectedLanguage = SALES_LANGUAGE;
  const scriptLanguage = intelligence
    ? detectLanguage(
        [
          intelligence.whyThisProspect,
          intelligence.commercialAngle,
          intelligence.nextBestAction,
          gatekeeper.opening,
          gatekeeper.ifAskedWhy,
          intelligence.decisionMakerOpening,
          ...discoveryQuestions,
          ...objections.flatMap((item) => [item.objection, item.response]),
        ]
          .filter(Boolean)
          .join(" "),
      )
    : null;
  const languageMismatch = Boolean(scriptLanguage && scriptLanguage !== expectedLanguage);

  // Superseded and resolved evidence is history: shown apart, never mixed in.
  const active = prospect.evidence.filter((item) => !item.supersededAt && !item.resolvedAt);
  const history = prospect.evidence.filter((item) => item.supersededAt || item.resolvedAt);
  const evidenceById = new Map(prospect.evidence.map((item) => [item.id, item]));
  const facts = active.filter((item) => item.type === "FACT");
  const inferences = active.filter((item) => item.type === "INFERENCE");
  const unknowns = active.filter((item) => item.type === "UNKNOWN");
  const painPoints = active.filter((item) => /pain/i.test(item.category));
  const contactNames = Object.fromEntries(
    prospect.contacts.map((contact) => [contact.id, contactName(contact)]),
  );
  const explanation = explanationText(prospect.fitExplanation);

  // Every place a statement came from, once.
  const sources = new Map<string, string>();
  for (const item of [...prospect.evidence, ...prospect.contacts]) {
    if (item.sourceUrl) sources.set(item.sourceUrl, item.sourceName ?? hostname(item.sourceUrl));
  }

  const nextAction = intelligence?.nextBestAction || prospect.nextAction;

  return (
    <Page>
      <Link
        href={`/dashboard/sales/campaigns/${prospect.campaign.id}`}
        className="type-meta rounded-md transition-colors hover:text-ink"
      >
        ← {prospect.campaign.name}
      </Link>
      <div className="mt-6">
        <PageHeader
          eyebrow={`Sales · ${prospect.brand.name}`}
          title={prospect.name}
          description={
            [prospect.industry, prospect.city, prospect.country].filter(Boolean).join(" · ") ||
            undefined
          }
        />
      </div>

      {/* ---- cockpit: the numbers that decide whether to call now ---------- */}
      <div className="mt-6 grid gap-5 rounded-xl border border-line bg-surface p-5 sm:grid-cols-5 sm:p-6">
        <div>
          <p className="type-label">Fit</p>
          <p className="mt-1 text-[1.75rem] leading-none font-semibold tracking-[-0.03em]">
            <Score value={prospect.fitScore} />
          </p>
        </div>
        <div>
          <p className="type-label">Confidence</p>
          <p className="type-body mt-2 text-ink-2">{humanize(prospect.fitConfidence)}</p>
        </div>
        <div>
          <p className="type-label">Contactability</p>
          <div className="mt-1.5">
            <ContactabilityBadge contactability={contactability} />
          </div>
          <p className="type-meta mt-1">{contactability.channel}</p>
        </div>
        <div>
          <p className="type-label">Qualification</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <QualificationBadge qualification={qualification} flags={sales.flags} />
            {qualification?.passes && !sales.flags.length && qualification.group !== "REVIEW" ? (
              <Badge tone="neutral">{qualification.group ? humanize(qualification.group) : "Passes"}</Badge>
            ) : null}
          </div>
          <p className="type-meta mt-1">
            <PriorityLabel priority={sales.priority} />
          </p>
        </div>
        <div>
          <p className="type-label">Pipeline</p>
          <div className="mt-1.5">
            <Badge tone="accent">{humanize(prospect.status)}</Badge>
          </div>
        </div>
      </div>

      {/* ---- contact block: above the fold, whatever the tab --------------- */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_1fr_1fr]">
        <div className="rounded-xl border border-line bg-surface p-5">
          <p className="type-label">Recommended contact</p>
          {entry ? (
            <div className="mt-2 grid gap-1.5">
              <p className="text-[1.0625rem] font-medium tracking-[-0.01em] text-ink">{entry.name}</p>
              <p className="type-meta">
                {[entry.jobTitle, entry.decisionRole !== "UNKNOWN" ? humanize(entry.decisionRole) : null]
                  .filter(Boolean)
                  .join(" · ") || "Role not stated"}
              </p>
              {entry.phone ? (
                <div className="mt-1">
                  <Phone value={entry.phone} strong />
                </div>
              ) : contactability.companyPhone ? (
                <p className="type-meta mt-1">No direct line — call the switchboard and ask for {entry.name}.</p>
              ) : null}
              {entry.email ? (
                <a href={`mailto:${entry.email}`} className="type-body break-all text-accent-ink hover:text-accent-strong">
                  {entry.email}
                </a>
              ) : null}
              {entry.linkedinUrl ? (
                <a href={entry.linkedinUrl} target="_blank" rel="noreferrer noopener" className="type-meta text-accent-ink hover:text-accent-strong">
                  LinkedIn profile
                </a>
              ) : null}
              <p className="type-meta mt-1">
                {entry.reasons.length ? `Why: ${entry.reasons.join(", ")}` : null}
                {entry.differsFromPrimary ? " · differs from the stored primary contact" : ""}
              </p>
            </div>
          ) : (
            <p className="type-body mt-2 text-ink-3">No named decision-maker identified yet.</p>
          )}
        </div>

        <div className="rounded-xl border border-line bg-surface p-5">
          <p className="type-label">Company contact</p>
          <div className="mt-2 grid gap-2">
            {contactability.companyPhone ? (
              <div>
                <Phone value={contactability.companyPhone} strong />
                <p className="type-meta mt-0.5">
                  Switchboard
                  {prospect.companyPhoneSource
                    ? ` · ${PHONE_SOURCE_LABELS[prospect.companyPhoneSource] ?? humanize(prospect.companyPhoneSource)}`
                    : ""}
                  {prospect.companyPhoneSourceUrl ? (
                    <>
                      {" · "}
                      <a href={prospect.companyPhoneSourceUrl} target="_blank" rel="noreferrer noopener" className="hover:text-ink">
                        source
                      </a>
                    </>
                  ) : null}
                </p>
              </div>
            ) : !entry?.phone ? (
              <p className="type-body font-medium text-ink">No reliable phone contact identified</p>
            ) : null}
            {prospect.companyEmail ? (
              <ContactLine label="Email">
                <a href={`mailto:${prospect.companyEmail}`} className="break-all text-accent-ink hover:text-accent-strong">
                  {prospect.companyEmail}
                </a>
              </ContactLine>
            ) : null}
            {prospect.website ? (
              <ContactLine label="Website">
                <a href={prospect.website} target="_blank" rel="noreferrer noopener" className="text-accent-ink hover:text-accent-strong">
                  {hostname(prospect.website)}
                </a>
                {prospect.contactPageUrl ? (
                  <a href={prospect.contactPageUrl} target="_blank" rel="noreferrer noopener" className="type-meta ml-2 hover:text-ink">
                    contact page
                  </a>
                ) : null}
              </ContactLine>
            ) : null}
          </div>
        </div>

        <div className="rounded-xl border border-line bg-surface p-5">
          <p className="type-label">Next action</p>
          <p className="type-body mt-2 text-ink">{nextAction || <span className="text-ink-4">—</span>}</p>
          {prospect.nextActionAt ? (
            <p className="type-meta mt-1">{dateTime.format(prospect.nextActionAt)}</p>
          ) : nextDateUnconfirmed ? (
            <p className="type-meta mt-1 text-ink-2">Date needs confirmation</p>
          ) : null}
          {intelligence?.nextBestActionRationale ? (
            <p className="type-meta mt-1">{intelligence.nextBestActionRationale}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-8">
        <SalesNav active="prospects" />
        <TabNav
          active={tab}
          tabs={[
            { value: "overview", label: "Overview", href: base },
            { value: "intelligence", label: "Intelligence", href: `${base}?tab=intelligence` },
            { value: "contacts", label: "Contacts", href: `${base}?tab=contacts`, count: prospect.contacts.length },
            { value: "evidence", label: "Evidence", href: `${base}?tab=evidence`, count: active.length },
            { value: "interactions", label: "Interactions", href: `${base}?tab=interactions`, count: prospect.interactions.length },
          ]}
        />
      </div>

      {tab === "overview" ? (
        <>
          {sales.flags.length || scoringStale || qualification?.suggestedGroup || (qualification && (!qualification.passes || qualification.group)) ? (
            <Section title="Review">
              <div className="grid max-w-3xl gap-3">
                {sales.flags.length ? (
                  <ul className="grid gap-1">
                    {sales.flags.map((flag) => (
                      <li key={flag.flag} className="type-meta">
                        <span className="text-ink-2">{FLAG_LABELS[flag.flag] ?? humanize(flag.flag)}</span> · {flag.reason}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {qualification && (!qualification.passes || qualification.group) ? (
                  <p className="type-meta">
                    {qualification.group
                      ? `${humanize(qualification.group)} · ${qualification.groupReason ?? qualification.reason}`
                      : qualification.reason}
                  </p>
                ) : null}
                {scoringStale ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="type-meta text-ink-2">Qualification inputs changed since the last scoring.</span>
                    <RescoreButton prospectId={prospect.id} />
                  </div>
                ) : null}
                {qualification?.suggestedGroup ? (
                  <ConfirmGroup
                    prospectId={prospect.id}
                    group={qualification.suggestedGroup}
                    reason={qualification.suggestedGroupReason ?? ""}
                  />
                ) : null}
              </div>
            </Section>
          ) : null}

          <Section title="Summary">
            {prospect.description ? (
              <p className="type-body max-w-2xl text-ink-2">{prospect.description}</p>
            ) : null}
            <div className="mt-5">
              <Facts
                rows={[
                  { label: "Campaign", value: prospect.campaign.name },
                  { label: "Employees", value: prospect.employeeCount },
                  { label: "Fleet size", value: prospect.fleetSize },
                  { label: "Revenue", value: prospect.revenue },
                  { label: "Owner", value: prospect.owner },
                  { label: "Activities", value: prospect.activities.join(" · ") },
                  { label: "Locations", value: prospect.locations.join(" · ") },
                ]}
              />
            </div>
            {prospect.notes ? (
              <p className="type-meta mt-4 max-w-2xl whitespace-pre-line">{prospect.notes}</p>
            ) : null}
            <Disclosure summary="Edit company data" className="mt-6">
              <Panel className="mt-4">
                <form action={updateProspect.bind(null, prospect.id)} className="grid gap-5">
                  <ProspectFields prospect={prospect} />
                  <div>
                    <Button type="submit">Save prospect</Button>
                  </div>
                </form>
              </Panel>
            </Disclosure>
          </Section>

          <Section title="Why this prospect">
            {intelligence?.whyThisProspect ? (
              <Paragraphs text={intelligence.whyThisProspect} />
            ) : explanation ? (
              <p className="type-body max-w-2xl text-ink-2 whitespace-pre-line">{explanation}</p>
            ) : (
              <NotGenerated />
            )}
            <ul className="type-meta mt-4 flex flex-wrap gap-x-4 gap-y-1">
              {sales.priority.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </Section>

          <Section title="Digital maturity">
            <div className="flex flex-wrap items-baseline gap-x-6">
              <p className="text-[1.5rem] font-semibold tracking-[-0.03em]">
                <Score value={prospect.digitalMaturityScore} />
              </p>
              <p className="type-meta">
                {[prospect.tms && `TMS ${prospect.tms}`, prospect.erp && `ERP ${prospect.erp}`, prospect.telematics && `Telematics ${prospect.telematics}`]
                  .filter(Boolean)
                  .join(" · ") || "No tooling recorded."}
              </p>
            </div>
            <Disclosure summary="Details and edit" className="mt-5">
              <div className="mt-4">
                <Facts
                  rows={[
                    { label: "TMS", value: prospect.tms },
                    { label: "ERP", value: prospect.erp },
                    { label: "CRM", value: prospect.crm },
                    { label: "Telematics", value: prospect.telematics },
                    { label: "Client portal", value: prospect.clientPortal },
                    { label: "Driver app", value: prospect.driverApp },
                  ]}
                />
              </div>
              <div className="mt-6 grid gap-6 sm:grid-cols-2">
                <div>
                  <p className="type-label mb-2">Detected tools</p>
                  <BulletList items={prospect.detectedTools} empty="None recorded." />
                </div>
                <div>
                  <p className="type-label mb-2">Visible automations</p>
                  <BulletList items={prospect.visibleAutomations} empty="None recorded." />
                </div>
              </div>
              <form
                action={updateDigitalMaturity.bind(null, prospect.id)}
                className="mt-6 grid max-w-3xl gap-4 rounded-xl border border-line bg-subtle p-5"
              >
                <Field
                  label="Score"
                  name="digitalMaturityScore"
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={prospect.digitalMaturityScore ?? ""}
                />
                <div className="grid gap-5 sm:grid-cols-3">
                  <Field label="TMS" name="tms" defaultValue={prospect.tms ?? ""} />
                  <Field label="ERP" name="erp" defaultValue={prospect.erp ?? ""} />
                  <Field label="CRM" name="crm" defaultValue={prospect.crm ?? ""} />
                  <Field label="Telematics" name="telematics" defaultValue={prospect.telematics ?? ""} />
                  <Field label="Client portal" name="clientPortal" defaultValue={prospect.clientPortal ?? ""} />
                  <Field label="Driver app" name="driverApp" defaultValue={prospect.driverApp ?? ""} />
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <TextArea label="Detected tools" name="detectedTools" hint="one per line" rows={3} defaultValue={formatList(prospect.detectedTools)} />
                  <TextArea label="Visible automations" name="visibleAutomations" hint="one per line" rows={3} defaultValue={formatList(prospect.visibleAutomations)} />
                </div>
                <div>
                  <Button type="submit" size="sm">
                    Save digital maturity
                  </Button>
                </div>
              </form>
            </Disclosure>
          </Section>

          <Section title="Pipeline">
            <form
              action={updatePipeline.bind(null, prospect.id)}
              className="grid max-w-3xl gap-4 sm:grid-cols-[1fr_2fr_1fr_auto] sm:items-end"
            >
              <Select label="Status" name="status" defaultValue={prospect.status}>
                {PROSPECT_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {humanize(value)}
                  </option>
                ))}
              </Select>
              <Field label="Next action" name="nextAction" defaultValue={prospect.nextAction ?? ""} />
              <Field label="Due" name="nextActionAt" type="date" defaultValue={toDateInput(prospect.nextActionAt)} />
              <Button type="submit" variant="secondary">
                Update
              </Button>
            </form>
            {prospect.lastContactAt ? (
              <p className="type-meta mt-3">Last contact {dateTime.format(prospect.lastContactAt)}</p>
            ) : null}
          </Section>

          <Section title="Prospect">
            {prospect.interactions.length ? (
              <p className="type-meta text-ink-4">
                This prospect has recorded interactions and cannot be deleted. Mark it disqualified instead.
              </p>
            ) : (
              <ConfirmDelete
                action={deleteProspect.bind(null, prospect.id)}
                label="Delete prospect"
                question="Delete this prospect permanently?"
              />
            )}
          </Section>
        </>
      ) : null}

      {tab === "intelligence" ? (
        <>
          <div className="mt-6 grid gap-3">
            {stale && learnedSinceBrief ? (
              <p className="type-body text-ink">New interaction data available — Refresh intelligence</p>
            ) : null}
            {languageMismatch ? (
              <p className="type-body max-w-3xl rounded-lg border border-line-strong bg-subtle px-4 py-3 text-ink">
                This brief was written in {scriptLanguage}. Sales Intelligence is now French-only — refresh intelligence
                to regenerate it in French.
              </p>
            ) : null}
            <GenerateIntelligence
              prospectId={prospect.id}
              generated={Boolean(intelligence)}
              stale={stale || languageMismatch}
              generatedLabel={
                intelligence
                  ? new Intl.DateTimeFormat("en-GB", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(intelligence.generatedAt)
                  : null
              }
            />
          </div>

          <div className="mt-6 flex flex-wrap gap-1.5">
            {VIEWS.map((value) => (
              <Link
                key={value}
                href={`${base}?tab=intelligence&view=${value}`}
                aria-current={value === view ? "page" : undefined}
                className={
                  value === view
                    ? "rounded-full bg-accent-soft px-3 py-1.5 text-[0.8125rem] font-medium text-accent-ink"
                    : "rounded-full px-3 py-1.5 text-[0.8125rem] text-ink-3 transition-colors hover:bg-sunken hover:text-ink"
                }
              >
                {{ qualification: "Qualification", call: "Call prep", objections: "Objections" }[value]}
              </Link>
            ))}
          </div>

          {view === "qualification" ? (
            <>
              <Section title="Likely pain points">
                {painPointsAi.length ? (
                  <ol className="max-w-2xl divide-y divide-line">
                    {painPointsAi.map((item) => (
                      <li key={item.pain} className="py-3 first:pt-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <EvidenceTypeBadge type={item.basis} />
                          <span className="type-meta">{humanize(item.confidence)} confidence</span>
                        </div>
                        <p className={item.basis === "INFERENCE" ? "type-body mt-1.5 font-medium text-ink italic" : "type-body mt-1.5 font-medium text-ink"}>
                          {item.pain}
                        </p>
                        <p className="type-meta mt-1">{item.rationale}</p>
                      </li>
                    ))}
                  </ol>
                ) : painPoints.length ? (
                  <EvidenceList prospectId={prospect.id} items={painPoints} empty="" />
                ) : (
                  <NotGenerated />
                )}
              </Section>

              <Section title="Fit scoring">
                {factors.length ? (
                  <>
                    <ul className="max-w-2xl divide-y divide-line">
                      {factors.map((factor) => (
                        <li key={factor.label} className="flex items-start gap-4 py-2">
                          <span
                            className={
                              factor.applied > 0
                                ? "w-12 shrink-0 font-semibold tabular-nums text-accent-ink"
                                : factor.applied < 0
                                  ? "w-12 shrink-0 font-semibold tabular-nums text-ink"
                                  : "w-12 shrink-0 tabular-nums text-ink-4"
                            }
                          >
                            {factor.applied > 0 ? `+${factor.applied}` : factor.applied}
                          </span>
                          <span className="min-w-0">
                            <span className="type-body text-ink-2">{factor.label}</span>
                            <span className="type-meta block">
                              {factor.assessment ? `${humanize(factor.assessment)} · ` : ""}
                              {humanize(factor.basis)}
                              {factor.evidenceRefs.length ? ` · ${factor.evidenceRefs.join(", ")}` : ""}
                              {factor.note ? ` · ${factor.note}` : ""}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                    {confidenceNotes.length ? (
                      <div className="mt-4 max-w-2xl">
                        <p className="type-label">Why the confidence is {humanize(prospect.fitConfidence).toLowerCase()}</p>
                        <ul className="type-meta mt-2 list-disc space-y-1 pl-5">
                          {confidenceNotes.map((note) => (
                            <li key={note}>{note}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <NotGenerated />
                )}
                <Disclosure summary="Edit qualification" className="mt-6">
                  <form
                    action={updateQualification.bind(null, prospect.id)}
                    className="mt-3 grid max-w-3xl gap-4 rounded-xl border border-line bg-subtle p-5"
                  >
                    <div className="grid gap-5 sm:grid-cols-2">
                      <Field label="Fit score" name="fitScore" type="number" min={0} max={100} defaultValue={prospect.fitScore ?? ""} />
                      <Select label="Confidence" name="fitConfidence" defaultValue={prospect.fitConfidence}>
                        {CONFIDENCES.map((value) => (
                          <option key={value} value={value}>
                            {humanize(value)}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <TextArea label="Explanation" name="fitExplanation" rows={3} defaultValue={explanation} />
                    <div>
                      <Button type="submit" size="sm">
                        Save qualification
                      </Button>
                    </div>
                  </form>
                </Disclosure>
              </Section>

              <Section title="Qualification priorities">
                {priorities.length ? (
                  <ol className="max-w-2xl divide-y divide-line">
                    {priorities.map((item, index) => (
                      <li key={item.question} className="flex gap-4 py-2.5">
                        <span className="type-meta w-5 shrink-0 tabular-nums">{index + 1}</span>
                        <span className="min-w-0">
                          <span className="type-body text-ink">{item.question}</span>
                          <span className="type-meta block">
                            {humanize(item.impact)} impact · {item.whyItMatters}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <NotGenerated />
                )}
              </Section>

              <Section title="Estimated ticket">
                {intelligence ? (
                  <>
                    <p className="text-[1.25rem] font-semibold tracking-[-0.02em]">
                      {formatTicket(intelligence.estimatedTicketMin, intelligence.estimatedTicketMax, intelligence.estimatedTicketCurrency) ||
                        "Informations insuffisantes"}
                    </p>
                    {intelligence.estimatedTicketMin !== null || intelligence.estimatedTicketMax !== null ? (
                      <p className="type-meta mt-2 max-w-2xl">{intelligence.estimatedTicketBasis}</p>
                    ) : null}
                  </>
                ) : (
                  <NotGenerated />
                )}
              </Section>
            </>
          ) : null}

          {view === "call" ? (
            <>
              <Section title="Commercial angle">
                {intelligence?.commercialAngle ? (
                  <p className="type-body max-w-2xl text-ink">{intelligence.commercialAngle}</p>
                ) : (
                  <NotGenerated />
                )}
              </Section>
              <Section title="Gatekeeper script">
                {intelligence ? (
                  <div className="max-w-2xl rounded-lg bg-subtle p-4">
                    <p className="type-body text-ink">{gatekeeper.opening}</p>
                    {gatekeeper.ifAskedWhy ? (
                      <>
                        <p className="type-label mt-4">
                          If asked « C’est à quel sujet ? »
                        </p>
                        <p className="type-body mt-1 text-ink">{gatekeeper.ifAskedWhy}</p>
                      </>
                    ) : null}
                  </div>
                ) : (
                  <NotGenerated />
                )}
              </Section>
              <Section title="Decision-maker opening">
                {intelligence ? (
                  <div className="max-w-2xl rounded-lg bg-subtle p-4">
                    <p className="type-body text-ink whitespace-pre-line">{intelligence.decisionMakerOpening}</p>
                  </div>
                ) : (
                  <NotGenerated />
                )}
              </Section>
              <Section title="Discovery questions">
                {discoveryQuestions.length ? (
                  <ol className="type-body max-w-2xl list-decimal space-y-2 pl-5 text-ink-2">
                    {discoveryQuestions.map((question) => (
                      <li key={question}>{question}</li>
                    ))}
                  </ol>
                ) : (
                  <NotGenerated />
                )}
              </Section>
            </>
          ) : null}

          {view === "objections" ? (
            <>
              <Section title="Objections" hint={`${objections.length}`}>
                {objections.length ? (
                  <dl className="max-w-2xl divide-y divide-line">
                    {objections.map((item) => (
                      <div key={item.objection} className="py-3">
                        <dt className="type-body font-medium text-ink">« {item.objection} »</dt>
                        <dd className="type-body mt-1 text-ink-2">{item.response}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <NotGenerated />
                )}
              </Section>
              <Section title="Negotiation levers">
                {arrayOf(intelligence?.negotiationLevers).length ? (
                  <ul className="max-w-2xl divide-y divide-line">
                    {arrayOf<{ lever: string; rationale: string }>(intelligence?.negotiationLevers).map((item) => (
                      <li key={item.lever} className="py-2.5">
                        <p className="type-body font-medium text-ink">{item.lever}</p>
                        <p className="type-meta mt-0.5">{item.rationale}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <NotGenerated />
                )}
              </Section>
            </>
          ) : null}
        </>
      ) : null}

      {tab === "contacts" ? (
        <Section title="Contacts" hint={`${prospect.contacts.length}`}>
          {entry ? (
            <div className="mb-6 max-w-2xl rounded-lg bg-subtle px-4 py-3">
              <p className="type-label">Recommended entry point</p>
              <p className="type-body mt-1 text-ink">
                {entry.name}
                {entry.jobTitle ? ` · ${entry.jobTitle}` : ""}
              </p>
              <p className="type-meta mt-1">
                {entry.reasons.join(", ")}
                {intelligence?.entryPointRationale ? ` · ${intelligence.entryPointRationale}` : ""}
              </p>
              {entry.differsFromPrimary ? (
                <p className="type-meta mt-1">The stored primary contact is someone else; it is not changed automatically.</p>
              ) : null}
            </div>
          ) : null}
          {prospect.contacts.length ? (
            <ul className="divide-y divide-line">
              {prospect.contacts.map((contact) => {
                const assessment = assessments.get(contact.id);
                return (
                  <ContactRow
                    key={contact.id}
                    prospectId={prospect.id}
                    contact={contact}
                    assessment={
                      [
                        entry?.contactId === contact.id ? "Recommended entry point" : null,
                        assessment ? `${humanize(assessment.priority)} contact priority · ${assessment.relevance}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || null
                    }
                  />
                );
              })}
            </ul>
          ) : (
            <p className="type-meta text-ink-4">No named contacts yet.</p>
          )}
          <Disclosure summary="Add a contact" tone="accent" className="mt-6">
            <form
              action={addContact.bind(null, prospect.id)}
              className="mt-3 grid max-w-3xl gap-4 rounded-xl border border-line bg-subtle p-5"
            >
              <ContactFields />
              <div>
                <Button type="submit" size="sm">
                  Add contact
                </Button>
              </div>
            </form>
          </Disclosure>
        </Section>
      ) : null}

      {tab === "evidence" ? (
        <>
          <Section title="Facts" hint={`${facts.length}`}>
            <EvidenceList prospectId={prospect.id} items={facts} empty="No facts recorded yet." />
          </Section>
          <Section title="Inferences" hint={`${inferences.length}`}>
            <EvidenceList
              prospectId={prospect.id}
              items={inferences}
              empty="No inferences recorded. An inference is reasoning, never a fact."
            />
          </Section>
          <Section title="Unknowns" hint={`${unknowns.length}`}>
            <EvidenceList prospectId={prospect.id} items={unknowns} empty="Nothing flagged as still to qualify." />
            {history.length ? (
              <Disclosure summary={`Evidence history · ${history.length}`} className="mt-6">
                <ul className="mt-3 max-w-2xl divide-y divide-line">
                  {history.map((item) => {
                    const by = evidenceById.get(item.resolvedById ?? item.supersededById ?? "");
                    return (
                      <li key={item.id} className="py-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <EvidenceTypeBadge type={item.type} />
                          <span className="type-meta">
                            {item.resolvedAt ? "Resolved" : "Superseded"}{" "}
                            {dateTime.format(item.resolvedAt ?? item.supersededAt!)}
                          </span>
                        </div>
                        <p className="type-body mt-1 text-ink-3 line-through decoration-ink-4">{item.statement}</p>
                        {by ? <p className="type-meta mt-0.5">By: {by.statement}</p> : null}
                      </li>
                    );
                  })}
                </ul>
              </Disclosure>
            ) : null}
            <Disclosure summary="Add evidence" tone="accent" className="mt-6">
              <form
                action={addEvidence.bind(null, prospect.id)}
                className="mt-3 grid max-w-3xl gap-4 rounded-xl border border-line bg-subtle p-5"
              >
                <p className="type-meta">
                  A fact carries its source. An inference is reasoning. An unknown is a gap to close in conversation.
                </p>
                <EvidenceFields />
                <div>
                  <Button type="submit" size="sm">
                    Add evidence
                  </Button>
                </div>
              </form>
            </Disclosure>
          </Section>
          <Section title="Sources" hint={`${sources.size}`}>
            {sources.size ? (
              <ul className="space-y-1.5">
                {[...sources.entries()].map(([url, name]) => (
                  <li key={url} className="type-body">
                    <a href={url} target="_blank" rel="noreferrer noopener" className="text-accent-ink transition-colors hover:text-accent-strong">
                      {name}
                    </a>
                    <span className="type-meta ml-2 break-all">{url}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="type-meta text-ink-4">No sources recorded yet.</p>
            )}
          </Section>
        </>
      ) : null}

      {tab === "interactions" ? (
        <Section title="Interactions" hint={`${prospect.interactions.length}`}>
          <form
            action={addInteraction.bind(null, prospect.id)}
            className="grid max-w-3xl gap-4 rounded-xl border border-line bg-subtle p-5"
          >
            <div className="grid gap-5 sm:grid-cols-3">
              <Select label="Type" name="type" defaultValue="NOTE">
                {INTERACTION_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {humanize(value)}
                  </option>
                ))}
              </Select>
              <Field label="When" name="occurredAt" type="date" defaultValue={toDateInput(new Date())} />
              <Select label="Contact" name="contactId" defaultValue="">
                <option value="">No specific contact</option>
                {prospect.contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contactName(contact)}
                  </option>
                ))}
              </Select>
            </div>
            <TextArea label="What happened" name="rawNote" required rows={3} />
            <div className="grid gap-5 sm:grid-cols-3">
              <Select label="Moves the prospect to" name="resultingStatus" defaultValue="">
                <option value="">No status change</option>
                {PROSPECT_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {humanize(value)}
                  </option>
                ))}
              </Select>
              <Field label="Next action" name="nextAction" />
              <Field label="Due" name="nextActionAt" type="date" />
            </div>
            <div>
              <Button type="submit" size="sm">
                Add interaction
              </Button>
            </div>
          </form>

          {prospect.interactions.length ? (
            <ol className="mt-8 divide-y divide-line">
              {prospect.interactions.map((interaction) => (
                <li key={interaction.id} className="py-4 first:pt-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <Badge tone="neutral">{humanize(interaction.type)}</Badge>
                    <span className="type-meta">
                      {dateTime.format(interaction.occurredAt)}
                      {interaction.contact ? ` · ${contactName(interaction.contact)}` : ""}
                    </span>
                    {interaction.resultingStatus && interaction.resultingStatus !== interaction.previousStatus ? (
                      <span className="type-meta">
                        {humanize(interaction.previousStatus)} → {humanize(interaction.resultingStatus)}
                      </span>
                    ) : null}
                  </div>
                  <p className="type-body mt-2 max-w-2xl whitespace-pre-line text-ink-2">{interaction.rawNote}</p>
                  {interaction.nextAction ? (
                    <p className="type-meta mt-1.5">
                      Next: {interaction.nextAction}
                      {interaction.nextActionAt ? ` · ${dateTime.format(interaction.nextActionAt)}` : ""}
                    </p>
                  ) : null}

                  {interaction.analysisStatus === "PROPOSED" && interaction.analysis ? (
                    <AnalysisPanel
                      interactionId={interaction.id}
                      analysis={interaction.analysis as unknown as Analysis}
                      contactNames={contactNames}
                    />
                  ) : interaction.analysisStatus === "APPLIED" ? (
                    (() => {
                      const outcome = (interaction.outcome ?? {}) as {
                        applied?: number;
                        appliedIds?: string[];
                        skipped?: string[];
                        fitBefore?: number | null;
                        fitAfter?: number | null;
                        confidenceBefore?: string;
                        confidenceAfter?: string;
                        pipelineBefore?: string;
                        pipelineAfter?: string;
                        nextAction?: string | null;
                        rescoreError?: string | null;
                      };
                      const analysis = interaction.analysis as unknown as Analysis | null;
                      const learned = prospect.evidence.filter((item) => item.interactionId === interaction.id);
                      return (
                        <div className="mt-3">
                          <p className="type-meta">
                            <span className="font-medium text-ink-2">Applied</span> · {outcome.applied ?? 0} change
                            {outcome.applied === 1 ? "" : "s"}
                            {` · fit ${outcome.fitBefore ?? "—"} → ${outcome.fitAfter ?? "—"}`}
                            {` · confidence ${humanize(outcome.confidenceBefore)} → ${humanize(outcome.confidenceAfter)}`}
                            {outcome.pipelineBefore && outcome.pipelineAfter && outcome.pipelineBefore !== outcome.pipelineAfter
                              ? ` · ${humanize(outcome.pipelineBefore)} → ${humanize(outcome.pipelineAfter)}`
                              : ""}
                          </p>
                          {outcome.rescoreError ? <p className="type-meta mt-1 text-ink-2">{outcome.rescoreError}</p> : null}
                          <Disclosure summary="What changed" className="mt-2">
                            <ul className="type-meta mt-2 max-w-2xl list-disc space-y-1 pl-5">
                              {learned.map((item) => (
                                <li key={item.id}>New fact: {item.statement}</li>
                              ))}
                              {(analysis?.proposals ?? [])
                                .filter((p: Proposal) => p.kind !== "NEW_FACT" && (outcome.appliedIds ?? []).includes(p.id))
                                .map((p: Proposal) => (
                                  <li key={p.id}>{describeProposal(p)}</li>
                                ))}
                              {(outcome.skipped ?? []).map((line) => (
                                <li key={line}>Skipped: {line}</li>
                              ))}
                              {outcome.nextAction ? <li>Next action now: {outcome.nextAction}</li> : null}
                            </ul>
                          </Disclosure>
                        </div>
                      );
                    })()
                  ) : (
                    <AnalyzeInteraction
                      interactionId={interaction.id}
                      failed={interaction.analysisStatus === "FAILED" ? interaction.analysisError : null}
                    />
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className="type-meta mt-6 text-ink-4">No interactions recorded yet.</p>
          )}
        </Section>
      ) : null}
    </Page>
  );
}
