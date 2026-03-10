"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
} as const;

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 100, damping: 20 },
  },
};

export function HeroSection({ isLoggedIn }: { isLoggedIn: boolean }) {
  const deepdiveHref = isLoggedIn ? "/deepdive" : "/login";
  return (
    <section className="relative flex min-h-[90vh] items-center justify-center px-6 pt-24 pb-16">
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="visible"
        className="mx-auto flex max-w-4xl flex-col items-center text-center"
      >
        <motion.div variants={fadeUp} className="mb-12" />

        {/* Headline */}
        <motion.h1
          variants={fadeUp}
          className="mb-6 text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl"
        >
          Intelligent Research,{" "}
          <span className="text-accent-red">Powered by Agentic AI</span>
        </motion.h1>

        {/* Subline */}
        <motion.p
          variants={fadeUp}
          className="mb-10 max-w-2xl text-lg text-muted-foreground sm:text-xl"
        >
          Upload your sources, explore conferences, and let Agentic AI help you
          discover insights — all in one intelligent notebook.
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          variants={fadeUp}
          className="flex flex-wrap items-center justify-center gap-4"
        >
          <Button
            size="lg"
            className="bg-accent-red text-white hover:bg-accent-red-hover"
            asChild
          >
            <Link
              href={deepdiveHref}
              className="font-mono font-black uppercase tracking-widest"
            >
              DeepDive
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/explore">Research Hub</Link>
          </Button>
        </motion.div>
      </motion.div>
    </section>
  );
}
