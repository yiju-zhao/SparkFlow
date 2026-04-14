import type { Metadata } from "next";
import Script from "next/script";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { Providers } from "../providers";
import "../globals.css";
import { routing } from "@/src/i18n/routing";

export const metadata: Metadata = {
  title: "SparkFlow",
  description: "AI-powered research notebook",
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

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
      >
        {/* Auto-hide scrollbar: show only while scrolling, hide after 800ms idle */}
        <Script
          id="scrollbar-autohide"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=new WeakMap();document.addEventListener("scroll",function(e){var el=e.target;if(el===document)el=document.documentElement;if(!el||!el.dataset)return;el.dataset.scrolling="";var id=t.get(el);if(id)clearTimeout(id);t.set(el,setTimeout(function(){delete el.dataset.scrolling},800))},true)})()`,
          }}
        />
        <NextIntlClientProvider messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
