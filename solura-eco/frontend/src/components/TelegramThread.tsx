// solura-eco/frontend/src/components/TelegramThread.tsx
// The actual Telegram message thread on a client's/lead's own page, with
// a real reply box -- typing here and clicking Send posts as the team's
// connected Telegram Business account, landing in the client's own chat.
// Always a human decision: nothing here drafts or sends on its own, the
// AI summary/next-step below is a suggestion to read, not a queued reply.
"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type Message = { id: string; direction: "inbound" | "outbound"; content: string; created_at: string };
type Conversation = {
  id: string;
  telegram_first_name: string | null;
  telegram_username: string | null;
  last_message_at: string | null;
  summary: string | null;
  next_step_suggestion: string | null;
  summary_generated_at: string | null;
};
type Thread = { conversation: Conversation; messages: Message[] } | null;

export function TelegramThread({ thread }: { thread: Thread }) {
  const router = useRouter();
  const [messages, setMessages] = useState(thread?.messages ?? []);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!thread) {
    return (
      <div className="panel">
        <div className="mb-1 text-xs font-bold uppercase tracking-wide text-silver-dim">Telegram</div>
        <p className="text-sm text-silver">No Telegram conversation yet.</p>
      </div>
    );
  }

  const { conversation } = thread;

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;

    setSending(true);
    setError(null);
    const res = await fetch(`/api/telegram/conversations/${conversation.id}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: body }),
    });
    setSending(false);

    if (!res.ok) {
      const resBody = await res.json().catch(() => ({}));
      setError(resBody.error ?? "Couldn't send");
      return;
    }

    const sent = (await res.json()) as Message;
    setMessages((prev) => [...prev, sent]);
    setText("");
    router.refresh();
  }

  return (
    <div className="panel">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs font-bold uppercase tracking-wide text-silver-dim">Telegram</div>
        {conversation.telegram_username && (
          <a
            href={`https://t.me/${conversation.telegram_username}`}
            target="_blank"
            className="text-[11px] text-cyan hover:underline"
          >
            @{conversation.telegram_username} ↗
          </a>
        )}
      </div>

      {conversation.summary && (
        <div className="mb-3 rounded-lg bg-bg3 px-3 py-2.5">
          <p className="text-[12px] leading-relaxed text-silver">{conversation.summary}</p>
          {conversation.next_step_suggestion && (
            <p className="mt-1.5 text-[11px] text-cyan">Next step: {conversation.next_step_suggestion}</p>
          )}
        </div>
      )}

      <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="text-xs italic text-silver-dim">No messages yet.</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[12.5px] leading-relaxed ${
                  m.direction === "outbound"
                    ? "rounded-br-sm bg-[image:var(--grad)] text-bg"
                    : "rounded-bl-sm border border-border bg-bg3 text-white"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleSend} className="mt-3 flex flex-col gap-2 border-t border-white/5 pt-3">
        <textarea
          className="field"
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Reply as the connected Telegram Business account…"
          disabled={sending}
        />
        {error && <p className="text-[11px] text-red-400">{error}</p>}
        <button type="submit" disabled={!text.trim() || sending} className="btn-primary self-end">
          {sending ? "Sending…" : "Send"}
        </button>
      </form>
    </div>
  );
}
