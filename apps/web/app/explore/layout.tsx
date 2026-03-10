import { auth } from "@/lib/auth";
import { ExploreShellWrapper } from "./explore-shell-wrapper";

export default async function ExploreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <ExploreShellWrapper user={session?.user}>
      {children}
    </ExploreShellWrapper>
  );
}
