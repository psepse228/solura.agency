"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/components/SignOutButton";
import { UrgentPanel, type UrgentData } from "@/components/UrgentPanel";

// "Leads" is the only inert route left -- it's waiting on the Telegram
// Business connection (a manual step, not code). Everything else here is
// real and live. See architecture.md for the original build order.
const NAV_ITEMS = [
  { href: "/", label: "Home", live: true, exact: true },
  { href: "/projects", label: "Projects", live: true, exact: false },
  { href: "/tasks", label: "Tasks", live: true, exact: false },
  { href: "/clients", label: "Clients work", live: true, exact: false },
  { href: "/uni-load", label: "Uni load", live: true, exact: false },
  { href: "/docs", label: "Docs & КП", live: true, exact: false },
  { href: "/leads", label: "Leads", live: false, exact: false },
];

function isActive(pathname: string, item: (typeof NAV_ITEMS)[number]): boolean {
  if (!item.live) return false;
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function Sidebar({ username, urgent }: { username: string; urgent: UrgentData | null }) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col gap-7 border-r border-border bg-bg2 p-4">
      <Link href="/" className="flex items-center gap-2.5 px-1">
        <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-[image:var(--grad)] font-display text-[13px] font-extrabold text-bg">
          S
        </div>
        <span className="font-display text-base font-extrabold tracking-tight">Solura Eco</span>
      </Link>

      <nav className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item);
          const className = `block rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors ${
            active ? "bg-bg3 text-white" : "text-silver-dim hover:bg-white/[0.04] hover:text-white"
          }`;
          return item.live ? (
            <Link key={item.href} href={item.href} className={className}>
              {item.label}
            </Link>
          ) : (
            <span key={item.href} className={`${className} cursor-default opacity-50 hover:bg-transparent hover:text-silver-dim`} title="Coming soon">
              {item.label}
            </span>
          );
        })}
      </nav>

      {urgent && <UrgentPanel data={urgent} />}

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
