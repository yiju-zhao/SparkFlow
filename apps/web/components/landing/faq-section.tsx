"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionReveal } from "./section-reveal";

const faqs = [
  {
    question: "What types of documents can I upload?",
    answer:
      "SparkFlow supports PDFs, Word documents, and webpages. Documents are automatically parsed, chunked, and indexed for Agentic AI-powered retrieval. Our parsers handle complex layouts including tables, figures, and multi-column text.",
  },
  {
    question: "How does the Agentic AI citation system work?",
    answer:
      "When you chat with your sources, SparkFlow uses Retrieval-Augmented Generation (RAG) to ground every Agentic AI response in your actual documents. Each claim is linked back to the specific chunk it came from, so you can always verify the source.",
  },
  {
    question: "Can I explore academic conferences?",
    answer:
      "Yes! SparkFlow includes a conference explorer that lets you browse publications, sessions, and presentations from indexed academic conferences. You can search, filter, and add relevant papers directly to your research notebooks.",
  },
  {
    question: "Is my research data private?",
    answer:
      "Your documents and research data are stored securely and are only accessible to you. SparkFlow uses enterprise-grade encryption and access controls to protect your intellectual property.",
  },
  {
    question: "Does SparkFlow support dark mode?",
    answer:
      "Absolutely! SparkFlow features a premium dark mode with carefully tuned contrast ratios for comfortable late-night research sessions. You can switch between light, dark, and system themes at any time.",
  },
];

function FaqItem({
  question,
  answer,
  isOpen,
  onToggle,
}: {
  question: string;
  answer: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-border">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between py-5 text-left"
      >
        <span className="pr-4 font-medium">{question}</span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="shrink-0"
        >
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <p className="pb-5 text-sm leading-relaxed text-muted-foreground">
              {answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section id="faq" className="px-6 py-24">
      <div className="mx-auto max-w-2xl">
        <SectionReveal>
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
              Frequently Asked Questions
            </h2>
            <p className="text-muted-foreground">
              Everything you need to know about SparkFlow
            </p>
          </div>
        </SectionReveal>

        <SectionReveal delay={0.1}>
          <div className="border-t border-border">
            {faqs.map((faq, i) => (
              <FaqItem
                key={i}
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
