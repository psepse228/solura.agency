// solura-eco/frontend/src/components/TelegramThread.tsx
// The actual Telegram message thread on a client's/lead's own page --
// previously only the AI-generated summary showed up (as a note), the
// raw conversation was invisible. Read-only: this integration monitors,
// it never sends a reply from here (the Solura Assistant is separate,
// lives in the group chat, and doesn't post into a specific thread).
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
  if (!thread) {
    return (
      <div className="panel">
        <div className="mb-1 text-xs font-bold uppercase tracking-wide text-silver-dim">Telegram</div>
        <p className="text-sm text-silver">No Telegram conversation yet.</p>
      </div>
    );
  }

  const { conversation, messages } = thread;

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
    </div>
  );
}
