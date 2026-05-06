import type { Metadata } from "next";
import localFont from "next/font/local";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { Providers } from "../providers";
import { ScrollbarAutoHide } from "./_components/scrollbar-autohide";
import "../globals.css";
import { routing } from "@/src/i18n/routing";
import { auth } from "@/lib/auth";
import { GuideProvider } from "@/components/guides/guide-provider";
import { GuideDrawer } from "@/components/guides/guide-drawer";
import { FloatingGuideButton } from "@/components/guides/floating-guide-button";
import { FirstRunTour } from "@/components/guides/first-run-tour";
import { ActiveGuidePlayer } from "@/components/guides/active-guide-player";
import { FloatingFeedbackButton } from "@/components/feedback/floating-feedback-button";

const interSans = localFont({
  src: "../../public/fonts/inter-latin-wght-normal.woff2",
  variable: "--font-sparkflow-sans",
  weight: "100 900",
  display: "swap",
});

const jetbrainsMono = localFont({
  src: "../../public/fonts/jetbrains-mono-latin-wght-normal.woff2",
  variable: "--font-sparkflow-mono",
  weight: "100 800",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SparkFlow",
  description: "A quiet, data-dense research product system — Hub + DeepDive.",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Validate locale
  if (!routing.locales.includes(locale as "en" | "zh")) {
    notFound();
  }

  // Enable static rendering
  setRequestLocale(locale);

  // Get messages for the current locale
  const messages = await getMessages();

  const session = await auth();
  const isAuthenticated = Boolean(session?.user?.id);

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${interSans.variable} ${jetbrainsMono.variable} antialiased`}>
        <ScrollbarAutoHide />
        <NextIntlClientProvider messages={messages}>
          <Providers>
            <GuideProvider isAuthenticated={isAuthenticated}>
              {children}
              <GuideDrawer />
              <FloatingGuideButton />
              <FloatingFeedbackButton isAuthenticated={isAuthenticated} />
              <FirstRunTour />
              <ActiveGuidePlayer />
            </GuideProvider>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
