import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { SettingsForm } from "@/components/settings/settings-form";
import { BackButton } from "./back-button";
import { SparkflowLockup } from "@/components/ui/sparkflow-lockup";

type NavItem = { href: string; label: string; active?: boolean };
const navItems: NavItem[] = [
  { href: "#models", label: "AI Models", active: true },
  { href: "#api-keys", label: "API Keys" },
  { href: "#data-sources", label: "Data Sources" },
  { href: "#account", label: "Account" },
];

export default async function SettingsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const settings = await prisma.userSettings.findUnique({
    where: { userId: session.user.id },
    select: {
      modelProvider: true,
      modelName: true,
      wikiModelProvider: true,
      wikiModelName: true,
      searchModelProvider: true,
      searchModelName: true,
      matcherModelProvider: true,
      matcherModelName: true,
    },
  });

  return (
    <div className="flex min-h-screen flex-col bg-sf-bg">
      {/* Slim top bar with SPARKFLOW lockup */}
      <header className="border-b border-sf-line bg-sf-surface">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between px-8">
          <Link href="/" className="flex items-center">
            <SparkflowLockup tag={null} size="sm" />
          </Link>
          <BackButton />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1280px] flex-1 gap-10 px-8 py-10">
        {/* 220px side nav — archetype C */}
        <aside className="hidden w-[220px] shrink-0 md:block">
          <p className="sf-row-label">Settings</p>
          <p className="sf-meta mt-1 mb-5">Manage your AI infrastructure</p>
          <nav className="flex flex-col gap-1">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={`sf-sidenav-item ${item.active ? "is-active" : ""}`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                {item.label}
              </a>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 flex flex-col gap-10">
          {/* AI Models section */}
          <section id="models" className="flex flex-col gap-4">
            <div>
              <p className="sf-eyebrow">01 · MODELS</p>
              <h1 className="sf-h2 mt-1.5">AI Models</h1>
              <p className="sf-lede mt-2 max-w-[58ch]">
                Choose the model that powers each surface — chat, wiki extraction, search
                reranking, and the matcher. Defaults come from your admin configuration.
              </p>
            </div>

            <div className="sf-callout mb-1">
              <b className="text-sf-accent-ink text-[13px]">Bring your own key (BYOK)</b>
              <p className="sf-meta mt-1 text-sf-accent-ink/80">
                Configure a provider API key below to unlock its models. Keys are encrypted at rest
                with AES-256 and only decrypted in-memory during inference.
              </p>
            </div>

            <div className="sf-card p-7">
              <SettingsForm
                initialSettings={
                  settings
                    ? {
                        modelProvider: settings.modelProvider,
                        modelName: settings.modelName,
                        wikiModelProvider: settings.wikiModelProvider,
                        wikiModelName: settings.wikiModelName,
                        searchModelProvider: settings.searchModelProvider,
                        searchModelName: settings.searchModelName,
                        matcherModelProvider: settings.matcherModelProvider,
                        matcherModelName: settings.matcherModelName,
                      }
                    : undefined
                }
              />
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
