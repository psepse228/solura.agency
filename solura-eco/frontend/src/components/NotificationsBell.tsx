// solura-eco/frontend/src/components/NotificationsBell.tsx
// In-app notifications -- assigned a task, someone commented on yours --
// so the team doesn't need Telegram connected to know something needs
// attention. Polls every 45s rather than a websocket: three people don't
// generate frequent enough activity to justify a persistent connection.
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
};

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function NotificationsBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  function load() {
    fetch("/api/notifications")
      .then((res) => (res.ok ? res.json() : { notifications: [], unread_count: 0 }))
      .then((data: { notifications: Notification[]; unread_count: number }) => {
        setNotifications(data.notifications);
        setUnreadCount(data.unread_count);
      })
      .catch(() => {});
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 45_000);
    return () => clearInterval(interval);
  }, []);

  async function handleClick(n: Notification) {
    setOpen(false);
    if (!n.read_at) {
      await fetch(`/api/notifications/${n.id}/read`, { method: "POST" });
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    if (n.href) router.push(n.href);
  }

  async function markAllRead() {
    await fetch("/api/notifications/read-all", { method: "POST" });
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    setUnreadCount(0);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="row-hover relative flex w-full items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-1.5 text-left text-[12px] text-silver-dim"
      >
        <span>Notifications</span>
        {unreadCount > 0 && (
          <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-cyan px-1 text-[9px] font-bold text-bg">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 w-72 overflow-hidden rounded-xl border border-border bg-bg2 shadow-xl shadow-black/40">
          <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-silver-dim">Notifications</span>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-[10.5px] text-cyan hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-3 py-4 text-[12px] italic text-silver-dim">Nothing yet.</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`row-hover flex w-full flex-col gap-0.5 border-b border-white/5 px-3 py-2.5 text-left last:border-0 ${
                    n.read_at ? "" : "bg-cyan/[0.04]"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    {!n.read_at && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cyan" />}
                    <span className="truncate text-[12.5px] font-medium text-white">{n.title}</span>
                  </div>
                  {n.body && <p className="truncate text-[11px] text-silver-dim">{n.body}</p>}
                  <span className="text-[10px] text-silver-dim">{timeAgo(n.created_at)}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
