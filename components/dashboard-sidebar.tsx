"use client";

import { logout } from "@/app/login/actions";
import { navigation, type NavItem } from "@/components/dashboard-nav";
import { ZuriLogo } from "@/components/zuri-logo";
import { cn } from "@/lib/cn";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

function isActive(pathname: string, href: string) {
  return href === "/dashboard" ? pathname === href : pathname.startsWith(href);
}

function NavRow({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const shared =
    "group relative flex items-center gap-3 rounded-md px-2.5 py-2 text-[0.8125rem] " +
    "transition-colors duration-200";

  if (!item.enabled || !item.href) {
    return (
      <span
        aria-disabled
        className={cn(shared, "cursor-default text-ink-4/85 select-none")}
      >
        <Icon className="h-[18px] w-[18px] shrink-0 opacity-55" />
        <span className="flex-1 truncate">{item.label}</span>
        <span className="text-[0.625rem] tracking-[0.06em] text-ink-4/70 uppercase">
          Soon
        </span>
      </span>
    );
  }

  const active = isActive(pathname, item.href);

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        shared,
        active
          ? "bg-accent-soft font-medium text-accent-ink"
          : "text-ink-2 hover:bg-sunken hover:text-ink",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-1/2 left-0 h-4 w-[2px] -translate-y-1/2 rounded-full bg-accent transition-opacity duration-200",
          active ? "opacity-100" : "opacity-0",
        )}
      />
      <Icon
        className={cn(
          "h-[18px] w-[18px] shrink-0 transition-colors",
          active ? "text-accent" : "text-ink-4 group-hover:text-ink-2",
        )}
      />
      <span className="flex-1 truncate">{item.label}</span>
    </Link>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-6">
      {navigation.map((group, index) => (
        <div key={group.label ?? index}>
          {group.label ? (
            <p className="type-label mb-2 px-2.5 text-ink-4">{group.label}</p>
          ) : null}
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <NavRow
                key={item.label}
                item={item}
                pathname={pathname}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-[18px] w-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden
    >
      {open ? (
        <path d="m5.5 5.5 9 9M14.5 5.5l-9 9" />
      ) : (
        <path d="M3.5 6h13M3.5 10h13M3.5 14h13" />
      )}
    </svg>
  );
}

export function DashboardSidebar() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* Mobile bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-line bg-canvas/85 px-4 py-3 backdrop-blur-sm lg:hidden">
        <Link href="/dashboard" className="rounded-md">
          <ZuriLogo size={24} priority />
        </Link>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="zuri-mobile-nav"
          aria-label={open ? "Close navigation" : "Open navigation"}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-sunken hover:text-ink"
        >
          <MenuIcon open={open} />
        </button>
      </header>

      {/* Mobile drawer */}
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="absolute inset-0 animate-fade bg-ink/15"
          />
          <div
            id="zuri-mobile-nav"
            className="absolute inset-x-0 top-[57px] max-h-[calc(100svh-57px)] animate-rise overflow-y-auto border-b border-line bg-canvas px-4 pt-4 pb-6 shadow-[0_24px_64px_-24px_rgba(12,12,17,0.28)]"
          >
            <NavList onNavigate={() => setOpen(false)} />
            <form action={logout} className="mt-4 border-t border-line pt-4">
              <button
                type="submit"
                className="w-full rounded-md px-2.5 py-2 text-left text-[0.8125rem] text-ink-3 transition-colors duration-200 hover:bg-sunken hover:text-ink"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {/* Desktop rail */}
      <aside className="sticky top-0 hidden h-svh w-[248px] shrink-0 flex-col border-r border-line bg-subtle px-4 py-6 lg:flex">
        <Link
          href="/"
          className="rounded-md px-2.5 transition-opacity duration-200 hover:opacity-75"
        >
          <ZuriLogo size={26} tagline="Growth OS" priority />
        </Link>
        <div className="mt-9 min-h-0 flex-1 overflow-y-auto">
          <NavList />
        </div>
        <form action={logout} className="mt-4 border-t border-line pt-4">
          <button
            type="submit"
            className="w-full rounded-md px-2.5 py-2 text-left text-[0.8125rem] text-ink-3 transition-colors duration-200 hover:bg-sunken hover:text-ink"
          >
            Sign out
          </button>
        </form>
      </aside>
    </>
  );
}
