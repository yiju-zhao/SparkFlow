"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useTranslations, useLocale } from "next-intl";

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
} as const;

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 120, damping: 22 },
  },
};

export function HeroSection({ isLoggedIn }: { isLoggedIn: boolean }) {
  const t = useTranslations("landing.hero");
  const locale = useLocale();
  const deepdiveHref = isLoggedIn ? `/${locale}/deepdive` : `/${locale}/login`;

  return (
    <section className="relative overflow-hidden border-b border-sf-line bg-sf-bg">
      {/* Backdrop — faint crosshatch + gradient */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #E3E5EC 1px, transparent 1px), linear-gradient(to bottom, #E3E5EC 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse at 50% 0%, black 30%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse at 50% 0%, black 30%, transparent 75%)",
        }}
      />
      <div className="relative flex min-h-[calc(100vh-64px)] items-center justify-center px-6 pt-20 pb-24">
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="visible"
          className="mx-auto flex max-w-[960px] flex-col items-center text-center"
        >
          <motion.div variants={fadeUp} className="sf-eyebrow mb-6">
            SPARKFLOW · RESEARCH PLATFORM
          </motion.div>

          <motion.h1 variants={fadeUp} className="sf-display mb-6 max-w-[18ch]">
            {t("title")}
            <br />
            <em>{t("titleHighlight")}</em>
          </motion.h1>

          <motion.p variants={fadeUp} className="sf-lede mb-10">
            {t("subtitle")}
          </motion.p>

          <motion.div
            variants={fadeUp}
            className="flex flex-wrap items-center justify-center gap-3"
          >
            <Button size="lg" asChild>
              <Link href={deepdiveHref}>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
                {t("deepdiveBtn")}
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href={`/${locale}/explore`}>{t("exploreBtn")} →</Link>
            </Button>
          </motion.div>

          <motion.div
            variants={fadeUp}
            className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs text-sf-ink-4"
          >
            <span className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-sf-accent" />
              Hub — discovery
            </span>
            <span className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-sf-black" />
              DeepDive — research workspace
            </span>
            <span className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-sf-success" />
              Bring your own key
            </span>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
