/**
 * A readable preview of the article body. It renders the Markdown subset the
 * articles are written in — headings, paragraphs, lists, quotes, code — and
 * never executes anything, so a draft can be read safely before publication.
 */

import { Fragment, type ReactNode } from "react";

const INLINE = /(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;

function inline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(INLINE).map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) {
      return (
        <a
          key={key}
          href={link[2]}
          className="text-accent-ink underline underline-offset-2"
        >
          {link[1]}
        </a>
      );
    }
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return (
        <strong key={key} className="font-medium text-ink">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (/^`[^`]+`$/.test(part)) {
      return (
        <code key={key} className="rounded bg-sunken px-1.5 py-0.5 text-[0.85em]">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (/^\*[^*]+\*$/.test(part)) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

export type PreviewAsset = {
  publicPath: string;
  blobUrl: string | null;
  alt: string;
  caption: string | null;
};

const IMAGE_BLOCK = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;

export function MdxPreview({
  content,
  assets = [],
}: {
  content: string;
  assets?: PreviewAsset[];
}) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];

  let paragraph: string[] = [];
  let list: string[] = [];
  let ordered = false;
  let fence: string[] | null = null;

  function flushParagraph() {
    if (!paragraph.length) return;
    const key = `p-${blocks.length}`;
    blocks.push(
      <p key={key} className="type-body text-ink-2">
        {inline(paragraph.join(" "), key)}
      </p>,
    );
    paragraph = [];
  }

  function flushList() {
    if (!list.length) return;
    const key = `l-${blocks.length}`;
    const items = list.map((item, index) => (
      <li key={`${key}-${index}`} className="type-body text-ink-2">
        {inline(item, `${key}-${index}`)}
      </li>
    ));
    blocks.push(
      ordered ? (
        <ol key={key} className="ml-5 list-decimal space-y-1.5">
          {items}
        </ol>
      ) : (
        <ul key={key} className="ml-5 list-disc space-y-1.5">
          {items}
        </ul>
      ),
    );
    list = [];
  }

  function flush() {
    flushParagraph();
    flushList();
  }

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.trim().startsWith("```")) {
      if (fence) {
        blocks.push(
          <pre
            key={`c-${blocks.length}`}
            className="type-meta overflow-x-auto rounded-lg bg-sunken p-4 text-ink-2"
          >
            {fence.join("\n")}
          </pre>,
        );
        fence = null;
      } else {
        flush();
        fence = [];
      }
      continue;
    }
    if (fence) {
      fence.push(raw);
      continue;
    }

    if (!line.trim()) {
      flush();
      continue;
    }

    const image = IMAGE_BLOCK.exec(line.trim());
    if (image) {
      flush();
      const asset = assets.find((entry) => entry.publicPath === image[2]);
      const key = `i-${blocks.length}`;
      blocks.push(
        <figure key={key}>
          {asset?.blobUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={asset.blobUrl}
              alt={image[1] || asset.alt}
              className="w-full rounded-lg border border-line"
            />
          ) : (
            <p className="type-meta">{image[2]}</p>
          )}
          {asset?.caption ? (
            <figcaption className="type-meta mt-2">{asset.caption}</figcaption>
          ) : null}
        </figure>,
      );
      continue;
    }

    const heading = /^(#{2,4})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      const key = `h-${blocks.length}`;
      const size =
        heading[1].length === 2
          ? "type-section-title mt-2"
          : "text-[0.9375rem] font-medium tracking-[-0.01em]";
      blocks.push(
        <p key={key} className={size}>
          {inline(heading[2], key)}
        </p>,
      );
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(line);
    const numbered = /^\d+\.\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flushParagraph();
      const nextOrdered = Boolean(numbered);
      if (list.length && nextOrdered !== ordered) flushList();
      ordered = nextOrdered;
      list.push((bullet ?? numbered)![1]);
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      flush();
      const key = `q-${blocks.length}`;
      blocks.push(
        <blockquote
          key={key}
          className="type-body border-l-2 border-accent-line pl-4 text-ink-3"
        >
          {inline(quote[1], key)}
        </blockquote>,
      );
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      flush();
      blocks.push(<hr key={`r-${blocks.length}`} className="border-line" />);
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  flush();

  return <div className="max-w-2xl space-y-4">{blocks}</div>;
}
