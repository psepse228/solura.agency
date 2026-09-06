// solura-eco/frontend/src/components/AssistantWidget.tsx
// Floating Solura Assistant, bottom-right, reachable from every page --
// same launcher pattern as Argus's AssistantWidget.tsx. Answers from a
// live snapshot of projects/clients/tasks/leads (app/ai/assistant.py),
// same brain the Telegram group-chat Assistant uses. Conversation is
// browser-local only -- no server-side history table, resets on reload.
// Three people occasionally asking "how's Argus doing" doesn't need a
// persisted inbox.
"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

type Message = { role: "user" | "assistant"; content: string };

const GREETING = "Hey! Ask me anything about projects, clients, tasks, or leads.";

export function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || sending) return;

    const nextMessages: Message[] = [...messages, { role: "user", content: question }];
    setMessages(nextMessages);
    setInput("");
    setSending(true);
    setError(null);

    const res = await fetch("/api/assistant/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, history: messages }),
    });
    setSending(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't reach the assistant");
      return;
    }

    const { answer } = (await res.json()) as { answer: string };
    setMessages([...nextMessages, { role: "assistant", content: answer }]);
  }

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex h-[480px] w-[360px] flex-col overflow-hidden rounded-2xl border border-border bg-bg2 shadow-xl shadow-black/40">
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[image:var(--grad)] font-display text-[11px] font-extrabold text-bg">
                S
              </div>
              <span className="font-display text-sm font-bold text-white">Solura Assistant</span>
            </div>
            <button onClick={() => setOpen(false)} className="text-silver-dim hover:text-white" aria-label="Close">
              ✕
            </button>
          </div>

          <div ref={scrollRef} className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 py-3">
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl rounded-bl-sm border border-border bg-bg3 px-3 py-2 text-[12.5px] leading-relaxed text-white">
                {GREETING}
              </div>
            </div>
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[12.5px] leading-relaxed ${
                    m.role === "user"
                      ? "rounded-br-sm bg-[image:var(--grad)] text-bg"
                      : "rounded-bl-sm border border-border bg-bg3 text-white"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm border border-border bg-bg3 px-3 py-2 text-[12.5px] text-silver-dim">
                  Thinking…
                </div>
              </div>
            )}
          </div>

          {error && <p className="px-3 pb-1 text-[11px] text-red-400">{error}</p>}

          <form onSubmit={handleSend} className="flex gap-2 border-t border-white/5 p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask something…"
              disabled={sending}
              className="field flex-1"
            />
            <button type="submit" disabled={!input.trim() || sending} className="btn-primary shrink-0">
              Send
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setOpen((prev) => !prev)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[image:var(--grad)] text-xl shadow-xl shadow-black/40 transition-transform hover:scale-105"
        aria-label={open ? "Close Solura Assistant" : "Open Solura Assistant"}
      >
        {open ? <span className="text-bg">✕</span> : <span className="text-bg">💬</span>}
      </button>
    </>
  );
}
