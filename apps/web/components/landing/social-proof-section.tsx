"use client";

import { useRef, useEffect, useState } from "react";
import { useInView, useSpring, useMotionValue } from "framer-motion";
import { SectionReveal } from "./section-reveal";

const stats = [
  { value: 10000, suffix: "+", label: "Documents Processed" },
  { value: 500, suffix: "+", label: "Active Researchers" },
  { value: 50, suffix: "+", label: "Conferences Indexed" },
  { value: 99, suffix: "%", label: "Citation Accuracy" },
];

function AnimatedStat({
  value,
  suffix,
  label,
}: {
  value: number;
  suffix: string;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, { stiffness: 50, damping: 20 });
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    if (isInView) {
      motionValue.set(value);
    }
  }, [isInView, motionValue, value]);

  useEffect(() => {
    const unsubscribe = spring.on("change", (v) => {
      setDisplay(Math.round(v).toLocaleString());
    });
    return unsubscribe;
  }, [spring]);

  return (
    <div ref={ref} className="flex flex-col items-center gap-1 px-4 py-6">
      <span className="text-3xl font-bold tracking-tight sm:text-4xl">
        {display}
        {suffix}
      </span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

export function SocialProofSection() {
  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-4xl">
        <SectionReveal>
          <div className="grid grid-cols-2 divide-x divide-border md:grid-cols-4">
            {stats.map((stat) => (
              <AnimatedStat key={stat.label} {...stat} />
            ))}
          </div>
        </SectionReveal>
      </div>
    </section>
  );
}
