import { Suspense } from "react";
import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import {
  getRecentConferences,
  getPublications,
} from "@/lib/explore/queries";
import { getWechatArticles, getWechatSources } from "@/lib/wechat/queries";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowRight,
  ArrowUpRight,
  Calendar,
  FileSearch,
  GitFork,
  Radio,
  Scan,
  Sparkles,
} from "lucide-react";
import type { RecentConferenceItem } from "@/lib/explore/types";
import type { WechatArticleSummary } from "@/lib/wechat/queries";

interface ExplorePageProps {
  params: Promise<{ locale: string }>;
}

// ─────────────────────────────────────────────────────────────
// Hero — editorial display block
// ─────────────────────────────────────────────────────────────
function HubHero({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <section className="py-10 md:py-14">
      <p className="text-sf-accent text-xs font-bold uppercase tracking-[0.22em] mb-3">
        Curation Portal
      </p>
      <h1 className="text-[44px] md:text-[64px] font-black text-sf-ink tracking-[-0.025em] leading-[1.02] max-w-[22ch]">
        {title}
      </h1>
      <p className="mt-6 max-w-[64ch] text-lg leading-relaxed text-sf-ink-3">{subtitle}</p>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// Section heading
// ─────────────────────────────────────────────────────────────
function SectionHeading({
  number,
  title,
  subtitle,
  linkHref,
  linkLabel = "VIEW ALL",
}: {
  number: string;
  title: string;
  subtitle?: string;
  linkHref?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex items-end justify-between gap-6 border-b border-sf-line pb-5 mb-8">
      <div className="flex-1 min-w-0">
        <p className="font-mono text-sf-accent text-[11px] font-bold tracking-[0.2em]">{number}</p>
        <h2 className="mt-2 text-[22px] md:text-[26px] font-black uppercase tracking-tight text-sf-ink">
          {title}
        </h2>
        {subtitle && <p className="mt-1.5 text-sm text-sf-ink-3 max-w-[62ch]">{subtitle}</p>}
      </div>
      {linkHref && (
        <Link
          href={linkHref}
          className="inline-flex items-center gap-1.5 text-sf-accent text-sm font-bold tracking-wider hover:text-sf-accent-ink transition-colors shrink-0"
        >
          {linkLabel}
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Bento — featured hero (2-col) + 2 stacked side cards
// Matches the Stitch "The Stream / Latest Insights" pattern
// ─────────────────────────────────────────────────────────────
function Bento({
  featured,
  sideA,
  sideB,
}: {
  featured: React.ReactNode;
  sideA: React.ReactNode;
  sideB: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="md:col-span-2">{featured}</div>
      <div className="grid grid-rows-2 gap-6 min-h-[440px]">
        {sideA}
        {sideB}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// 01 · CONFERENCES
// ═════════════════════════════════════════════════════════════
async function ConferencesSection({ locale }: { locale: string }) {
  const [{ data: pubs }, conferences] = await Promise.all([
    getPublications({ page: 0, showExcluded: false, sortBy: "rating", sortDir: "desc" }),
    getRecentConferences(4),
  ]);

  const featured = pubs[0];
  const sideA = pubs[1];
  const sideB = pubs[2];

  return (
    <section data-guide="conferences-nav" className="mb-24">
      <SectionHeading
        number="01"
        title="Conferences / Field Reports"
        subtitle="Indexed proceedings from global academic venues — featured publications, the latest field reports, and their recent conference cards."
        linkHref={`/${locale}/explore/conferences`}
      />

      <Bento
        featured={
          featured ? (
            <FeaturedPublicationCard locale={locale} pub={featured} />
          ) : (
            <PlaceholderFeatured label="No featured publication" />
          )
        }
        sideA={
          sideA ? (
            <SidePublicationCard locale={locale} pub={sideA} eyebrow="Top Cited" />
          ) : (
            <PlaceholderSide />
          )
        }
        sideB={
          sideB ? (
            <SidePublicationCard locale={locale} pub={sideB} eyebrow="Rising Work" />
          ) : (
            <PlaceholderSide />
          )
        }
      />

      <div className="mt-10 flex items-baseline justify-between mb-4">
        <p className="sf-row-label">Recent venues</p>
        <Link
          href={`/${locale}/explore/conferences/publications`}
          className="text-sm font-medium text-sf-ink-3 hover:text-sf-accent transition-colors"
        >
          Global publications →
        </Link>
      </div>

      {conferences.length === 0 ? (
        <div className="sf-card border-dashed py-12 text-center text-sf-ink-4">
          No recent conferences indexed.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {conferences.map((conf) => (
            <FieldReportCard key={conf.id} locale={locale} conf={conf} />
          ))}
        </div>
      )}
    </section>
  );
}

type FeaturedPub = Awaited<ReturnType<typeof getPublications>>["data"][number];

function FeaturedPublicationCard({ locale, pub }: { locale: string; pub: FeaturedPub }) {
  const authorLine =
    pub.authors.slice(0, 3).join(", ") +
    (pub.authors.length > 3 ? ` +${pub.authors.length - 3}` : "");
  return (
    <Link
      href={`/${locale}/explore/conferences/publications`}
      className="relative group overflow-hidden rounded-[10px] border border-sf-line h-[440px] flex items-end"
    >
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, hsl(222 64% 12%) 0%, hsl(236 70% 7%) 55%, #070911 100%)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(79,134,255,0.28) 1px, transparent 1px), linear-gradient(to bottom, rgba(79,134,255,0.18) 1px, transparent 1px)",
          backgroundSize: "36px 36px",
          maskImage: "radial-gradient(ellipse at 28% 42%, black 10%, transparent 72%)",
          WebkitMaskImage: "radial-gradient(ellipse at 28% 42%, black 10%, transparent 72%)",
        }}
      />
      <div
        aria-hidden
        className="absolute -top-20 -left-16 h-80 w-80 rounded-full blur-3xl opacity-45"
        style={{ background: "radial-gradient(circle, #0F5FFE 0%, transparent 70%)" }}
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent"
      />

      <div className="relative p-8 md:p-10 w-full text-white">
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <span className="sf-badge sf-badge-blue">Featured Publication</span>
          <span className="sf-badge bg-white/10 text-white/80 backdrop-blur">
            {pub.instance.venue.name} {pub.instance.year}
          </span>
        </div>
        <h3 className="text-[28px] md:text-[32px] font-extrabold mb-4 leading-[1.12] tracking-[-0.015em] max-w-[28ch]">
          {pub.title}
        </h3>
        {pub.authors.length > 0 && (
          <p className="text-white/70 text-sm mb-6 max-w-xl">{authorLine}</p>
        )}
        <div className="flex items-center gap-6 flex-wrap">
          <span className="inline-flex items-center gap-2 bg-white text-sf-black font-bold px-5 py-2.5 text-[11px] uppercase tracking-[0.16em] transition-all group-hover:bg-sf-accent group-hover:text-white rounded-[6px]">
            Read Report
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.5} />
          </span>
          {pub.rating != null && (
            <div className="flex items-baseline gap-2 text-white/80">
              <span className="font-extrabold text-[26px] tabular-nums text-white">
                {pub.rating.toFixed(1)}
              </span>
              <span className="sf-eyebrow text-white/60">Impact</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

function SidePublicationCard({
  locale,
  pub,
  eyebrow,
}: {
  locale: string;
  pub: FeaturedPub;
  eyebrow: string;
}) {
  return (
    <Link
      href={`/${locale}/explore/conferences/publications`}
      className="sf-card card-hoverable p-6 flex flex-col justify-between"
    >
      <div>
        <p className="text-sf-accent text-[10px] font-bold uppercase tracking-[0.18em] mb-2">
          {eyebrow} · {pub.instance.venue.name}
        </p>
        <h4 className="text-[17px] font-bold leading-snug text-sf-ink line-clamp-3">
          {pub.title}
        </h4>
        <p className="text-sm text-sf-ink-3 mt-2 line-clamp-1">
          {pub.authors.slice(0, 2).join(", ")}
          {pub.authors.length > 2 && ` +${pub.authors.length - 2}`}
        </p>
      </div>
      <div className="flex items-center justify-between mt-4">
        {pub.rating != null ? (
          <span className="flex items-baseline gap-1.5 text-sf-ink-3">
            <span className="font-extrabold text-sf-accent text-[20px] tabular-nums">
              {pub.rating.toFixed(1)}
            </span>
            <span className="sf-eyebrow">Impact</span>
          </span>
        ) : (
          <span className="font-mono text-[11px] text-sf-ink-4 tabular-nums">
            {pub.instance.year}
          </span>
        )}
        <ArrowUpRight className="h-4 w-4 text-sf-ink-4" />
      </div>
    </Link>
  );
}

function venueHue(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  const hues = [222, 238, 214, 248, 200, 230, 260, 192];
  return hues[Math.abs(h) % hues.length];
}

function FieldReportCard({ locale, conf }: { locale: string; conf: RecentConferenceItem }) {
  const hue = venueHue(conf.name);
  const dateLabel = (() => {
    if (conf.startDate && conf.endDate) {
      const start = new Date(conf.startDate);
      const end = new Date(conf.endDate);
      const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return `${fmt(start)}–${fmt(end)}`;
    }
    return String(conf.year);
  })();

  return (
    <Link
      href={`/${locale}/explore/conferences/${conf.id}`}
      className="group block border border-sf-line bg-sf-surface rounded-[10px] overflow-hidden hover:border-sf-line-strong transition-colors"
    >
      <div className="relative aspect-video border-b border-sf-line overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 transition-all duration-500 grayscale group-hover:grayscale-0"
          style={{
            background: `linear-gradient(135deg, hsl(${hue} 58% 22%), hsl(${hue + 14} 60% 10%))`,
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(255,255,255,0.35) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
        <div className="absolute left-3 top-3">
          <span className="sf-badge sf-badge-blue">{conf.year}</span>
        </div>
      </div>
      <div className="p-5 flex flex-col gap-2">
        <span className="px-2 py-0.5 bg-sf-accent-soft text-sf-accent-ink text-[10px] font-bold uppercase tracking-[0.16em] rounded-[4px] w-fit">
          {conf.venueName || "Conference"}
        </span>
        <h4 className="font-bold text-[17px] leading-tight text-sf-ink line-clamp-2 min-h-[2.6em]">
          {conf.name}
        </h4>
        <p className="text-[11px] text-sf-ink-4 flex items-center gap-1.5 uppercase tracking-wider font-mono tabular-nums">
          <Calendar className="h-3.5 w-3.5" />
          {dateLabel}
          {conf.location ? ` · ${conf.location}` : ""}
        </p>
        <div className="mt-2 flex items-center gap-3 text-xs text-sf-ink-3">
          <span className="font-mono tabular-nums">
            <span className="font-bold text-sf-ink">{conf.publicationCount.toLocaleString()}</span>{" "}
            pubs
          </span>
          <span className="text-sf-line-strong">·</span>
          <span className="font-mono tabular-nums">
            <span className="font-bold text-sf-ink">{conf.sessionCount.toLocaleString()}</span>{" "}
            sessions
          </span>
        </div>
        <div className="mt-4 w-full bg-sf-black text-white py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-center group-hover:bg-sf-accent transition-colors rounded-[6px]">
          View Proceedings
        </div>
      </div>
    </Link>
  );
}

// ═════════════════════════════════════════════════════════════
// 02 · SOCIAL MEDIA
// ═════════════════════════════════════════════════════════════
async function SocialMediaSection({ locale }: { locale: string }) {
  const [{ articles }, sources] = await Promise.all([
    getWechatArticles({ page: 0 }),
    getWechatSources(),
  ]);

  const featured = articles[0];
  const sideA = articles[1];
  const sideB = articles[2];
  const rest = articles.slice(3, 7);

  return (
    <section data-guide="wechat-nav" className="mb-24">
      <SectionHeading
        number="02"
        title="Social Media / Industry Pulse"
        subtitle={`Curated WeChat articles from ${sources.length} tracked research accounts — featured voices, rising posts, and the latest industry signals.`}
        linkHref={`/${locale}/explore/social-media/wechat`}
      />

      <Bento
        featured={
          featured ? (
            <FeaturedSocialCard locale={locale} article={featured} />
          ) : (
            <PlaceholderFeatured label="No featured article" />
          )
        }
        sideA={
          sideA ? (
            <SideArticleCard locale={locale} article={sideA} eyebrow="Trending" />
          ) : (
            <SourcesMini sources={sources} />
          )
        }
        sideB={
          sideB ? (
            <SideArticleCard locale={locale} article={sideB} eyebrow="Editor's Pick" />
          ) : (
            <SourcesMini sources={sources} />
          )
        }
      />

      <div className="mt-10 flex items-baseline justify-between mb-4">
        <p className="sf-row-label">Latest articles</p>
        <Link
          href={`/${locale}/explore/social-media/wechat`}
          className="text-sm font-medium text-sf-ink-3 hover:text-sf-accent transition-colors"
        >
          Full feed →
        </Link>
      </div>
      {rest.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {rest.map((article) => (
            <SocialArticleCard key={article.id} locale={locale} article={article} />
          ))}
        </div>
      ) : (
        <div className="sf-card border-dashed py-10 text-center text-sf-ink-4 text-sm">
          No additional articles yet.
        </div>
      )}
    </section>
  );
}

function FeaturedSocialCard({
  locale,
  article,
}: {
  locale: string;
  article: WechatArticleSummary;
}) {
  const date = article.publish_time
    ? new Date(article.publish_time).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;
  return (
    <Link
      href={`/${locale}/explore/social-media/wechat?article=${article.id}`}
      className="relative group overflow-hidden rounded-[10px] border border-sf-line h-[440px] flex items-end"
    >
      {article.cover_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/wechat/proxy-image?url=${encodeURIComponent(article.cover_url)}`}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition-all duration-700 grayscale group-hover:grayscale-0 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-sf-accent-soft via-sf-bg-alt to-sf-surface" />
      )}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/45 to-black/10"
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-15"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.4) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      <div className="relative p-8 md:p-10 w-full text-white">
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <span className="sf-badge sf-badge-blue">Featured WeChat</span>
          <span className="sf-badge bg-white/10 text-white/80 backdrop-blur">
            {article.source_name}
          </span>
        </div>
        <h3 className="text-[26px] md:text-[32px] font-extrabold mb-4 leading-[1.15] tracking-[-0.015em] max-w-[32ch]">
          {article.title}
        </h3>
        {article.author && (
          <p className="text-white/70 text-sm mb-6 max-w-xl">By {article.author}</p>
        )}
        <div className="flex items-center gap-6 flex-wrap">
          <span className="inline-flex items-center gap-2 bg-white text-sf-black font-bold px-5 py-2.5 text-[11px] uppercase tracking-[0.16em] transition-all group-hover:bg-sf-accent group-hover:text-white rounded-[6px]">
            Read Article
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.5} />
          </span>
          {date && (
            <div className="flex items-baseline gap-2 text-white/80">
              <span className="font-mono font-bold text-[14px] tabular-nums text-white">
                {date}
              </span>
              <span className="sf-eyebrow text-white/60">Published</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

function SideArticleCard({
  locale,
  article,
  eyebrow,
}: {
  locale: string;
  article: WechatArticleSummary;
  eyebrow: string;
}) {
  const date = article.publish_time
    ? new Date(article.publish_time).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : null;
  return (
    <Link
      href={`/${locale}/explore/social-media/wechat?article=${article.id}`}
      className="sf-card card-hoverable p-0 relative overflow-hidden flex flex-col"
    >
      {article.cover_url && (
        <div className="absolute inset-0 opacity-[0.1] pointer-events-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/wechat/proxy-image?url=${encodeURIComponent(article.cover_url)}`}
            alt=""
            className="h-full w-full object-cover grayscale"
          />
        </div>
      )}
      <div className="relative p-6 flex-1 flex flex-col justify-between">
        <div>
          <p className="text-sf-accent text-[10px] font-bold uppercase tracking-[0.18em] mb-2">
            {eyebrow} · {article.source_name}
          </p>
          <h4 className="text-[17px] font-bold leading-snug text-sf-ink line-clamp-3">
            {article.title}
          </h4>
          {article.author && (
            <p className="text-sm text-sf-ink-3 mt-2 truncate">{article.author}</p>
          )}
        </div>
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs font-medium text-sf-ink-4 font-mono tabular-nums">
            {date ?? "Latest"}
          </span>
          <ArrowUpRight className="h-4 w-4 text-sf-ink-4" />
        </div>
      </div>
    </Link>
  );
}

function SourcesMini({ sources }: { sources: { id: number; name: string }[] }) {
  return (
    <div className="sf-card-dark p-6 rounded-[10px] flex flex-col gap-3">
      <p className="sf-eyebrow text-white/60">Tracked Sources</p>
      <div className="flex items-baseline gap-2 border-b border-white/10 pb-3">
        <span className="font-extrabold text-white text-[36px] tabular-nums leading-none">
          {sources.length}
        </span>
        <span className="text-white/55 text-sm">accounts</span>
      </div>
      <ul className="flex flex-col gap-1.5 text-[13px] text-white/80 max-h-28 overflow-hidden">
        {sources.slice(0, 4).map((source) => (
          <li key={source.id} className="flex items-center gap-2">
            <Radio className="h-3 w-3 text-sf-accent shrink-0" />
            <span className="truncate">{source.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SocialArticleCard({
  locale,
  article,
}: {
  locale: string;
  article: WechatArticleSummary;
}) {
  const date = article.publish_time
    ? new Date(article.publish_time).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : null;
  return (
    <Link
      href={`/${locale}/explore/social-media/wechat?article=${article.id}`}
      className="group border border-sf-line bg-sf-surface rounded-[10px] overflow-hidden hover:border-sf-line-strong transition-colors"
    >
      <div className="aspect-[16/10] border-b border-sf-line overflow-hidden bg-sf-bg-alt">
        {article.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/wechat/proxy-image?url=${encodeURIComponent(article.cover_url)}`}
            alt=""
            className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-sf-accent-soft to-sf-bg-alt" />
        )}
      </div>
      <div className="p-4">
        <p className="text-sf-accent text-[10px] font-bold uppercase tracking-[0.16em] mb-2 truncate">
          {article.source_name}
        </p>
        <h4 className="font-bold text-[14px] leading-snug text-sf-ink line-clamp-3 min-h-[3rem]">
          {article.title}
        </h4>
        {date && (
          <p className="mt-3 text-[11px] font-mono tabular-nums text-sf-ink-4">{date}</p>
        )}
      </div>
    </Link>
  );
}

// ═════════════════════════════════════════════════════════════
// 03 · TOOLBOX
// ═════════════════════════════════════════════════════════════
function ToolboxSection({ locale }: { locale: string }) {
  const sideTools = [
    {
      href: `/${locale}/explore/toolbox`,
      icon: GitFork,
      eyebrow: "Coming Soon",
      title: "Citation Graph Explorer",
      description: "Traverse the citation network of any paper, cluster by topic, export subgraphs.",
      tag: "SOON",
    },
    {
      href: `/${locale}/explore/toolbox`,
      icon: Scan,
      eyebrow: "Coming Soon",
      title: "Author Disambiguation",
      description: "Resolve duplicate author records, merge affiliations, build clean researcher profiles.",
      tag: "SOON",
    },
  ];

  const moreTools = [
    {
      icon: Sparkles,
      title: "Trend Radar",
      description: "Track keyword velocity and emerging topics across venues.",
      tag: "SOON",
    },
    {
      icon: Scan,
      title: "Affiliation Map",
      description: "Geo-visualise institutional collaboration by year.",
      tag: "SOON",
    },
    {
      icon: GitFork,
      title: "Dataset Lineage",
      description: "Trace which datasets power which papers across years.",
      tag: "SOON",
    },
    {
      icon: Sparkles,
      title: "Topic Synth",
      description: "Generate quarterly topic syntheses from the top-rated pubs.",
      tag: "SOON",
    },
  ];

  return (
    <section className="mb-10">
      <SectionHeading
        number="03"
        title="Toolbox / Research Utilities"
        subtitle="Focused workflows that sit on top of the index — purpose-built for common research chores."
        linkHref={`/${locale}/explore/toolbox`}
      />

      <Bento
        featured={<FeaturedToolCard locale={locale} />}
        sideA={<SideToolCard {...sideTools[0]} />}
        sideB={<SideToolCard {...sideTools[1]} />}
      />

      <div className="mt-10 flex items-baseline justify-between mb-4">
        <p className="sf-row-label">On the roadmap</p>
        <Link
          href={`/${locale}/explore/toolbox`}
          className="text-sm font-medium text-sf-ink-3 hover:text-sf-accent transition-colors"
        >
          Explore toolbox →
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {moreTools.map((tool) => (
          <div
            key={tool.title}
            className="border border-sf-line bg-sf-surface rounded-[10px] p-5 flex flex-col gap-3"
          >
            <span className="sf-icon-tile h-10 w-10">
              <tool.icon className="h-[18px] w-[18px]" strokeWidth={1.5} />
            </span>
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-[15px] text-sf-ink">{tool.title}</h4>
              <span className="sf-badge sf-badge-muted">{tool.tag}</span>
            </div>
            <p className="text-sm text-sf-ink-3 leading-relaxed">{tool.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function FeaturedToolCard({ locale }: { locale: string }) {
  return (
    <Link
      data-guide="matcher-nav"
      href={`/${locale}/explore/toolbox/matcher`}
      className="relative group overflow-hidden rounded-[10px] border border-sf-line h-[440px] flex items-end"
    >
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, hsl(214 80% 14%) 0%, hsl(232 72% 9%) 55%, #060a18 100%)",
        }}
      />
      {/* Concentric blue rings to evoke radar / matching */}
      <div aria-hidden className="absolute inset-0 grid place-items-center opacity-30">
        <div className="absolute h-[420px] w-[420px] rounded-full border border-sf-accent/40" />
        <div className="absolute h-[320px] w-[320px] rounded-full border border-sf-accent/30" />
        <div className="absolute h-[220px] w-[220px] rounded-full border border-sf-accent/20" />
        <div className="absolute h-[120px] w-[120px] rounded-full border border-sf-accent/15" />
      </div>
      <div
        aria-hidden
        className="absolute -bottom-24 -right-10 h-96 w-96 rounded-full blur-3xl opacity-50"
        style={{ background: "radial-gradient(circle, #0F5FFE 0%, transparent 70%)" }}
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(79,134,255,0.22) 1px, transparent 1px), linear-gradient(to bottom, rgba(79,134,255,0.14) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          maskImage: "radial-gradient(ellipse at 70% 60%, black 10%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse at 70% 60%, black 10%, transparent 75%)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent"
      />

      <div className="relative p-8 md:p-10 w-full text-white">
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <span className="sf-badge sf-badge-blue">Featured Tool</span>
          <span className="sf-badge bg-white/10 text-white/80 backdrop-blur">Active</span>
        </div>
        <div className="flex items-start gap-5 mb-5">
          <span className="h-14 w-14 rounded-[10px] bg-sf-accent text-white grid place-items-center shrink-0">
            <FileSearch className="h-6 w-6" strokeWidth={1.5} />
          </span>
          <h3 className="text-[28px] md:text-[32px] font-extrabold leading-[1.12] tracking-[-0.015em] max-w-[24ch]">
            Query Matcher
          </h3>
        </div>
        <p className="text-white/75 text-[15px] leading-relaxed max-w-[56ch] mb-6">
          Drop in an arbitrary research query — get ranked publications and sessions with
          rationale, impact score, and direct citations.
        </p>
        <div className="flex items-center gap-6 flex-wrap">
          <span className="inline-flex items-center gap-2 bg-white text-sf-black font-bold px-5 py-2.5 text-[11px] uppercase tracking-[0.16em] transition-all group-hover:bg-sf-accent group-hover:text-white rounded-[6px]">
            Open Matcher
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.5} />
          </span>
          <div className="flex items-baseline gap-2 text-white/80">
            <span className="font-mono font-bold text-[14px] tabular-nums text-white">v1.0</span>
            <span className="sf-eyebrow text-white/60">Stable</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function SideToolCard({
  icon: Icon,
  eyebrow,
  title,
  description,
  tag,
  href,
}: {
  icon: typeof FileSearch;
  eyebrow: string;
  title: string;
  description: string;
  tag: string;
  href?: string;
}) {
  const content = (
    <>
      <div>
        <p className="text-sf-accent text-[10px] font-bold uppercase tracking-[0.18em] mb-2">
          {eyebrow}
        </p>
        <div className="flex items-center gap-2 mb-2">
          <span className="sf-icon-tile h-8 w-8">
            <Icon className="h-4 w-4" strokeWidth={1.5} />
          </span>
          <h4 className="text-[17px] font-bold leading-snug text-sf-ink">{title}</h4>
        </div>
        <p className="text-sm text-sf-ink-3 mt-2 line-clamp-3">{description}</p>
      </div>
      <div className="flex items-center justify-between mt-4">
        <span className="sf-badge sf-badge-muted">{tag}</span>
        <ArrowUpRight className="h-4 w-4 text-sf-ink-4" />
      </div>
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className="sf-card card-hoverable p-6 flex flex-col justify-between"
      >
        {content}
      </Link>
    );
  }
  return (
    <div className="sf-card p-6 flex flex-col justify-between opacity-85">{content}</div>
  );
}

// ─────────────────────────────────────────────────────────────
// Placeholders for empty data states
// ─────────────────────────────────────────────────────────────
function PlaceholderFeatured({ label }: { label: string }) {
  return (
    <div className="sf-card border-dashed h-[440px] flex items-center justify-center text-sf-ink-4 rounded-[10px]">
      {label}
    </div>
  );
}

function PlaceholderSide() {
  return (
    <div className="sf-card border-dashed flex items-center justify-center text-sf-ink-4 rounded-[10px]">
      No entry yet
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// Page
// ═════════════════════════════════════════════════════════════
export default async function ExplorePage({ params }: ExplorePageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("explore");

  return (
    <div className="flex flex-col">
      <HubHero title={t("title")} subtitle={t("subtitle")} />

      <Suspense fallback={<BigSectionSkeleton />}>
        <ConferencesSection locale={locale} />
      </Suspense>

      <Suspense fallback={<BigSectionSkeleton />}>
        <SocialMediaSection locale={locale} />
      </Suspense>

      <ToolboxSection locale={locale} />
    </div>
  );
}

function BigSectionSkeleton() {
  return (
    <section className="mb-24">
      <div className="h-14 border-b border-sf-line mb-8" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Skeleton className="md:col-span-2 h-[440px] rounded-[10px]" />
        <div className="grid grid-rows-2 gap-6">
          <Skeleton className="h-full rounded-[10px]" />
          <Skeleton className="h-full rounded-[10px]" />
        </div>
      </div>
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4 mt-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[380px] rounded-[10px]" />
        ))}
      </div>
    </section>
  );
}
