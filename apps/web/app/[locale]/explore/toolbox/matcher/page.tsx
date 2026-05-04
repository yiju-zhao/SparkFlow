import { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MatcherWizard } from "@/components/explore/toolbox/matcher/matcher-wizard";
import { Button } from "@/components/ui/button";
import { Clock, FileSearch } from "lucide-react";

export const metadata: Metadata = {
  title: "Query Matcher | SparkFlow",
  description: "Match queries against conference sessions and publications",
};

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ jobId?: string }>;
}

export default async function MatcherPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const sp = await searchParams;

  // Server-side single-flight gate: if the user already has a
  // PENDING/PROCESSING job and isn't already viewing it via ?jobId=,
  // 302 to the running view. This makes "you can't start a new task
  // while one is running" a hard server-enforced rule (matches the
  // partial unique index + API-level 409 check). Eliminates the
  // upload-step flash from the client-side redirect, and prevents the
  // user from ever filling out a config that the backend will reject.
  if (!sp?.jobId) {
    const session = await auth();
    if (session?.user?.id) {
      const inflight = await prisma.matchJob.findFirst({
        where: {
          userId: session.user.id,
          status: { in: ["PENDING", "PROCESSING"] },
        },
        select: { id: true },
        orderBy: { createdAt: "desc" },
      });
      if (inflight) {
        redirect(`/${locale}/explore/toolbox/matcher?jobId=${inflight.id}`);
      }
    }
  }

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="mb-10">
        <p className="text-sf-accent text-xs font-bold uppercase tracking-[0.22em] mb-3">
          Toolbox · Active Tool
        </p>
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="flex items-start gap-5 min-w-0">
            <span className="h-14 w-14 rounded-[10px] bg-sf-accent text-white grid place-items-center shrink-0">
              <FileSearch className="h-6 w-6" strokeWidth={1.5} />
            </span>
            <div>
              <h1 className="text-[40px] md:text-[52px] font-black text-sf-ink tracking-[-0.025em] leading-[1.03]">
                Query Matcher
              </h1>
              <p className="mt-3 max-w-[64ch] text-lg leading-relaxed text-sf-ink-3">
                Upload queries and match them against conference sessions or publications using
                semantic and hybrid search.
              </p>
            </div>
          </div>
          <Link href={`/${locale}/explore/toolbox/matcher/history`}>
            <Button variant="outline" className="gap-2 h-10 border-sf-line-strong">
              <Clock className="h-4 w-4" />
              History
            </Button>
          </Link>
        </div>
      </section>

      <Suspense fallback={null}>
        <MatcherWizard />
      </Suspense>
    </div>
  );
}
