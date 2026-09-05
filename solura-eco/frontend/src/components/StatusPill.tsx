// solura-eco/frontend/src/components/StatusPill.tsx
// One status-pill treatment, used everywhere a client/project status
// renders as a small capitalized badge -- was previously copy-pasted with
// the same two-branch color logic in 4 different files.
export function StatusPill({ status, size = "sm" }: { status: string; size?: "sm" | "xs" }) {
  const sizeClass = size === "xs" ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]";
  return (
    <span
      className={`shrink-0 rounded-full font-bold capitalize ${sizeClass} ${
        status === "active" ? "bg-cyan/15 text-cyan" : "bg-silver/15 text-silver"
      }`}
    >
      {status}
    </span>
  );
}
