import { cn } from "@/lib/cn";
import type { CommercialPriority, Contactability, ContactabilityLevel } from "@/lib/contactability";
import type { Qualification } from "@/lib/sales";
import Link from "next/link";
import type { ReactNode } from "react";

/** Campaigns and Prospects are one module; the switch between them is quiet. */
export function SalesNav({ active }: { active: "campaigns" | "prospects" }) {
  const items = [
    { value: "campaigns", label: "Campaigns", href: "/dashboard/sales/campaigns" },
    { value: "prospects", label: "Prospects", href: "/dashboard/sales/prospects" },
  ] as const;

  return (
    <nav className="mb-8 flex gap-1" aria-label="Sales">
      {items.map((item) => (
        <Link
          key={item.value}
          href={item.href}
          aria-current={item.value === active ? "page" : undefined}
          className={cn(
            "rounded-full px-3 py-1.5 text-[0.8125rem] transition-colors duration-200",
            item.value === active
              ? "bg-accent-soft font-medium text-accent-ink"
              : "text-ink-3 hover:bg-sunken hover:text-ink",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

/** Label / value pairs; an empty value shows a dash, never invented text. */
export function Facts({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.label} className="min-w-0">
          <dt className="type-label">{row.label}</dt>
          <dd className="type-body mt-1 break-words text-ink-2">
            {row.value === null || row.value === undefined || row.value === ""
              ? <span className="text-ink-4">—</span>
              : row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function BulletList({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <p className="type-meta text-ink-4">{empty}</p>;
  return (
    <ul className="type-body list-disc space-y-1 pl-5 text-ink-2">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

/**
 * The three kinds of evidence must never look alike: a fact is solid, an
 * inference is outlined and italic, an unknown is dashed and reads as a gap.
 */
export function EvidenceTypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    FACT: "bg-ink text-white",
    INFERENCE: "bg-transparent text-accent-ink ring-1 ring-accent/50 ring-inset italic",
    UNKNOWN: "bg-transparent text-ink-3 border border-dashed border-ink-4",
  };
  const labels: Record<string, string> = {
    FACT: "Fact",
    INFERENCE: "Inference",
    UNKNOWN: "Unknown",
  };
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[0.6875rem] font-medium tracking-[0.02em] uppercase",
        styles[type] ?? styles.UNKNOWN,
      )}
    >
      {labels[type] ?? type}
    </span>
  );
}

/** A section the research engine will fill; until then it says so plainly. */
export function NotYetResearched({ what }: { what: string }) {
  return (
    <p className="type-meta rounded-lg border border-dashed border-line-strong px-4 py-3 text-ink-4">
      No {what} yet. The research engine fills this in once it is available.
    </p>
  );
}

export function Score({ value, label }: { value: number | null; label?: string }) {
  if (value === null) return <span className="text-ink-4">—</span>;
  return (
    <span className="tabular-nums">
      {value}
      <span className="text-ink-4">/100</span>
      {label ? <span className="type-meta ml-1.5">{label}</span> : null}
    </span>
  );
}

/**
 * A prospect that fails its campaign's rules, or needs a decision, says so
 * wherever it is listed — it is never silently shown as a qualified result.
 */
export function QualificationBadge({
  qualification,
  flags,
}: {
  qualification: Qualification | null;
  /** Flags to judge by, when live flags are known; the stored ones otherwise. */
  flags?: { flag: string; reason: string }[];
}) {
  if (!qualification) return null;
  qualification = flags ? { ...qualification, flags } : qualification;
  if (!qualification.passes || qualification.group === "REMOVE") {
    return (
      <span
        title={qualification.groupReason ?? qualification.reason}
        className="inline-flex items-center rounded-full bg-transparent px-2.5 py-0.5 text-[0.6875rem] font-medium tracking-[0.02em] text-ink uppercase ring-1 ring-ink ring-inset"
      >
        Fails qualification
      </span>
    );
  }
  if (qualification.group === "REVIEW" || (!qualification.group && qualification.flags.length)) {
    return (
      <span
        title={qualification.groupReason ?? (qualification.flags.map((entry) => entry.reason).join(" ") || qualification.reason)}
        className="inline-flex items-center rounded-full bg-transparent px-2.5 py-0.5 text-[0.6875rem] font-medium tracking-[0.02em] text-ink-3 uppercase ring-1 ring-line-strong ring-inset"
      >
        Review
      </span>
    );
  }
  return null;
}

const LEVEL_STYLES: Record<ContactabilityLevel, string> = {
  HIGH: "bg-accent-soft text-accent-ink",
  MEDIUM: "bg-sunken text-ink-2",
  LOW: "bg-transparent text-ink-3 ring-1 ring-line-strong ring-inset",
  NONE: "bg-transparent text-ink-4 ring-1 ring-line ring-inset",
};

/** Contactability, kept visually apart from fit. */
export function ContactabilityBadge({ contactability }: { contactability: Contactability }) {
  return (
    <span
      title={contactability.channel}
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.6875rem] font-medium tracking-[0.02em] whitespace-nowrap uppercase",
        LEVEL_STYLES[contactability.level],
      )}
    >
      {contactability.level === "NONE" ? "No contact" : `${contactability.level.toLowerCase()} reach`}
    </span>
  );
}

const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

/**
 * Who to call, in one line: the recommended person with a direct line, else the
 * switchboard, else an explicit absence. Built for scanning a table.
 */
export function ReachLine({ contactability }: { contactability: Contactability }) {
  const entry = contactability.entryPoint;
  if (entry?.phone) {
    return (
      <span className="whitespace-nowrap">
        {entry.name} ·{" "}
        <a href={telHref(entry.phone)} className="font-medium text-ink tabular-nums hover:text-accent-ink">
          {entry.phone}
        </a>
      </span>
    );
  }
  if (contactability.companyPhone) {
    return (
      <span className="whitespace-nowrap">
        {entry ? `${entry.name} via switchboard` : "Switchboard"} ·{" "}
        <a href={telHref(contactability.companyPhone)} className="font-medium text-ink tabular-nums hover:text-accent-ink">
          {contactability.companyPhone}
        </a>
      </span>
    );
  }
  return (
    <span className="text-ink-4">
      {entry ? `${entry.name} · ` : ""}No phone
    </span>
  );
}

export function PriorityLabel({ priority }: { priority: CommercialPriority }) {
  return (
    <span title={priority.reasons.join(" · ")} className="type-meta whitespace-nowrap">
      {priority.label.charAt(0) + priority.label.slice(1).toLowerCase()} priority
    </span>
  );
}
