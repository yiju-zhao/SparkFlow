import Link from "next/link";
import prisma from "@/lib/prisma";
import { setRequestLocale, getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function AdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin");

  const [venueCount, instanceCount, sessionCount] = await Promise.all([
    prisma.venue.count(),
    prisma.instance.count(),
    prisma.conferenceSession.count(),
  ]);

  const stats = [
    { label: t("venues.title"), count: venueCount, href: `/${locale}/admin/venues` },
    { label: t("instances.title"), count: instanceCount, href: `/${locale}/admin/instances` },
    { label: t("sessions.title"), count: sessionCount, href: `/${locale}/admin/sessions` },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">{t("title")}</h1>
      <div className="grid grid-cols-3 gap-4">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="block border rounded-lg p-6 bg-card hover:bg-accent transition-colors"
          >
            <div className="text-3xl font-bold mb-1">{stat.count}</div>
            <div className="text-sm text-muted-foreground">{stat.label}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
