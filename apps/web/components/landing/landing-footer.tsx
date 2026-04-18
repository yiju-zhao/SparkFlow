import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { SparkflowLockup } from "@/components/ui/sparkflow-lockup";

const footerCols = [
  {
    heading: "Product",
    links: [
      { label: "Hub", href: "/explore" },
      { label: "DeepDive", href: "/deepdive" },
      { label: "Toolbox", href: "/explore/toolbox" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "Documentation", href: "#" },
      { label: "API Reference", href: "#" },
      { label: "Changelog", href: "#" },
    ],
  },
  {
    heading: "Connect",
    links: [
      { label: "GitHub", href: "#" },
      { label: "Slack", href: "#" },
      { label: "Contact", href: "#" },
    ],
  },
] as const;

export function LandingFooter() {
  const t = useTranslations("landing.footer");
  const locale = useLocale();

  return (
    <footer className="border-t border-sf-line bg-sf-black px-6 py-16 text-white">
      <div className="mx-auto grid max-w-[1200px] gap-12 md:grid-cols-[1.2fr_repeat(3,1fr)]">
        <div className="flex flex-col gap-4">
          <Link href={`/${locale}`} className="inline-flex">
            <SparkflowLockup tag="HUB" size="md" inverse />
          </Link>
          <p className="text-sm leading-relaxed text-white/60 max-w-[38ch]">{t("tagline")}</p>
        </div>

        {footerCols.map((col) => (
          <div key={col.heading} className="flex flex-col gap-3">
            <span className="sf-eyebrow text-white/60">{col.heading}</span>
            <ul className="flex flex-col gap-2">
              {col.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-white/75 transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mx-auto mt-12 flex max-w-[1200px] flex-col items-start justify-between gap-3 border-t border-white/10 pt-8 md:flex-row md:items-center">
        <p className="font-mono text-[11px] uppercase tracking-widest text-white/40">
          © {new Date().getFullYear()} {t("copyright")}
        </p>
        <p className="font-mono text-[11px] uppercase tracking-widest text-white/40">
          Design system v1.0 · April 2026
        </p>
      </div>
    </footer>
  );
}
