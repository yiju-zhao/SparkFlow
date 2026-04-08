import { auth } from "@/lib/auth";
import { setRequestLocale } from "next-intl/server";
import { LandingPage } from "@/components/landing/landing-page";

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();

  return (
    <LandingPage
      user={
        session?.user
          ? {
              name: session.user.name ?? null,
              email: session.user.email ?? null,
              image: session.user.image ?? null,
              role: session.user.role ?? null,
            }
          : null
      }
    />
  );
}
