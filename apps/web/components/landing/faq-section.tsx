"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus } from "lucide-react";
import { SectionReveal } from "./section-reveal";
import { useTranslations } from "next-intl";

function FaqItem({
  question,
  answer,
  index,
  isOpen,
  onToggle,
}: {
  question: string;
  answer: string;
  index: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-sf-line">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-6 py-5 text-left transition-colors hover:bg-sf-surface-muted/40"
      >
        <span className="sf-eyebrow w-14 shrink-0 text-sf-ink-4">{index}</span>
        <span className="flex-1 font-semibold text-sf-ink">{question}</span>
        <motion.div
          animate={{ rotate: isOpen ? 45 : 0 }}
          transition={{ duration: 0.2 }}
          className="shrink-0 text-sf-ink-3"
        >
          <Plus className="h-4 w-4" strokeWidth={1.75} />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <p className="pb-6 pl-20 text-sm leading-relaxed text-sf-ink-3">{answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function FaqSection() {
  const t = useTranslations("landing.faq");
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const faqs = [
    { question: t("q1.question"), answer: t("q1.answer") },
    { question: t("q2.question"), answer: t("q2.answer") },
    { question: t("q3.question"), answer: t("q3.answer") },
    { question: t("q4.question"), answer: t("q4.answer") },
    { question: t("q5.question"), answer: t("q5.answer") },
  ];

  return (
    <section id="faq" className="px-6 py-24">
      <div className="mx-auto max-w-[960px]">
        <SectionReveal>
          <div className="mb-10">
            <p className="sf-eyebrow">FAQ</p>
            <h2 className="sf-h1 mt-2">{t("title")}</h2>
            <p className="sf-lede mt-4 max-w-[54ch]">{t("subtitle")}</p>
          </div>
        </SectionReveal>

        <SectionReveal delay={0.1}>
          <div className="border-t border-sf-line">
            {faqs.map((faq, i) => (
              <FaqItem
                key={i}
                index={String(i + 1).padStart(2, "0")}
                question={faq.question}
                answer={faq.answer}
                isOpen={openIndex === i}
                onToggle={() => setOpenIndex(openIndex === i ? null : i)}
              />
            ))}
          </div>
        </SectionReveal>
      </div>
    </section>
  );
}
