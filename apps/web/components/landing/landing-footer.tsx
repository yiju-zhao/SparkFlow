import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";

const socialLinks = [
  { label: "Slack", href: "#" },
  { label: "GitHub", href: "#" },
  { label: "Wiki", href: "#" },
  { label: "Jira", href: "#" },
];

export function LandingFooter() {
  const t = useTranslations("landing.footer");
  const locale = useLocale();

  return (
    <footer className="border-t border-border bg-foreground px-6 py-12 text-background">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 sm:flex-row sm:justify-between">
        {/* Brand */}
        <div className="flex flex-col items-center gap-1 sm:items-start">
          <Link href={`/${locale}`} className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-red">
              <span className="text-xs font-bold text-white">S</span>
            </div>
            <span className="font-semibold">SparkFlow</span>
          </Link>
          <p className="text-sm text-background/60">{t("tagline")}</p>
        </div>

        {/* Links & Copyright */}
        <div className="flex flex-col items-center gap-3 sm:items-end">
          <div className="flex gap-4">
            {socialLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-sm text-background/60 transition-colors hover:text-background"
              >
                {link.label}
              </Link>
            ))}
          </div>
          <p className="text-xs text-background/40">
            &copy; {new Date().getFullYear()} {t("copyright")}
          </p>
        </div>
      </div>
    </footer>
  );
}
