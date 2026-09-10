import {
  approveContentAsset,
  archiveContentAsset,
  restoreContentAsset,
  scheduleContentAsset,
  unscheduleContentAsset,
  updateContentAsset,
} from "@/app/dashboard/content/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { Field, TextArea } from "@/components/ui/field";
import Link from "next/link";

export type ContentRowData = {
  id: string;
  title: string | null;
  content: string;
  status: string;
  channel: string;
  type: string;
  createdAt: Date;
  scheduledAt: Date | null;
  brand: { name: string };
  opportunity: { id: string; title: string } | null;
  visualAsset: { type: string; imageUrl: string | null } | null;
};

export const dateTime = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** `datetime-local` wants `YYYY-MM-DDTHH:mm` in local time. */
export function toLocalInput(date: Date | null) {
  if (!date) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function statusTone(status: string) {
  if (status === "APPROVED") return "accent" as const;
  if (status === "ARCHIVED") return "muted" as const;
  return "neutral" as const;
}

export function ScheduleForm({ asset }: { asset: ContentRowData }) {
  return (
    <form
      action={scheduleContentAsset.bind(null, asset.id)}
      className="flex flex-wrap items-end gap-3"
    >
      <Field
        label={asset.scheduledAt ? "Move to" : "Schedule for"}
        name="scheduledAt"
        type="datetime-local"
        required
        defaultValue={toLocalInput(asset.scheduledAt)}
        className="sm:w-60"
      />
      <Button type="submit" size="sm">
        {asset.scheduledAt ? "Move" : "Schedule"}
      </Button>
      {asset.scheduledAt ? (
        <Button
          type="submit"
          size="sm"
          variant="ghost"
          formNoValidate
          formAction={unscheduleContentAsset.bind(null, asset.id)}
        >
          Unschedule
        </Button>
      ) : null}
    </form>
  );
}

export function ContentRow({ asset }: { asset: ContentRowData }) {
  const archived = asset.status === "ARCHIVED";

  return (
    <li className="py-6 first:pt-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/dashboard/content/${asset.id}`}
            className="text-[0.9375rem] font-medium tracking-[-0.01em] transition-colors hover:text-accent-ink"
          >
            {asset.title ?? "Untitled draft"}
          </Link>
          <p className="type-meta mt-1">
            {asset.brand.name} · {asset.channel.toLowerCase()} ·{" "}
            {asset.type.toLowerCase().replace("_", " ")} ·{" "}
            {dateTime.format(asset.createdAt)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {asset.scheduledAt ? (
            <Badge tone="neutral">{dateTime.format(asset.scheduledAt)}</Badge>
          ) : null}
          <Badge tone={statusTone(asset.status)}>
            {asset.status.toLowerCase()}
          </Badge>
        </div>
      </div>

      <p className="type-body mt-3 max-w-2xl text-ink-3">
        {asset.content.length > 220
          ? `${asset.content.slice(0, 220).trimEnd()}…`
          : asset.content}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link
          href={`/dashboard/content/${asset.id}`}
          className="type-meta rounded-md text-accent-ink transition-colors hover:text-accent-strong"
        >
          Open
        </Link>
        {asset.opportunity ? (
          <Link
            href="/dashboard/opportunities"
            className="type-meta rounded-md transition-colors hover:text-ink"
            title={asset.opportunity.title}
          >
            Source opportunity
          </Link>
        ) : null}
        {asset.visualAsset && asset.visualAsset.type !== "NONE" ? (
          asset.visualAsset.imageUrl ? (
            <a
              href={asset.visualAsset.imageUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="type-meta rounded-md transition-colors hover:text-ink"
            >
              Visual
            </a>
          ) : (
            <span className="type-meta text-ink-4">Visual not rendered</span>
          )
        ) : null}

        {asset.status === "APPROVED" ? null : (
          <form action={approveContentAsset.bind(null, asset.id)}>
            <Button type="submit" variant="ghost" size="sm">
              Approve
            </Button>
          </form>
        )}
        <form
          action={
            archived
              ? restoreContentAsset.bind(null, asset.id)
              : archiveContentAsset.bind(null, asset.id)
          }
        >
          <Button type="submit" variant="ghost" size="sm">
            {archived ? "Restore" : "Archive"}
          </Button>
        </form>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
        <Disclosure summary={asset.scheduledAt ? "Reschedule" : "Schedule"}>
          <ScheduleForm asset={asset} />
        </Disclosure>

        <Disclosure summary="Edit">
          <form
            action={updateContentAsset.bind(null, asset.id)}
            className="grid max-w-2xl gap-5 rounded-xl border border-line bg-subtle p-6"
          >
            <Field
              label="Title"
              name="title"
              defaultValue={asset.title ?? ""}
              hint="optional"
              autoComplete="off"
            />
            <TextArea
              label="Content"
              name="content"
              required
              rows={10}
              defaultValue={asset.content}
            />
            <div className="border-t border-line pt-5">
              <Button type="submit">Save changes</Button>
            </div>
          </form>
        </Disclosure>
      </div>
    </li>
  );
}
