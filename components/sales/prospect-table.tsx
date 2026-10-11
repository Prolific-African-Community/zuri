import { cn } from "@/lib/cn";
import type { Contactability, ContactabilityLevel } from "@/lib/contactability";
import { parsePhone } from "@/lib/phone";
import { humanize } from "@/lib/sales";
import type { SalesView } from "@/lib/sales-view";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The Sales prospect list, shared by the global Prospects page and a
 * campaign's prospects. One visual hierarchy everywhere: the name first, then
 * fit and who to call, then the quieter context (reach, campaign, country,
 * status). A grid table on wide screens (xl), stacked cards on narrow ones — same data.
 */

export type ProspectRow = {
  id: string;
  name: string;
  country: string | null;
  city?: string | null;
  status: string;
  fitScore: number | null;
  fitConfidence: string;
  campaign?: { id: string; name: string } | null;
  view: SalesView;
};

type Tone = "accent" | "neutral" | "outline" | "quiet" | "strong";

const TONES: Record<Tone, string> = {
  accent: "bg-accent-soft text-accent-ink",
  neutral: "bg-sunken text-ink-2",
  outline: "text-ink-3 ring-1 ring-line-strong ring-inset",
  quiet: "text-ink-4 ring-1 ring-line ring-inset",
  strong: "text-ink ring-1 ring-ink/70 ring-inset",
};

function Pill({ tone, children, title }: { tone: Tone; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-5 items-center rounded-full px-2 text-[0.6875rem] leading-none font-medium whitespace-nowrap",
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

const REACH: Record<ContactabilityLevel, { label: string; tone: Tone }> = {
  HIGH: { label: "High reach", tone: "accent" },
  MEDIUM: { label: "Medium reach", tone: "neutral" },
  LOW: { label: "Low reach", tone: "outline" },
  NONE: { label: "No contact", tone: "quiet" },
};

const CLOSED_LOST = ["LOST", "DISQUALIFIED"];
const ADVANCED = ["MEETING_BOOKED", "DISCOVERY_COMPLETED", "PROPOSAL", "NEGOTIATION", "WON"];

function statusTone(status: string): Tone {
  if (CLOSED_LOST.includes(status)) return "quiet";
  if (ADVANCED.includes(status)) return "accent";
  if (status === "DISCOVERED") return "outline";
  return "neutral";
}

/** The qualification cue under a name: fails, review, or a confirmed keep. Nothing when clean. */
function QualificationPill({ view }: { view: SalesView }) {
  const q = view.qualification;
  if (!q) return null;
  if (!q.passes || q.group === "REMOVE") {
    return (
      <Pill tone="strong" title={q.groupReason ?? q.reason}>
        {q.group === "REMOVE" ? "Remove" : "Fails qualification"}
      </Pill>
    );
  }
  if (q.group === "REVIEW" || (!q.group && view.flags.length)) {
    return (
      <Pill tone="outline" title={q.groupReason ?? (view.flags.map((flag) => flag.reason).join(" · ") || q.reason)}>
        Review
      </Pill>
    );
  }
  if (q.group === "KEEP") return <Pill tone="neutral">Keep</Pill>;
  return null;
}

function PriorityPill({ view }: { view: SalesView }) {
  const { label, reasons } = view.priority;
  if (label === "LOW") return null;
  return (
    <Pill tone={label === "HIGH" ? "accent" : "neutral"} title={reasons.join(" · ")}>
      {label === "HIGH" ? "High priority" : "Medium priority"}
    </Pill>
  );
}

const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

/** Who to call: a name or "Switchboard" above, the number below and prominent. */
function CallCell({ contactability }: { contactability: Contactability }) {
  const entry = contactability.entryPoint;
  const phone = entry?.phone ?? contactability.companyPhone;
  if (!phone) {
    return (
      <div className="min-w-0">
        <p className="truncate text-[0.8125rem] text-ink-3">{entry ? entry.name : "No named contact"}</p>
        <p className="text-[0.8125rem] text-ink-4">No phone</p>
      </div>
    );
  }
  const who = entry?.phone ? entry.name : entry ? `Switchboard · ask for ${entry.name}` : "Switchboard";
  return (
    <div className="min-w-0">
      <p className="truncate text-[0.8125rem] text-ink-3" title={who}>
        {who}
      </p>
      <a
        href={telHref(phone)}
        className="relative z-10 inline-block text-[0.9375rem] font-semibold tracking-[-0.01em] whitespace-nowrap text-ink tabular-nums transition-colors hover:text-accent-ink"
      >
        {parsePhone(phone, "PLAIN_TEXT")?.display ?? phone}
      </a>
    </div>
  );
}

function FitCell({ row }: { row: ProspectRow }) {
  return (
    <div>
      <p className="leading-none whitespace-nowrap">
        <span
          className={cn(
            "text-[1.125rem] font-semibold tracking-[-0.02em] tabular-nums",
            row.fitScore === null ? "text-ink-4" : "text-ink",
          )}
        >
          {row.fitScore ?? "—"}
        </span>
        {row.fitScore !== null ? <span className="ml-0.5 text-[0.75rem] text-ink-4">/100</span> : null}
      </p>
      <p className="mt-1 text-[0.75rem] whitespace-nowrap text-ink-4" title={`${humanize(row.fitConfidence)} confidence`}>
        {humanize(row.fitConfidence)} conf.
      </p>
    </div>
  );
}

// Laptop widths (xl) carry reach inside the Call cell; wide screens (2xl) give it its own column.
const COLUMNS_WITH_CAMPAIGN =
  "xl:grid-cols-[minmax(9rem,2fr)_5.75rem_minmax(10rem,1.5fr)_minmax(7rem,1fr)_5.5rem_6.75rem] " +
  "2xl:grid-cols-[minmax(11rem,2fr)_5.75rem_6.5rem_minmax(10rem,1.5fr)_minmax(8rem,1fr)_5.75rem_6.75rem]";
const COLUMNS_WITHOUT_CAMPAIGN =
  "xl:grid-cols-[minmax(10rem,2.4fr)_5.75rem_minmax(10rem,1.8fr)_5.5rem_6.75rem] " +
  "2xl:grid-cols-[minmax(12rem,2.4fr)_5.75rem_6.5rem_minmax(10rem,1.8fr)_5.75rem_6.75rem]";

export function ProspectTable({ rows, showCampaign = true }: { rows: ProspectRow[]; showCampaign?: boolean }) {
  const columns = showCampaign ? COLUMNS_WITH_CAMPAIGN : COLUMNS_WITHOUT_CAMPAIGN;
  const headers = ["Prospect", "Fit", "Reach", "Call", ...(showCampaign ? ["Campaign"] : []), "Country", "Status"];

  return (
    <div role="table" aria-label="Prospects" className="text-left">
      <div
        role="row"
        className={cn(
          "hidden gap-x-5 border-b border-line px-4 pb-2.5 text-[0.6875rem] font-medium tracking-[0.06em] text-ink-4 uppercase xl:grid",
          columns,
        )}
      >
        {headers.map((header) => (
          <span key={header} role="columnheader" className={header === "Reach" ? "hidden 2xl:block" : undefined}>
            {header}
          </span>
        ))}
      </div>

      <ul className="divide-y divide-line">
        {rows.map((row) => {
          const href = `/dashboard/sales/prospects/${row.id}`;
          const reach = REACH[row.view.contactability.level];
          return (
            <li
              key={row.id}
              role="row"
              className={cn(
                "group relative grid gap-x-5 gap-y-3 rounded-lg px-4 py-4 transition-colors duration-150 hover:bg-subtle",
                "grid-cols-[1fr_auto] xl:items-center",
                columns,
              )}
            >
              {/* Prospect — the strongest text in the row. The whole row opens it. */}
              <div role="cell" className="min-w-0">
                <Link
                  href={href}
                  className="line-clamp-2 text-[0.9375rem] leading-snug font-semibold tracking-[-0.01em] break-words text-ink after:absolute after:inset-0 after:rounded-lg after:content-[''] group-hover:text-accent-ink"
                  title={row.name}
                >
                  {row.name}
                </Link>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <QualificationPill view={row.view} />
                  <PriorityPill view={row.view} />
                  {/* Narrow screens: context the hidden columns carry on wide ones. */}
                  <span className="xl:hidden">
                    <Pill tone={statusTone(row.status)}>{humanize(row.status)}</Pill>
                  </span>
                  <span className="basis-full text-[0.75rem] text-ink-4 xl:hidden">
                    {[showCampaign ? row.campaign?.name : null, row.country].filter(Boolean).join(" · ")}
                  </span>
                </div>
              </div>

              <div role="cell" className="justify-self-end text-right xl:justify-self-auto xl:text-left">
                <FitCell row={row} />
              </div>

              <div role="cell" className="hidden 2xl:block">
                <Pill tone={reach.tone} title={row.view.contactability.channel}>
                  {reach.label}
                </Pill>
              </div>

              <div role="cell" className="col-span-2 min-w-0 xl:col-span-1">
                <div className="flex items-end justify-between gap-3 rounded-md bg-subtle px-3 py-2 group-hover:bg-sunken xl:block xl:bg-transparent xl:p-0 xl:group-hover:bg-transparent">
                  <CallCell contactability={row.view.contactability} />
                  <span className="shrink-0 xl:mt-1.5 xl:block 2xl:hidden">
                    <Pill tone={reach.tone}>{reach.label}</Pill>
                  </span>
                </div>
              </div>

              {showCampaign ? (
                <div role="cell" className="hidden min-w-0 xl:block">
                  {row.campaign ? (
                    <Link
                      href={`/dashboard/sales/campaigns/${row.campaign.id}`}
                      className="relative z-10 line-clamp-2 text-[0.8125rem] text-ink-3 transition-colors hover:text-ink"
                    >
                      {row.campaign.name}
                    </Link>
                  ) : (
                    <span className="text-[0.8125rem] text-ink-4">—</span>
                  )}
                </div>
              ) : null}

              <div role="cell" className="hidden truncate text-[0.8125rem] text-ink-3 xl:block">
                {row.country ?? <span className="text-ink-4">—</span>}
              </div>

              <div role="cell" className="hidden xl:block">
                <Pill tone={statusTone(row.status)}>{humanize(row.status)}</Pill>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
