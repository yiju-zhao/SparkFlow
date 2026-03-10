import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { SettingsForm } from "@/components/settings/settings-form";

export default async function SettingsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  // Fetch user settings
  const settings = await prisma.userSettings.findUnique({
    where: { userId: session.user.id },
    select: {
      modelProvider: true,
      modelName: true,
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="space-y-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
            <p className="text-muted-foreground mt-1">
              Configure your AI model preferences
            </p>
          </div>

          <div className="rounded-lg border bg-card p-6 shadow-sm">
            <h2 className="text-lg font-medium mb-1">AI Model</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Choose your preferred AI model for conversations
            </p>
            <SettingsForm
              initialSettings={
                settings
                  ? {
                      modelProvider: settings.modelProvider,
                      modelName: settings.modelName,
                    }
                  : undefined
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
