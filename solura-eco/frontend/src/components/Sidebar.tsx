"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/components/SignOutButton";

// "Projects" is the only live route this pass -- the rest are the real,
// named upcoming build-order sections (architecture.md), rendered as
// visible-but-inert so the platform's intended shape is honest, not
// decorative filler.
const NAV_ITEMS = [
  { href: "/", label: "Projects", live: true },
  { href: "/clients", label: "Clients", live: false },
  { href: "/uni-load", label: "Uni load", live: false },
  { href: "/docs", label: "Docs & КП", live: false },
  { href: "/leads", label: "Leads", live: false },
];

export function Sidebar({ username }: { username: string }) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col gap-7 border-r border-border bg-bg2 p-4">
      <div className="flex items-center gap-2.5 px-1">
        <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-[image:var(--grad)] font-display text-[13px] font-extrabold text-bg">
          S
        </div>
        <span className="font-display text-base font-extrabold tracking-tight">Solura Eco</span>
      </div>

      <nav className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          const active = item.live && pathname === item.href;
          const className = `block rounded-lg px-2.5 py-2 text-[13.5px] font-medium ${
            active ? "bg-bg3 text-white" : "text-silver-dim"
          }`;
          return item.live ? (
            <Link key={item.href} href={item.href} className={className}>
              {item.label}
            </Link>
          ) : (
            <span key={item.href} className={`${className} cursor-default opacity-50`} title="Coming soon">
              {item.label}
            </span>
          );
        })}
      </nav>

      <div className="mt-auto flex items-center gap-2.5 border-t border-white/5 pt-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-bg3 text-[11px] font-bold uppercase">
          {username.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1 truncate text-xs font-semibold capitalize text-white">{username}</div>
        <SignOutButton />
      </div>
    </aside>
  );
}
