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
        <div className="mx-auto max-w-4xl rounded-2xl bg-foreground px-8 py-16 text-center text-background sm:px-16">
          <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            {t("title")}
          </h2>
          <p className="mx-auto mb-8 max-w-lg text-background/70">
            {t("subtitle")}
          </p>
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
            <Button
              size="lg"
              className="bg-accent-red text-white hover:bg-accent-red-hover"
              asChild
            >
              <Link
                href={deepdiveHref}
                className="font-mono font-black uppercase tracking-widest"
              >
                {t("button")}
              </Link>
            </Button>
          </motion.div>
        </div>
      </SectionReveal>
    </section>
  );
}
