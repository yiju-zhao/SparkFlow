"use client";

import { useState } from "react";
import { fillTemplate } from "./helpers";

export interface SelectValueData {
  title?: string;
  field?: string;
  instruction?: string;
  confirmLabel?: string;
  continuePromptTemplate?: string;
  cancelPrompt?: string;
  options?: Array<{
    label?: string;
    value?: string;
    count?: number;
    description?: string;
  }>;
}

export function SelectValue({
  data,
  onFollowUp,
}: {
  data: SelectValueData;
  onFollowUp?: (message: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleConfirm = () => {
    if (!selected) return;
    setSubmitted(true);
    const opt = data.options?.find((o) => (o.value ?? o.label) === selected);
    const msg =
      fillTemplate(data.continuePromptTemplate, {
        value: selected,
        label: opt?.label ?? selected,
        field: data.field ?? "value",
      }) || `Continue the previous request using ${data.field ?? "value"} = "${selected}".`;
    onFollowUp?.(msg);
  };

  const handleCancel = () => {
    if (!data.cancelPrompt) return;
    setSubmitted(true);
    onFollowUp?.(data.cancelPrompt);
  };

  return (
    <div className="rounded-2xl border border-border p-4 bg-gradient-to-b from-[#00D084]/6 to-transparent">
      <div className="text-base font-semibold mb-2">{data.title ?? "Select a value"}</div>
      {data.instruction && (
        <div className="text-xs text-muted-foreground mb-3">{data.instruction}</div>
      )}
      <div className="space-y-2">
        {(data.options ?? []).map((opt) => {
          const val = opt.value ?? opt.label ?? "";
          const isActive = selected === val;
          return (
            <button
              key={val}
              type="button"
              disabled={submitted}
              onClick={() => setSelected(val)}
              className={`w-full text-left rounded-xl border p-2.5 transition-colors ${
                isActive
                  ? "border-[#00D084] bg-[#00D084]/8"
                  : "border-border bg-background hover:bg-muted/50"
              } ${submitted ? "opacity-60" : ""}`}
            >
              <div className="text-sm font-medium">{opt.label ?? opt.value}</div>
              {(opt.count != null || opt.description) && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  {opt.count != null && `${opt.count} matches`}
                  {opt.count != null && opt.description && " \u00b7 "}
                  {opt.description}
                </div>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {submitted
            ? `Confirmed: ${selected}`
            : selected
              ? `Selected: ${selected}`
              : "Choose one option"}
        </div>
        <div className="flex gap-2">
          {data.cancelPrompt && (
            <button
              type="button"
              disabled={submitted}
              onClick={handleCancel}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold bg-muted hover:bg-muted/80 disabled:opacity-50"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            disabled={!selected || submitted}
            onClick={handleConfirm}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white bg-[#00D084] hover:bg-[#00B872] disabled:opacity-50"
          >
            {data.confirmLabel ?? "Use Selection"}
          </button>
        </div>
      </div>
    </div>
  );
}
