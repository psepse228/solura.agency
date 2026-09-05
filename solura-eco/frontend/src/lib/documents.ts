// solura-eco/frontend/src/lib/documents.ts
// Shared between DocumentsPanel (per-project) and the top-level Docs & КП
// page -- was previously defined identically in both files.
export const DOC_TYPE_LABELS: Record<string, string> = {
  kp: "КП",
  presentation: "Presentation",
  other: "Other",
};

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
