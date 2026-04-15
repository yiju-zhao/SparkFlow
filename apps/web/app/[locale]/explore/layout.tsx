import { auth } from "@/lib/auth";
import { ExploreShell } from "@/components/explore/explore-shell";

export default async function ExploreLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  return <ExploreShell user={session?.user}>{children}</ExploreShell>;
}
