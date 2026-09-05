// solura-eco/frontend/src/components/Modal.tsx
// Generic overlay shell for anything bigger than ConfirmDialog's yes/no
// prompt -- a real form (new project, editing a record) needs its own
// content, not a fixed title+body+confirm layout.
"use client";

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-y-auto rounded-2xl border border-border bg-bg2 p-5 shadow-xl shadow-black/40"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="font-display text-base font-bold text-white">{title}</div>
          <button onClick={onClose} className="text-silver-dim hover:text-white" aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
