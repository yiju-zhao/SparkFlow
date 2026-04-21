import Link from "next/link";
import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { getWechatArticles, getWechatSources } from "@/lib/wechat/queries";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowRight,
  Code2,
  GitFork,
  Heart,
  MessageCircle,
  Newspaper,
  Radio,
  Repeat,
  Sparkles,
  Star,
  Twitter,
} from "lucide-react";
import type { WechatArticleSummary } from "@/lib/wechat/queries";

interface PageProps {
  params: Promise<{ locale: string }>;
}

// ─────────────────────────────────────────────────────────────
// Section heading
// ─────────────────────────────────────────────────────────────
function SectionHeader({
  icon,
  title,
  cta,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  cta?: string;
  href?: string;
}) {
  return (
    <div className="flex items-center justify-between border-b border-sf-line pb-3">
      <h2 className="text-[20px] font-bold text-sf-ink flex items-center gap-2.5">
        <span className="text-sf-accent">{icon}</span>
        {title}
      </h2>
      {cta && href && (
        <Link
          href={href}
          className="text-sm font-semibold text-sf-accent hover:underline flex items-center gap-1"
        >
          {cta} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}

function ComingSoonBadge() {
  return (
    <span className="inline-flex items-center gap-1 sf-badge sf-badge-muted">
      <Sparkles className="h-3 w-3" />
      Coming Soon
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// WeChat Articles section (real data)
// ─────────────────────────────────────────────────────────────
async function WechatSection({ locale }: { locale: string }) {
  const [{ articles }, sources] = await Promise.all([
    getWechatArticles({ page: 0 }),
    getWechatSources(),
  ]);
  const preview = articles.slice(0, 4);

  return (
    <section className="lg:col-span-8 space-y-5">
      <SectionHeader
        icon={<MessageCircle className="h-5 w-5" strokeWidth={1.75} />}
        title="WeChat Articles"
        cta="View all"
        href={`/${locale}/explore/social-media/wechat`}
      />

      {preview.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {preview.map((article) => (
            <WechatPreviewCard key={article.id} locale={locale} article={article} />
          ))}
        </div>
      ) : (
        <div className="sf-card border-dashed flex flex-col items-center gap-3 py-12 text-sf-ink-4 text-sm">
          No WeChat articles indexed yet.
        </div>
      )}

      {sources.length > 0 && (
        <p className="text-xs text-sf-ink-4 pt-2 flex items-center gap-2">
          <Radio className="h-3 w-3 text-sf-accent" />
          Tracking{" "}
          <span className="font-bold text-sf-ink tabular-nums">{sources.length}</span> WeChat
          accounts.
        </p>
      )}
    </section>
  );
}

function WechatPreviewCard({
  locale,
  article,
}: {
  locale: string;
  article: WechatArticleSummary;
}) {
  const rel = article.publish_time
    ? getRelativeTimeLabel(new Date(article.publish_time))
    : null;
  return (
    <Link
      href={`/${locale}/explore/social-media/wechat?article=${article.id}`}
      className="group bg-sf-surface border border-sf-line overflow-hidden flex flex-col rounded-[10px] hover:border-sf-line-strong hover:shadow-[0_12px_32px_-16px_rgba(16,24,40,0.16)] transition-all"
    >
      <div className="aspect-video w-full overflow-hidden bg-sf-bg-alt">
        {article.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/wechat/proxy-image?url=${encodeURIComponent(article.cover_url)}`}
            alt=""
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-sf-accent-soft to-sf-bg-alt" />
        )}
      </div>
      <div className="p-5 flex flex-col flex-grow">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="px-2 py-0.5 bg-sf-accent-soft text-sf-accent-ink text-[10px] font-bold uppercase tracking-[0.14em] rounded-[3px] truncate max-w-[14ch]">
            {article.source_name}
          </span>
          {rel && (
            <span className="text-sf-ink-4 text-xs font-medium font-mono tabular-nums">
              {rel}
            </span>
          )}
        </div>
        <h3 className="text-[17px] font-bold mb-2 leading-snug line-clamp-2 text-sf-ink group-hover:text-sf-accent transition-colors">
          {article.title}
        </h3>
        {article.author && (
          <p className="text-sm text-sf-ink-3 line-clamp-1 mt-auto pt-2">By {article.author}</p>
        )}
      </div>
    </Link>
  );
}

function getRelativeTimeLabel(date: Date) {
  const diffMs = Date.now() - date.getTime();
  const min = Math.round(diffMs / 60_000);
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 14) return `${d}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─────────────────────────────────────────────────────────────
// Twitter / X Trending — placeholder
// ─────────────────────────────────────────────────────────────
function TwitterSection() {
  const placeholders = [
    {
      handle: "@ai_frontiers",
      name: "AI Frontiers",
      body: "Decentralized social graphs + privacy — what changes when the protocol becomes the platform? 🧵 1/12",
      reposts: "—",
      likes: "—",
    },
    {
      handle: "@openscience_hub",
      name: "OpenScience Institute",
      body: "New benchmarking suite for social sentiment analysis. Open source, peer-reviewed.",
      reposts: "—",
      likes: "—",
    },
    {
      handle: "@research_weekly",
      name: "Research Weekly",
      body: "Call for papers: long-context retrieval at scale. Abstracts due Q3.",
      reposts: "—",
      likes: "—",
    },
  ];

  return (
    <section className="lg:col-span-4 space-y-5">
      <SectionHeader
        icon={<Twitter className="h-5 w-5" strokeWidth={1.75} />}
        title="Twitter / X Trending"
      />
      <div className="space-y-4">
        {placeholders.map((t) => (
          <article
            key={t.handle}
            className="bg-sf-surface border border-sf-line p-4 rounded-[10px] opacity-90"
          >
            <div className="flex items-center gap-3 mb-3">
              <span
                className="h-10 w-10 rounded-full border border-sf-line bg-sf-bg-alt grid place-items-center font-bold text-sf-ink-3 text-xs uppercase"
                aria-hidden
              >
                {t.name
                  .split(" ")
                  .slice(0, 2)
                  .map((s) => s[0])
                  .join("")}
              </span>
              <div>
                <p className="text-sm font-bold text-sf-ink">{t.name}</p>
                <p className="text-xs text-sf-ink-4 font-mono">{t.handle}</p>
              </div>
            </div>
            <p className="text-sm text-sf-ink-2 mb-3 leading-relaxed">{t.body}</p>
            <div className="flex items-center justify-between text-xs text-sf-ink-4">
              <div className="flex gap-4">
                <span className="flex items-center gap-1">
                  <Repeat className="h-3.5 w-3.5" />
                  {t.reposts}
                </span>
                <span className="flex items-center gap-1">
                  <Heart className="h-3.5 w-3.5" />
                  {t.likes}
                </span>
              </div>
              <ComingSoonBadge />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// GitHub Repositories — placeholder
// ─────────────────────────────────────────────────────────────
function GithubSection() {
  const repos = [
    {
      name: "social-graph-analyser",
      description:
        "High-performance Rust library for processing massive social interconnection datasets.",
      language: "Rust",
      color: "#dea584",
      stars: "—",
      forks: "—",
      updated: "—",
    },
    {
      name: "nlp-bench-cn",
      description:
        "Bilingual NLP benchmarking suite focused on Mandarin-first language model evaluation.",
      language: "Python",
      color: "#3572A5",
      stars: "—",
      forks: "—",
      updated: "—",
    },
    {
      name: "trend-whisperer",
      description:
        "Real-time anomaly detection for emerging cultural trends across X, TikTok, and Reddit.",
      language: "TypeScript",
      color: "#3178c6",
      stars: "—",
      forks: "—",
      updated: "—",
    },
  ];

  return (
    <section className="lg:col-span-12 space-y-5 mt-4">
      <SectionHeader
        icon={<Code2 className="h-5 w-5" strokeWidth={1.75} />}
        title="GitHub Repositories"
      />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {repos.map((r) => (
          <article
            key={r.name}
            className="bg-sf-surface border border-sf-line p-5 rounded-[10px] hover:border-sf-line-strong transition-colors flex flex-col opacity-90"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <Code2 className="h-4 w-4 text-sf-ink-4 shrink-0" strokeWidth={1.75} />
                <span className="text-[17px] font-bold text-sf-accent truncate">{r.name}</span>
              </div>
              <ComingSoonBadge />
            </div>
            <p className="text-sm text-sf-ink-3 mb-6 flex-grow leading-relaxed">{r.description}</p>
            <div className="flex items-center gap-4 text-xs text-sf-ink-4 font-mono">
              <div className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: r.color }}
                />
                <span className="font-medium text-sf-ink-2">{r.language}</span>
              </div>
              <div className="flex items-center gap-1">
                <Star className="h-3.5 w-3.5" />
                <span>{r.stars}</span>
              </div>
              <div className="flex items-center gap-1">
                <GitFork className="h-3.5 w-3.5" />
                <span>{r.forks}</span>
              </div>
              <span className="ml-auto">Updated {r.updated}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// Trending AI News — placeholder
// ─────────────────────────────────────────────────────────────
function AiNewsSection() {
  const items = [
    {
      eyebrow: "NVIDIA / ANTHROPIC",
      title: "Blackwell chips meet Claude: the future of super-inference",
      body: "Silicon architecture claims a 4× speed-up in long-context retrieval for flagship reasoning models.",
      sources: ["CNBC", "AI Valley"],
    },
    {
      eyebrow: "QWEN / KIMI / GLM",
      title: "Open-source LLM surge: Alibaba's Qwen 2.5 sets new benchmarks",
      body: "Fresh benchmarks from alphaXiv show Qwen outperforming GPT-4o on mathematical reasoning.",
      sources: ["Hugging Face", "ByteDance"],
    },
    {
      eyebrow: "XAI / NVIDIA",
      title: "xAI activates Colossus cluster with 100k H100 GPUs",
      body: "xAI completes deployment of the world's largest AI training cluster in record time.",
      sources: ["Yahoo News", "Ben's Bites"],
    },
    {
      eyebrow: "BYTEDANCE / VIDEO",
      title: "MagicVideo-V2: ByteDance unveils SOTA video generation",
      body: "Multimodal model produces high-fidelity video from complex text prompts.",
      sources: ["ByteByteGo", "AI News"],
    },
    {
      eyebrow: "TENCENT / GLM-4",
      title: "Hunyuan-Large: Tencent's answer to GPT-4 class models",
      body: "Mixture-of-experts model demonstrates state-of-the-art performance in bilingual reasoning.",
      sources: ["Hacker News", "alphaXiv"],
    },
    {
      eyebrow: "INDUSTRY TRENDS",
      title: "The rise of agentic workflows in enterprise SaaS",
      body: "How autonomous agents from Kimi and GLM are transforming digital operations in APAC markets.",
      sources: ["AI News (RSS)", "Ben's Bites"],
    },
  ];

  return (
    <section className="lg:col-span-12 space-y-5 mt-4">
      <SectionHeader
        icon={<Newspaper className="h-5 w-5" strokeWidth={1.75} />}
        title="Trending AI News"
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {items.map((n) => (
          <article
            key={n.title}
            className="flex flex-col bg-sf-surface border border-sf-line p-5 hover:border-sf-accent transition-colors rounded-[10px] opacity-90"
          >
            <div className="flex justify-between items-center mb-3">
              <span className="text-[10px] font-bold text-sf-accent tracking-[0.18em] uppercase truncate">
                {n.eyebrow}
              </span>
              <ComingSoonBadge />
            </div>
            <h3 className="font-bold text-[15px] mb-2 leading-snug text-sf-ink">{n.title}</h3>
            <p className="text-xs text-sf-ink-3 line-clamp-2 leading-relaxed">{n.body}</p>
            <div className="mt-4 pt-3 border-t border-sf-line flex items-center gap-1.5 flex-wrap">
              {n.sources.map((s) => (
                <span
                  key={s}
                  className="text-[10px] font-medium px-1.5 py-0.5 bg-sf-bg-alt text-sf-ink-3 rounded-[3px]"
                >
                  {s}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// Hero
// ─────────────────────────────────────────────────────────────
function SocialHero() {
  return (
    <section className="mb-12">
      <p className="text-sf-accent text-xs font-bold uppercase tracking-[0.22em] mb-3">
        Intelligence Feed
      </p>
      <h1 className="text-[40px] md:text-[56px] font-black text-sf-ink tracking-[-0.025em] leading-[1.03] max-w-[24ch]">
        Social Insights Hub
      </h1>
      <p className="mt-5 max-w-[64ch] text-lg leading-relaxed text-sf-ink-3">
        Aggregated signals and academic breakthroughs from the digital research ecosystem —
        WeChat, Twitter/X, GitHub, and curated AI news streams.
      </p>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────
export default async function SocialMediaOverviewPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="flex flex-col">
      <SocialHero />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <Suspense fallback={<WechatSkeleton />}>
          <WechatSection locale={locale} />
        </Suspense>
        <TwitterSection />
        <GithubSection />
        <AiNewsSection />
      </div>
    </div>
  );
}

function WechatSkeleton() {
  return (
    <section className="lg:col-span-8 space-y-5">
      <div className="h-9 border-b border-sf-line" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[320px] rounded-[10px]" />
        ))}
      </div>
    </section>
  );
}
