import Link from "next/link";
import { ZuriLogo } from "@/components/zuri-logo";

type LegalSection = {
  title: string;
  content: React.ReactNode;
};

type LegalPageProps = {
  eyebrow: string;
  title: string;
  introduction: string;
  sections: LegalSection[];
};

export function LegalPage({ eyebrow, title, introduction, sections }: LegalPageProps) {
  return (
    <main className="min-h-svh bg-canvas px-5 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <header className="flex items-center justify-between border-b border-line pb-6">
          <Link
            href="https://zuri.prolific.lu"
            aria-label="Back to Zuri"
            className="rounded-sm"
          >
            <ZuriLogo size={25} priority />
          </Link>
          <Link
            href="https://zuri.prolific.lu"
            className="type-meta rounded-sm transition-colors hover:text-accent-ink"
          >
            Back to Zuri
          </Link>
        </header>

        <article className="py-12 sm:py-16">
          <p className="type-label text-accent-ink">{eyebrow}</p>
          <h1 className="mt-4 text-[2.25rem] font-semibold leading-[1.08] tracking-[-0.04em] text-ink sm:text-[3rem]">
            {title}
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-ink-2 sm:text-[1.0625rem] sm:leading-8">
            {introduction}
          </p>

          <div className="mt-12 space-y-10 border-t border-line pt-10 sm:mt-14 sm:pt-12">
            {sections.map((section) => (
              <section key={section.title} aria-labelledby={section.title.toLowerCase().replaceAll(" ", "-")}>
                <h2
                  id={section.title.toLowerCase().replaceAll(" ", "-")}
                  className="text-lg font-semibold tracking-[-0.02em] text-ink"
                >
                  {section.title}
                </h2>
                <div className="mt-3 space-y-4 text-[0.9375rem] leading-7 text-ink-2 [&_a]:font-medium [&_a]:text-accent-ink [&_a]:underline [&_a]:decoration-accent-line [&_a]:underline-offset-4 [&_li]:pl-1 [&_ul]:ml-5 [&_ul]:list-disc [&_ul]:space-y-2">
                  {section.content}
                </div>
              </section>
            ))}
          </div>
        </article>

        <footer className="type-meta flex flex-col gap-2 border-t border-line py-6 sm:flex-row sm:items-center sm:justify-between">
          <span>Zuri by Prolific</span>
          <span>Luxembourg</span>
        </footer>
      </div>
    </main>
  );
}
