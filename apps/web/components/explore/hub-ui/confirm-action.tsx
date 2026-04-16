"use client";

import { useState } from "react";

export interface ConfirmActionData {
  title?: string;
  summary?: string;
  details?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  continueMessage?: string;
  cancelMessage?: string;
}

export function ConfirmAction({
  data,
  onFollowUp,
}: {
  data: ConfirmActionData;
  onFollowUp?: (message: string) => void;
}) {
  const [responded, setResponded] = useState(false);

  const handleConfirm = () => {
    setResponded(true);
    const msg = data.continueMessage ?? "Continue.";
    onFollowUp?.(msg);
  };

  const handleCancel = () => {
    setResponded(true);
    const msg = data.cancelMessage ?? "Cancel the action.";
    onFollowUp?.(msg);
  };

  return (
    <div className="rounded-2xl border border-border p-4 bg-gradient-to-b from-blue-500/5 to-transparent">
      <div className="text-base font-semibold mb-2">{data.title ?? "Confirm"}</div>
      {data.summary && <div className="text-sm leading-relaxed mb-2.5">{data.summary}</div>}
      {data.details && data.details.length > 0 && (
        <ul className="text-xs text-muted-foreground list-disc pl-4 mb-3 space-y-0.5">
          {data.details.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={responded}
          onClick={handleConfirm}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white bg-[#00D084] hover:bg-[#00B872] disabled:opacity-50"
        >
          {data.confirmLabel ?? "Continue"}
        </button>
        <button
          type="button"
          disabled={responded}
          onClick={handleCancel}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold bg-muted hover:bg-muted/80 disabled:opacity-50"
        >
          {data.cancelLabel ?? "Cancel"}
        </button>
      </div>
      {responded && <div className="text-xs text-muted-foreground mt-2">Response sent.</div>}
    </div>
  );
}
