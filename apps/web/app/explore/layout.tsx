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
          className="px-3 py-1.5 text-sm border border-[#555] rounded text-[#ccc] hover:text-white hover:border-accent-red transition-colors"
        >
          ← back to deepdive
        </Link>
      }
      user={session?.user}
    >
      {children}
    </ExploreShell>
  );
}
