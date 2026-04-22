import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { SettingsWorkspace } from "@/components/settings/settings-workspace";

export default async function SettingsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const [settings, user] = await Promise.all([
    prisma.userSettings.findUnique({
      where: { userId: session.user.id },
      select: {
        modelProvider: true,
        modelName: true,
        wikiModelProvider: true,
        wikiModelName: true,
        searchModelProvider: true,
        searchModelName: true,
        semopsModelProvider: true,
        semopsModelName: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        username: true,
        email: true,
        role: true,
      },
    }),
  ]);

  return (
    <SettingsWorkspace
      initialSettings={settings ?? undefined}
      user={{
        username: user?.username ?? "",
        email: user?.email ?? "",
        role: user?.role ?? "USER",
      }}
    />
  );
}
