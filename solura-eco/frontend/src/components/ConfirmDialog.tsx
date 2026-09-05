// solura-eco/frontend/src/components/ConfirmDialog.tsx
// Replaces native window.confirm() for destructive actions -- a plain OS
// dialog broke the fully custom UI everywhere else in this app.
"use client";

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-bg2 p-5 shadow-xl shadow-black/40"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="font-display text-base font-bold text-white">{title}</div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-silver">{body}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/25"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
