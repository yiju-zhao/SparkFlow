import { auth } from "@/lib/auth";
import Link from "next/link";
import { ExploreShell } from "./explore-shell";

// Nav links component for Explore
import ExploreNavLinks from "./nav-links";

export default async function ExploreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <ExploreShell
      title="research-hub"
      navLinks={<ExploreNavLinks />}
      actionButton={
        <Link
          href="/deepdive"
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono font-bold uppercase tracking-[0.15em] opacity-80 hover:opacity-100 transition-all group"
        >
          <span className="group-hover:-translate-x-1 transition-transform">
            ←
          </span>
          <span>deepdive</span>
        </Link>
      }
      user={session?.user}
    >
      {children}
    </ExploreShell>
  );
}
