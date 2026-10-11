import { removeEvidence, updateEvidence } from "@/app/dashboard/sales/actions";
import { EvidenceTypeBadge } from "@/components/sales/sales-ui";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { Field, Select, TextArea } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { CONFIDENCES, EVIDENCE_TYPES, humanize, toDateInput } from "@/lib/sales";

/** A stored URL is only validated in the browser; never let a bad one throw. */
export function hostname(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export type EvidenceItem = {
  id: string;
  type: string;
  category: string;
  statement: string;
  sourceUrl: string | null;
  sourceName: string | null;
  evidenceExcerpt: string | null;
  observedAt: Date | null;
  confidence: string;
};

export function EvidenceFields({ item }: { item?: EvidenceItem }) {
  return (
    <>
      <div className="grid gap-5 sm:grid-cols-3">
        <Select label="Type" name="type" defaultValue={item?.type ?? "FACT"}>
          {EVIDENCE_TYPES.map((value) => (
            <option key={value} value={value}>
              {humanize(value)}
            </option>
          ))}
        </Select>
        <Field
          label="Category"
          name="category"
          required
          placeholder="fleet, tooling, pain point…"
          defaultValue={item?.category}
        />
        <Select label="Confidence" name="confidence" defaultValue={item?.confidence ?? "MEDIUM"}>
          {CONFIDENCES.map((value) => (
            <option key={value} value={value}>
              {humanize(value)}
            </option>
          ))}
        </Select>
      </div>
      <TextArea
        label="Statement"
        name="statement"
        required
        rows={2}
        defaultValue={item?.statement}
      />
      <div className="grid gap-5 sm:grid-cols-3">
        <Field
          label="Source URL"
          name="sourceUrl"
          type="url"
          defaultValue={item?.sourceUrl ?? ""}
        />
        <Field label="Source name" name="sourceName" defaultValue={item?.sourceName ?? ""} />
        <Field
          label="Observed"
          name="observedAt"
          type="date"
          defaultValue={toDateInput(item?.observedAt)}
        />
      </div>
      <TextArea
        label="Excerpt"
        name="evidenceExcerpt"
        rows={2}
        hint="the exact words, when there are some"
        defaultValue={item?.evidenceExcerpt ?? ""}
      />
    </>
  );
}

/** One statement, shown for exactly what it is. */
export function EvidenceRow({
  prospectId,
  item,
}: {
  prospectId: string;
  item: EvidenceItem;
}) {
  const unsourcedFact = item.type === "FACT" && !item.sourceUrl && !item.sourceName;

  return (
    <li
      className={cn(
        "py-4 first:pt-0",
        item.type === "UNKNOWN" && "text-ink-3",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <EvidenceTypeBadge type={item.type} />
        <span className="type-meta">
          {item.category} · {humanize(item.confidence)} confidence
        </span>
      </div>
      <p
        className={cn(
          "type-body mt-2 max-w-2xl",
          item.type === "INFERENCE" ? "text-ink-2 italic" : "text-ink",
          item.type === "UNKNOWN" && "text-ink-3",
        )}
      >
        {item.statement}
      </p>
      {item.evidenceExcerpt ? (
        <blockquote className="type-meta mt-2 max-w-2xl border-l-2 border-line-strong pl-3 text-ink-3">
          “{item.evidenceExcerpt}”
        </blockquote>
      ) : null}
      <p className="type-meta mt-2">
        {item.sourceUrl ? (
          <a
            href={item.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="rounded-md text-accent-ink transition-colors hover:text-accent-strong"
          >
            {item.sourceName ?? hostname(item.sourceUrl)}
          </a>
        ) : item.sourceName ? (
          item.sourceName
        ) : unsourcedFact ? (
          <span className="text-ink-2">No source recorded for this fact.</span>
        ) : null}
        {item.observedAt ? ` · observed ${toDateInput(item.observedAt)}` : ""}
      </p>

      <div className="mt-2 flex flex-wrap items-start gap-x-5 gap-y-2">
        <Disclosure summary="Edit">
          <form
            action={updateEvidence.bind(null, prospectId, item.id)}
            className="mt-3 grid max-w-3xl gap-4 rounded-xl border border-line bg-subtle p-5"
          >
            <EvidenceFields item={item} />
            <div>
              <Button type="submit" size="sm">
                Save evidence
              </Button>
            </div>
          </form>
        </Disclosure>
        <form action={removeEvidence.bind(null, prospectId, item.id)}>
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

export function EvidenceList({
  prospectId,
  items,
  empty,
}: {
  prospectId: string;
  items: EvidenceItem[];
  empty: string;
}) {
  if (!items.length) {
    return <p className="type-meta text-ink-4">{empty}</p>;
  }
  return (
    <ul className="divide-y divide-line">
      {items.map((item) => (
        <EvidenceRow key={item.id} prospectId={prospectId} item={item} />
      ))}
    </ul>
  );
}
