import Image from "next/image";
import mark from "@/public/zuri-mark.png";

/**
 * Zuri brand assets.
 *
 * The mark is the official artwork (`public/zuri-mark.png`, a tight crop of
 * `public/logo.png`). It is never redrawn or recoloured — components only
 * compose layout around it.
 */

type MarkProps = {
  /** Rendered height in px. Width follows the artwork's aspect ratio. */
  size?: number;
  className?: string;
  priority?: boolean;
};

export function ZuriMark({ size = 28, className, priority }: MarkProps) {
  return (
    <Image
      src={mark}
      alt=""
      height={size}
      width={Math.round((size * mark.width) / mark.height)}
      priority={priority}
      className={className}
      aria-hidden
    />
  );
}

type LogoProps = {
  size?: number;
  className?: string;
  /** Small line under the wordmark, e.g. "Growth OS". */
  tagline?: string;
  priority?: boolean;
};

export function ZuriLogo({ size = 26, className, tagline, priority }: LogoProps) {
  return (
    <span className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <ZuriMark size={size} priority={priority} />
      <span className="flex flex-col leading-none">
        <span className="text-[0.9375rem] font-semibold tracking-[-0.03em] text-ink">
          Zuri
        </span>
        {tagline ? (
          <span className="mt-[5px] text-[0.6875rem] font-medium tracking-[0.01em] text-ink-4">
            {tagline}
          </span>
        ) : null}
      </span>
    </span>
  );
}
