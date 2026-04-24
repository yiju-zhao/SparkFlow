"use client";

interface GuideBubbleProps {
  title: string;
  body: string;
  stepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onPrev?: () => void;
  onClose: () => void;
  nextLabel: string;
  prevLabel: string;
  closeLabel: string;
  finishLabel: string;
}

/**
 * The content inside a guide tooltip — title, body, dot progress, Back / Next / close.
 * Positioning and outer animation are handled by the parent (Spotlight / GuideLayer).
 * On the last step the Close affordance is dropped; Finish is the sole exit.
 */
export function GuideBubble({
  title,
  body,
  stepIndex,
  totalSteps,
  onNext,
  onPrev,
  onClose,
  nextLabel,
  prevLabel,
  closeLabel,
  finishLabel,
}: GuideBubbleProps) {
  const isLast = stepIndex === totalSteps - 1;

  return (
    <div className="w-80 max-w-[90vw] rounded-lg border border-border bg-background p-4 shadow-xl">
      <div className="mb-2 flex items-center gap-1.5" aria-label={`Step ${stepIndex + 1} of ${totalSteps}`}>
        {Array.from({ length: totalSteps }).map((_, i) => (
          <span
            key={i}
            className={`h-1.5 w-1.5 rounded-full transition-colors ${
              i === stepIndex ? "bg-indigo-500" : "bg-muted-foreground/30"
            }`}
          />
        ))}
      </div>
      <div className="mb-1 text-sm font-semibold">{title}</div>
      <div className="mb-3 text-sm text-muted-foreground">{body}</div>
      <div className="flex items-center justify-between gap-2">
        {isLast ? (
          <span />
        ) : (
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            {closeLabel}
          </button>
        )}
        <div className="flex gap-2">
          {onPrev && stepIndex > 0 ? (
            <button
              type="button"
              className="rounded border border-border px-3 py-1 text-xs"
              onClick={onPrev}
            >
              {prevLabel}
            </button>
          ) : null}
          <button
            type="button"
            className="rounded bg-indigo-500 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-600"
            onClick={onNext}
          >
            {isLast ? finishLabel : nextLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
