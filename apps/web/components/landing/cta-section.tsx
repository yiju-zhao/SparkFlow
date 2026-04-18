"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { SectionReveal } from "./section-reveal";
import { useTranslations, useLocale } from "next-intl";

export function CtaSection({ isLoggedIn }: { isLoggedIn: boolean }) {
  const t = useTranslations("landing.cta");
  const locale = useLocale();
  const deepdiveHref = isLoggedIn ? `/${locale}/deepdive` : `/${locale}/login`;

  return (
    <section className="px-6 py-24">
      <SectionReveal>
        <div className="relative mx-auto max-w-[1200px] overflow-hidden rounded-[14px] bg-sf-accent px-8 py-20 text-center text-white sm:px-16">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgba(255,255,255,0.25) 1px, transparent 1px)",
              backgroundSize: "48px 48px",
              maskImage: "radial-gradient(ellipse at 50% 50%, black 30%, transparent 70%)",
              WebkitMaskImage: "radial-gradient(ellipse at 50% 50%, black 30%, transparent 70%)",
            }}
          />
          <div className="relative">
            <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.2em] text-white/80">
              Ready to begin
            </p>
            <h2 className="mb-5 text-4xl font-extrabold tracking-tight sm:text-5xl">
              {t("title")}
            </h2>
            <p className="mx-auto mb-10 max-w-[52ch] text-lg text-white/85">{t("subtitle")}</p>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="inline-block">
              <Button
                size="lg"
                className="bg-sf-black text-white hover:bg-sf-black/85 h-auto px-7 py-3 text-sm"
                asChild
              >
                <Link href={deepdiveHref} className="flex items-center gap-2">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden
                  >
                    <path d="M5 12h14M13 5l7 7-7 7" />
                  </svg>
                  {t("button")}
                </Link>
              </Button>
            </motion.div>
          </div>
        </div>
      </SectionReveal>
    </section>
  );
}
