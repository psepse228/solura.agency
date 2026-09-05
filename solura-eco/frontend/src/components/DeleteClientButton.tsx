// solura-eco/frontend/src/components/DeleteClientButton.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog } from "@/components/ConfirmDialog";

export function DeleteClientButton({ clientId, clientName }: { clientId: string; clientName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function handleDelete() {
    setOpen(false);
    const res = await fetch(`/api/clients/${clientId}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/clients");
      router.refresh();
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-[11px] text-silver-dim hover:text-red-400">
        Delete client
      </button>
      <ConfirmDialog
        open={open}
        title="Delete this client?"
        body={`${clientName} and all of its notes will be permanently removed. This can't be undone.`}
        onConfirm={handleDelete}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
