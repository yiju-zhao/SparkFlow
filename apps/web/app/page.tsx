import { auth } from "@/lib/auth";
import { LandingPage } from "@/components/landing/landing-page";

export default async function Home() {
  const session = await auth();

  return (
    <LandingPage
      user={
        session?.user
          ? {
              name: session.user.name ?? null,
              email: session.user.email ?? null,
              image: session.user.image ?? null,
            }
          : null
      }
    />
  );
}
