import { cn } from "@/lib/utils";

export type SparkflowLockupVariant = "hub" | "deepdive" | "admin" | "none";

export interface SparkflowLockupProps {
  tag?: "HUB" | "DEEPDIVE" | "ADMIN" | null;
  size?: "sm" | "md" | "lg";
  withGlyph?: boolean;
  inverse?: boolean;
  className?: string;
}

const sizeMap = {
  sm: { word: "text-[15px]", tag: "text-[9px] px-1.5 py-[2px]", glyph: "h-4 w-4" },
  md: { word: "text-[20px]", tag: "text-[11px] px-[7px] py-[3px]", glyph: "h-5 w-5" },
  lg: { word: "text-[24px]", tag: "text-[12px] px-2 py-[3px]", glyph: "h-6 w-6" },
};

export function SparkflowLockup({
  tag = "HUB",
  size = "md",
  withGlyph = false,
  inverse = false,
  className,
}: SparkflowLockupProps) {
  const dim = sizeMap[size];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-extrabold tracking-[0.01em] leading-none",
        inverse ? "text-white" : "text-sf-ink",
        className,
      )}
    >
      {withGlyph && (
        <span className={cn("text-sf-accent", dim.glyph)} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
            <path
              d="M12 2 L14 10 L22 12 L14 14 L12 22 L10 14 L2 12 L10 10 Z"
              fill="currentColor"
            />
          </svg>
        </span>
      )}
      <span className={cn(dim.word, "uppercase tracking-[0.01em]")}>SPARKFLOW</span>
      {tag && (
        <span
          className={cn(
            "inline-block font-extrabold tracking-[0.14em] rounded-[3px]",
            dim.tag,
            inverse ? "bg-white text-sf-black" : "bg-sf-accent text-white",
          )}
        >
          {tag}
        </span>
      )}
    </span>
  );
}
