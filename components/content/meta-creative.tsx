"use client";

import {
  buildMetaCreative,
  generateMetaVisual,
  updateMetaCreative,
} from "@/app/dashboard/content/creative-actions";
import type { CreativeState } from "@/app/dashboard/content/creative-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, TextArea } from "@/components/ui/field";
import { Panel, Section } from "@/components/ui/layout";
import { cn } from "@/lib/cn";
import { useActionState, useState } from "react";

const initialState: CreativeState = { status: "idle", message: "" };

export type MetaCreativeView = {
  hook: string;
  copy: string;
  cta: string;
  visualRecommendation: string;
  imagePrompt: string;
  imageUrl: string | null;
  productionPrompt: string;
  sections: { label: string; body: string }[];
};

function briefToText(sections: { label: string; body: string }[]) {
  return sections.map((section) => `${section.label}: ${section.body}`).join("\n\n");
}

function Copy({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? "Copied" : label}
    </Button>
  );
}

function Message({ state, busy }: { state: CreativeState; busy: string | null }) {
  return (
    <p className="type-meta" aria-live="polite">
      {busy ? (
        <span className="text-ink-3">{busy}</span>
      ) : state.message ? (
        <span className={cn(state.status === "error" ? "text-ink-2" : "text-accent-ink")}>
          {state.message}
        </span>
      ) : null}
    </p>
  );
}

/**
 * The production package for one Meta draft. Zuri writes it and renders the
 * still image; video is briefed, never generated, and nothing is published.
 */
export function MetaCreative({
  assetId,
  channel,
  contentType,
  draftBody,
  creative,
}: {
  assetId: string;
  channel: string;
  contentType: string;
  draftBody: string;
  creative: MetaCreativeView | null;
}) {
  const [buildState, buildAction, building] = useActionState(
    buildMetaCreative,
    initialState,
  );
  const [visualState, visualAction, rendering] = useActionState(
    generateMetaVisual,
    initialState,
  );

  const isVideo = contentType.includes("VIDEO");
  const needsImage = creative?.visualRecommendation === "STATIC" || Boolean(creative?.imagePrompt);
  const testimonial = contentType === "TESTIMONIAL_VIDEO_BRIEF";

  return (
    <>
      <Section title="Creative" hint={`${channel.toLowerCase()} · ${contentType.toLowerCase().replace(/_/g, " ")}`} className="mt-12">
        <Panel>
          {testimonial ? (
            <p className="type-body mb-4 text-ink-2">
              Fictional testimonial scenario — not a real customer testimonial.
            </p>
          ) : null}

          <form action={buildAction} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="assetId" value={assetId} />
            <Button type="submit" variant="secondary" size="sm" disabled={building}>
              {building ? "Writing…" : creative ? "Rebuild creative" : "Build creative"}
            </Button>
            <Message
              state={buildState}
              busy={building ? "Writing the production package…" : null}
            />
          </form>

          {creative ? (
            <div className="mt-6 border-t border-line pt-5">
              <p className="type-label">Content</p>
              <p className="mt-2 text-[0.9375rem] font-medium tracking-[-0.01em]">
                {creative.hook}
              </p>
              <p className="type-body mt-2 max-w-2xl whitespace-pre-line text-ink-2">
                {creative.copy}
              </p>
              {creative.cta ? (
                <p className="type-meta mt-2">CTA: {creative.cta}</p>
              ) : null}
            </div>
          ) : (
            <p className="type-meta mt-4">
              Nothing built yet. The draft below is the starting point.
            </p>
          )}

          {creative?.sections.length ? (
            <div className="mt-6 border-t border-line pt-5">
              <p className="type-label">Brief</p>
              <dl className="mt-3 grid max-w-3xl gap-3">
                {creative.sections.map((section) => (
                  <div key={section.label} className="sm:flex sm:gap-6">
                    <dt className="type-label shrink-0 sm:w-36 sm:pt-0.5">
                      {section.label}
                    </dt>
                    <dd className="type-body mt-1 whitespace-pre-line text-ink-2 sm:mt-0">
                      {section.body}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
        </Panel>
      </Section>

      {creative ? (
        <Section title="Asset" hint={isVideo ? "briefed, not generated" : "still image"}>
          <Panel>
            {isVideo ? (
              <>
                <p className="type-meta">
                  Zuri does not generate video. Copy the brief into your production
                  tool.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Copy
                    label="Copy script"
                    value={
                      creative.sections.find((section) =>
                        section.label.toLowerCase().includes("script"),
                      )?.body ?? ""
                    }
                  />
                  <Copy
                    label="Copy production brief"
                    value={briefToText(creative.sections)}
                  />
                  <Copy label="Copy video prompt" value={creative.productionPrompt} />
                </div>
              </>
            ) : needsImage ? (
              <>
                <div className="flex flex-wrap items-center gap-2.5">
                  <Badge tone={creative.imageUrl ? "accent" : "muted"}>
                    {creative.imageUrl ? "rendered" : "not rendered"}
                  </Badge>
                  <span className="type-meta">
                    {channel === "INSTAGRAM" ? "square" : "landscape"}
                  </span>
                </div>

                {creative.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={creative.imageUrl}
                    alt={creative.hook || "Generated visual"}
                    className="mt-4 w-full max-w-lg rounded-lg border border-line"
                  />
                ) : null}

                <form action={visualAction} className="mt-4 flex flex-wrap items-center gap-3">
                  <input type="hidden" name="assetId" value={assetId} />
                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    disabled={rendering}
                  >
                    {rendering
                      ? "Drawing…"
                      : creative.imageUrl
                        ? "Regenerate visual"
                        : "Generate visual"}
                  </Button>
                  {creative.imageUrl ? (
                    <a
                      href={creative.imageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="type-meta rounded-md text-accent-ink transition-colors hover:text-accent-strong"
                    >
                      Open the file
                    </a>
                  ) : null}
                  <Message
                    state={visualState}
                    busy={rendering ? "Rendering the visual…" : null}
                  />
                </form>
              </>
            ) : (
              <p className="type-meta">
                No image recommended for this post. Text carries it.
              </p>
            )}
          </Panel>
        </Section>
      ) : null}

      <Section title="Edit">
        <Panel>
          <form
            action={updateMetaCreative.bind(null, assetId)}
            className="grid max-w-2xl gap-5"
          >
            <Field
              label="Hook"
              name="hook"
              defaultValue={creative?.hook ?? ""}
              autoComplete="off"
            />
            <TextArea
              label="Copy"
              name="copy"
              rows={6}
              defaultValue={creative?.copy ?? ""}
            />
            <Field
              label="CTA"
              name="cta"
              defaultValue={creative?.cta ?? ""}
              autoComplete="off"
            />
            <TextArea
              label="Brief"
              name="brief"
              rows={12}
              defaultValue={creative ? briefToText(creative.sections) : ""}
              hint="one section per block: Label: body"
            />
            <TextArea
              label="Production prompt"
              name="productionPrompt"
              rows={5}
              defaultValue={creative?.productionPrompt ?? ""}
            />
            <TextArea
              label="Image prompt"
              name="imagePrompt"
              rows={3}
              defaultValue={creative?.imagePrompt ?? ""}
            />
            <TextArea
              label="Original draft"
              name="content"
              rows={6}
              defaultValue={draftBody}
              hint="the idea this package came from"
            />
            <div className="border-t border-line pt-5">
              <Button type="submit">Save</Button>
            </div>
          </form>
        </Panel>
      </Section>
    </>
  );
}
