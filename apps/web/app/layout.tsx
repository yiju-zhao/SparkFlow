import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "SparkFlow",
  description: "AI-powered research notebook",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
      >
        {/* Auto-hide scrollbar: show only while scrolling, hide after 800ms idle */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=new WeakMap();document.addEventListener("scroll",function(e){var el=e.target;if(el===document)el=document.documentElement;if(!el||!el.classList)return;el.classList.add("is-scrolling");var id=t.get(el);if(id)clearTimeout(id);t.set(el,setTimeout(function(){el.classList.remove("is-scrolling")},800))},true)})()`,
          }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
