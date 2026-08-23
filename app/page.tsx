import { ButtonLink } from "@/components/ui/button";
import { ZuriMark } from "@/components/zuri-logo";

export default function Home() {
  return (
    <main className="relative isolate flex min-h-svh flex-col overflow-hidden bg-canvas px-6 py-10 sm:px-10">
      {/* A single, very quiet wash picked from the mark — no decorative gradients. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 right-[-10%] -z-10 h-[520px] w-[520px] rounded-full bg-accent/6 blur-3xl"
      />

      <header className="flex items-center justify-between">
        <ZuriMark size={26} priority />
        <a
          href="/dashboard"
          className="type-meta rounded-md px-2 py-1 text-ink-3 transition-colors hover:text-ink"
        >
          Dashboard
        </a>
      </header>

      <div className="flex flex-1 items-center">
        <div className="mx-auto grid w-full max-w-5xl items-center gap-14 py-16 md:grid-cols-[1.15fr_1fr] md:gap-20">
          <div className="animate-rise">
            <p className="type-label">Growth OS</p>
            <h1 className="type-display mt-6">Zuri</h1>
            <p className="type-body mt-6 max-w-md text-lg leading-8 text-ink-3">
              One calm system for every brand you grow — its identity, its
              audiences, and everything the market tells you.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <ButtonLink href="/dashboard">Open workspace</ButtonLink>
              <ButtonLink href="/dashboard/brands" variant="secondary">
                Brands
              </ButtonLink>
            </div>
          </div>

          <div className="animate-fade flex justify-center md:justify-end">
            <ZuriMark size={280} className="max-w-full" priority />
          </div>
        </div>
      </div>

      <footer className="type-meta flex items-center justify-between border-t border-line pt-6 text-ink-4">
        <span>Zuri</span>
        <span>Multi-brand Growth OS</span>
      </footer>
    </main>
  );
}
