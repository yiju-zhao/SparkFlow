// Local-dev fixture seed for the Research Hub agent.
//
// Creates:
//   - 4 venues × 2 years = 8 instances
//   - ~36 publications with overlapping keywords / affiliations so the hub
//     agent's `aggregate_publications` tool returns interesting "trending"
//     signals (LLM, RAG, agents, multimodal, RLHF, etc.)
//   - ~12 conference_sessions linked to publications
//   - A wechat_articles schema in the SAME local postgres (so apps/langgraph
//     can point WECHAT_DATABASE_URL at $DATABASE_URL) with 5 sources and
//     ~50 fake articles.
//
// Idempotent: every insert is `upsert` keyed on a stable identifier, so
// re-running won't violate unique constraints. Re-running also won't
// duplicate session_publications.
//
// Run from apps/web:
//   npx tsx scripts/seed-hub-fixtures.ts
//
// Then in apps/langgraph/.env set:
//   WECHAT_DATABASE_URL=postgresql://sparkflow:sparkflow@localhost:5433/sparkflow
//
// (same DSN as DATABASE_URL — wechat tools query a separate `wechat_articles`
// schema, not a separate DB).

// Auto-load apps/web/.env so DATABASE_URL is in scope when run as
// `npx tsx scripts/seed-hub-fixtures.ts` from apps/web (tsx doesn't
// auto-load .env the way `next dev` does).
import "dotenv/config";

// Reuse the app's PrismaClient — Prisma 7 needs the PrismaPg adapter,
// which is set up in `lib/prisma.ts`. A bare `new PrismaClient()` here
// throws "no driver adapter".
import prisma from "../lib/prisma";

// ─── conference fixtures ────────────────────────────────────────────────────

const VENUES = [
  { name: "NeurIPS", type: "conference", description: "Conference on Neural Information Processing Systems" },
  { name: "ICML", type: "conference", description: "International Conference on Machine Learning" },
  { name: "ACL", type: "conference", description: "Annual Meeting of the Association for Computational Linguistics" },
  { name: "CVPR", type: "conference", description: "Conference on Computer Vision and Pattern Recognition" },
] as const;

const YEARS = [2024, 2025] as const;

// Topic clusters — pick 2-3 keywords per pub from the same cluster so
// aggregation by keyword shows real co-occurrence patterns.
const TOPIC_CLUSTERS = [
  { topic: "Large Language Models", keywords: ["LLM", "scaling laws", "pre-training", "instruction tuning"] },
  { topic: "RAG & Retrieval", keywords: ["RAG", "retrieval augmented generation", "vector search", "knowledge graphs"] },
  { topic: "Agents", keywords: ["agents", "tool use", "planning", "multi-agent"] },
  { topic: "RLHF", keywords: ["RLHF", "DPO", "alignment", "preference learning"] },
  { topic: "Multimodal", keywords: ["multimodal", "vision-language", "VLM", "image-text"] },
  { topic: "Diffusion", keywords: ["diffusion models", "image generation", "score matching", "DDPM"] },
  { topic: "Efficient Inference", keywords: ["quantization", "KV cache", "speculative decoding", "MoE"] },
  { topic: "Computer Vision", keywords: ["object detection", "segmentation", "vision transformers"] },
];

const AFFILIATIONS = [
  ["Stanford University"], ["MIT"], ["UC Berkeley"], ["Google Research"],
  ["DeepMind"], ["Meta AI"], ["OpenAI"], ["Anthropic"],
  ["Tsinghua University"], ["Peking University"], ["CMU"], ["Princeton University"],
  ["NVIDIA"], ["Microsoft Research"], ["Tsinghua University", "Stanford University"],
  ["Google Research", "DeepMind"],
];

const COUNTRIES_BY_AFFIL: Record<string, string> = {
  "Stanford University": "USA",
  "MIT": "USA",
  "UC Berkeley": "USA",
  "Google Research": "USA",
  "DeepMind": "UK",
  "Meta AI": "USA",
  "OpenAI": "USA",
  "Anthropic": "USA",
  "Tsinghua University": "China",
  "Peking University": "China",
  "CMU": "USA",
  "Princeton University": "USA",
  "NVIDIA": "USA",
  "Microsoft Research": "USA",
};

interface PubSeed {
  externalId: string; // for stable upsert across runs
  title: string;
  authorPool: string[];
  topicIdx: number;
  affilIdx: number;
  rating: number;
}

const PUBS: PubSeed[] = [
  // LLM cluster — 6 papers
  { externalId: "pub-llm-1", title: "Scaling Laws for Mixture-of-Experts Language Models", authorPool: ["A. Kim", "B. Park"], topicIdx: 0, affilIdx: 7, rating: 9.1 },
  { externalId: "pub-llm-2", title: "Instruction Tuning with Synthetic Trajectories", authorPool: ["C. Li", "D. Zhang"], topicIdx: 0, affilIdx: 6, rating: 8.5 },
  { externalId: "pub-llm-3", title: "Continued Pre-Training on Domain Corpora", authorPool: ["E. Wu"], topicIdx: 0, affilIdx: 8, rating: 8.0 },
  { externalId: "pub-llm-4", title: "Analyzing Emergent Capabilities at Scale", authorPool: ["F. Lin", "G. Sun"], topicIdx: 0, affilIdx: 0, rating: 7.9 },
  { externalId: "pub-llm-5", title: "Open-Weights Models for Reproducible Research", authorPool: ["H. Patel"], topicIdx: 0, affilIdx: 5, rating: 8.6 },
  { externalId: "pub-llm-6", title: "Curriculum Pre-Training Strategies", authorPool: ["I. Nakamura"], topicIdx: 0, affilIdx: 13, rating: 7.5 },

  // RAG cluster — 5 papers
  { externalId: "pub-rag-1", title: "Hybrid Sparse-Dense Retrieval for Question Answering", authorPool: ["J. Chen"], topicIdx: 1, affilIdx: 3, rating: 8.3 },
  { externalId: "pub-rag-2", title: "Self-RAG: Verifiable Knowledge Grounding", authorPool: ["K. Smith", "L. Wang"], topicIdx: 1, affilIdx: 0, rating: 8.7 },
  { externalId: "pub-rag-3", title: "Knowledge Graphs as Retrieval Signals", authorPool: ["M. Li"], topicIdx: 1, affilIdx: 8, rating: 7.8 },
  { externalId: "pub-rag-4", title: "Long-Context RAG with Reranking", authorPool: ["N. Davis"], topicIdx: 1, affilIdx: 2, rating: 8.1 },
  { externalId: "pub-rag-5", title: "Vector Search at Web Scale", authorPool: ["O. Tanaka"], topicIdx: 1, affilIdx: 12, rating: 8.4 },

  // Agents cluster — 5 papers
  { externalId: "pub-agt-1", title: "ReAct-Style Multi-Agent Coordination", authorPool: ["P. Garcia"], topicIdx: 2, affilIdx: 7, rating: 8.9 },
  { externalId: "pub-agt-2", title: "Long-Horizon Planning with Tool Use", authorPool: ["Q. Brown"], topicIdx: 2, affilIdx: 4, rating: 8.6 },
  { externalId: "pub-agt-3", title: "Self-Correcting Code Agents", authorPool: ["R. Liu", "S. Park"], topicIdx: 2, affilIdx: 6, rating: 8.4 },
  { externalId: "pub-agt-4", title: "Memory-Augmented Conversational Agents", authorPool: ["T. Hassan"], topicIdx: 2, affilIdx: 10, rating: 7.8 },
  { externalId: "pub-agt-5", title: "Browser-Using Agents on Real Websites", authorPool: ["U. Wong"], topicIdx: 2, affilIdx: 14, rating: 8.0 },

  // RLHF cluster — 4 papers
  { externalId: "pub-rlhf-1", title: "Direct Preference Optimization at Scale", authorPool: ["V. Anderson"], topicIdx: 3, affilIdx: 7, rating: 9.2 },
  { externalId: "pub-rlhf-2", title: "Reward Model Robustness Under Distribution Shift", authorPool: ["W. Khan"], topicIdx: 3, affilIdx: 4, rating: 8.3 },
  { externalId: "pub-rlhf-3", title: "Constitutional AI Without Human Labels", authorPool: ["X. Yamamoto"], topicIdx: 3, affilIdx: 7, rating: 8.7 },
  { externalId: "pub-rlhf-4", title: "Online RLHF With Process Supervision", authorPool: ["Y. Cohen"], topicIdx: 3, affilIdx: 6, rating: 8.5 },

  // Multimodal cluster — 5 papers
  { externalId: "pub-mm-1", title: "Vision-Language Pre-Training With Native Resolution", authorPool: ["Z. Roy"], topicIdx: 4, affilIdx: 3, rating: 8.6 },
  { externalId: "pub-mm-2", title: "Document Understanding with VLMs", authorPool: ["AA. Park"], topicIdx: 4, affilIdx: 13, rating: 8.0 },
  { externalId: "pub-mm-3", title: "Long Video Question Answering", authorPool: ["AB. Singh"], topicIdx: 4, affilIdx: 5, rating: 7.9 },
  { externalId: "pub-mm-4", title: "Unified Image-Text Embeddings", authorPool: ["AC. Müller"], topicIdx: 4, affilIdx: 11, rating: 8.2 },
  { externalId: "pub-mm-5", title: "Audio-Visual Grounding for Embodied Agents", authorPool: ["AD. Ivanov"], topicIdx: 4, affilIdx: 12, rating: 8.4 },

  // Diffusion cluster — 4 papers
  { externalId: "pub-diff-1", title: "Faster Sampling via Consistency Models", authorPool: ["AE. Chen"], topicIdx: 5, affilIdx: 12, rating: 8.5 },
  { externalId: "pub-diff-2", title: "Text-to-Video Diffusion at Production Scale", authorPool: ["AF. Tanaka"], topicIdx: 5, affilIdx: 5, rating: 8.7 },
  { externalId: "pub-diff-3", title: "Score Matching for 3D Generation", authorPool: ["AG. Hartley"], topicIdx: 5, affilIdx: 13, rating: 8.0 },
  { externalId: "pub-diff-4", title: "Diffusion Policies for Robotics", authorPool: ["AH. Kawasaki"], topicIdx: 5, affilIdx: 1, rating: 7.8 },

  // Efficient inference — 4 papers
  { externalId: "pub-eff-1", title: "Speculative Decoding with Tree Attention", authorPool: ["AI. Bakker"], topicIdx: 6, affilIdx: 12, rating: 8.6 },
  { externalId: "pub-eff-2", title: "FP4 Quantization for Trillion-Parameter Models", authorPool: ["AJ. Park"], topicIdx: 6, affilIdx: 13, rating: 8.4 },
  { externalId: "pub-eff-3", title: "PagedKV for Long-Context Inference", authorPool: ["AK. Yi"], topicIdx: 6, affilIdx: 8, rating: 8.2 },
  { externalId: "pub-eff-4", title: "Sparse MoE Routing With Auxiliary Losses", authorPool: ["AL. Xu"], topicIdx: 6, affilIdx: 9, rating: 7.9 },

  // Computer vision — 3 papers
  { externalId: "pub-cv-1", title: "Open-Vocabulary Object Detection in the Wild", authorPool: ["AM. Becker"], topicIdx: 7, affilIdx: 2, rating: 8.3 },
  { externalId: "pub-cv-2", title: "Universal Segmentation With a Single Prompt", authorPool: ["AN. Petrov"], topicIdx: 7, affilIdx: 5, rating: 8.5 },
  { externalId: "pub-cv-3", title: "Vision Transformers Without Patches", authorPool: ["AO. Sasaki"], topicIdx: 7, affilIdx: 0, rating: 7.7 },
];

function pickInstance(pubIdx: number, instances: { id: string; year: number; venueIdx: number }[]) {
  // Round-robin by pubIdx so distribution is ~even across all 8 instances.
  return instances[pubIdx % instances.length];
}

async function seedConferences() {
  console.log("→ seeding venues, instances, publications, sessions...");

  const venueIds: Record<string, string> = {};
  for (const v of VENUES) {
    const venue = await prisma.venue.upsert({
      where: { name: v.name },
      create: v,
      update: { type: v.type, description: v.description },
    });
    venueIds[v.name] = venue.id;
  }

  const instances: { id: string; year: number; venueIdx: number }[] = [];
  for (let vi = 0; vi < VENUES.length; vi++) {
    for (const year of YEARS) {
      const v = VENUES[vi];
      const inst = await prisma.instance.upsert({
        where: { venueId_year: { venueId: venueIds[v.name], year } },
        create: {
          venueId: venueIds[v.name],
          year,
          name: `${v.name} ${year}`,
          startDate: new Date(`${year}-${vi % 2 === 0 ? "06" : "12"}-15`),
          endDate: new Date(`${year}-${vi % 2 === 0 ? "06" : "12"}-20`),
          location: ["Vancouver, BC", "Vienna, Austria", "Honolulu, HI", "Seattle, WA"][vi],
          website: `https://${v.name.toLowerCase()}.cc/Conferences/${year}`,
          summary: `${v.name} ${year} — annual flagship conference.`,
        },
        update: {},
      });
      instances.push({ id: inst.id, year, venueIdx: vi });
    }
  }

  // Upsert publications using a stable per-pub key — but Prisma's `upsert`
  // needs a unique constraint, and `publications` doesn't have one on
  // (instanceId, title). Use deterministic IDs (the `externalId` from
  // PUBS) by keeping the same id text across runs.
  for (let i = 0; i < PUBS.length; i++) {
    const seed = PUBS[i];
    const inst = pickInstance(i, instances);
    const cluster = TOPIC_CLUSTERS[seed.topicIdx];
    // Each pub gets 2-3 keywords from its cluster (deterministic by index).
    const keywords = cluster.keywords.slice(0, 2 + (i % 2));
    const affil = AFFILIATIONS[seed.affilIdx % AFFILIATIONS.length];
    const countries = Array.from(
      new Set(affil.map((a) => COUNTRIES_BY_AFFIL[a] || "Other")),
    );

    await prisma.publication.upsert({
      where: { id: seed.externalId },
      create: {
        id: seed.externalId,
        instanceId: inst.id,
        title: seed.title,
        authors: seed.authorPool,
        abstract: `Abstract for "${seed.title}" — ${cluster.topic} research.`,
        summary: `Synthetic fixture publication in the ${cluster.topic} cluster.`,
        affiliations: affil,
        countries,
        keywords,
        researchTopic: cluster.topic,
        rating: seed.rating,
        status: "published",
      },
      update: {
        instanceId: inst.id,
        keywords,
        affiliations: affil,
        countries,
        researchTopic: cluster.topic,
        rating: seed.rating,
      },
    });
  }

  // A handful of sessions per instance, then link a few publications.
  for (const inst of instances) {
    const sessionTitles = [
      `${VENUES[inst.venueIdx].name} ${inst.year} — Oral: LLMs and Agents`,
      `${VENUES[inst.venueIdx].name} ${inst.year} — Poster: Multimodal`,
      `${VENUES[inst.venueIdx].name} ${inst.year} — Workshop: Efficient Inference`,
    ];
    for (let s = 0; s < sessionTitles.length; s++) {
      const sessionId = `sess-${inst.id}-${s}`;
      await prisma.conferenceSession.upsert({
        where: { id: sessionId },
        create: {
          id: sessionId,
          instanceId: inst.id,
          title: sessionTitles[s],
          type: ["oral", "poster", "workshop"][s],
          date: new Date(`${inst.year}-${inst.venueIdx % 2 === 0 ? "06" : "12"}-${16 + s}`),
          startTime: ["09:00", "14:00", "10:00"][s],
          endTime: ["10:30", "16:00", "17:00"][s],
          location: ["Hall A", "Exhibition Hall", "Room 201"][s],
          topic: [TOPIC_CLUSTERS[s % TOPIC_CLUSTERS.length].topic],
          hasRecording: s === 0,
        },
        update: {},
      });
    }
  }

  // Link the first 12 publications to the first 4 sessions (round-robin).
  const sessions = await prisma.conferenceSession.findMany({
    take: 4,
    orderBy: { createdAt: "asc" },
  });
  const linkPubs = PUBS.slice(0, 12);
  for (let i = 0; i < linkPubs.length; i++) {
    const sessionId = sessions[i % sessions.length].id;
    const publicationId = linkPubs[i].externalId;
    await prisma.sessionPublication.upsert({
      where: { sessionId_publicationId: { sessionId, publicationId } },
      create: { sessionId, publicationId, presentationOrder: Math.floor(i / sessions.length) + 1 },
      update: {},
    });
  }

  const pubCount = await prisma.publication.count();
  const sessionCount = await prisma.conferenceSession.count();
  console.log(`  venues=${VENUES.length} instances=${instances.length} pubs=${pubCount} sessions=${sessionCount}`);
}

// ─── wechat fixtures ────────────────────────────────────────────────────────
//
// hub_wechat tools query schema `wechat_articles` (NOT public). For local
// dev we put it in the same DB as sparkflow data, so apps/langgraph just
// needs WECHAT_DATABASE_URL=$DATABASE_URL.

const WECHAT_SOURCES = [
  "机器之心",
  "新智元",
  "PaperWeekly",
  "AI科技评论",
  "量子位",
];

const WECHAT_TITLE_TEMPLATES = [
  "深度解读 {topic} 最新进展",
  "一文读懂 {topic}",
  "{topic} 在工业界的落地实践",
  "ICLR/NeurIPS {year} {topic} 论文精选",
  "为什么 {topic} 是 {year} 的关键趋势",
  "{topic} 与大模型的结合：现状与未来",
  "顶会综述：{topic} 核心方法论",
  "{topic} 工程化指南",
];

const WECHAT_TOPICS = [
  "RAG", "Agent", "多模态", "RLHF", "扩散模型", "MoE", "推理加速",
  "Long Context", "Tool Use", "代码大模型", "向量检索", "知识图谱",
];

async function seedWechat() {
  console.log("→ seeding wechat_articles schema + fixtures...");

  // Create schema and tables (matching what hub_wechat.py SELECTs from).
  await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS wechat_articles`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS wechat_articles.sources (
      id   integer PRIMARY KEY,
      name text    NOT NULL UNIQUE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS wechat_articles.articles (
      id           integer PRIMARY KEY,
      source_id    integer NOT NULL REFERENCES wechat_articles.sources(id) ON DELETE CASCADE,
      title        text    NOT NULL,
      author       text,
      url          text,
      publish_time timestamp
    )
  `);

  // Seed sources (idempotent via ON CONFLICT).
  for (let i = 0; i < WECHAT_SOURCES.length; i++) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO wechat_articles.sources (id, name) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
      i + 1,
      WECHAT_SOURCES[i],
    );
  }

  // Seed ~50 articles spread across sources, dates in 2025.
  const target = 50;
  for (let i = 0; i < target; i++) {
    const sourceId = (i % WECHAT_SOURCES.length) + 1;
    const topic = WECHAT_TOPICS[i % WECHAT_TOPICS.length];
    const year = 2024 + (i % 2);
    const tmpl = WECHAT_TITLE_TEMPLATES[i % WECHAT_TITLE_TEMPLATES.length];
    const title = tmpl.replace("{topic}", topic).replace("{year}", String(year));
    // Spread publish_time over the last 90 days.
    const daysAgo = i % 90;
    const publishTime = new Date(Date.now() - daysAgo * 86400 * 1000);
    await prisma.$executeRawUnsafe(
      `INSERT INTO wechat_articles.articles (id, source_id, title, author, url, publish_time)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         source_id = EXCLUDED.source_id,
         title = EXCLUDED.title,
         author = EXCLUDED.author,
         url = EXCLUDED.url,
         publish_time = EXCLUDED.publish_time`,
      i + 1,
      sourceId,
      title,
      `编辑${i + 1}号`,
      `https://example.com/wechat/${i + 1}`,
      publishTime,
    );
  }

  const sourceCount = (await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*)::bigint AS count FROM wechat_articles.sources`,
  ))[0].count;
  const articleCount = (await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*)::bigint AS count FROM wechat_articles.articles`,
  ))[0].count;
  console.log(`  wechat sources=${sourceCount} articles=${articleCount}`);
}

async function main() {
  console.log("Seeding hub fixtures into local sparkflow DB...");
  await seedConferences();
  await seedWechat();
  console.log("\n✓ Done.");
  console.log("\nNext step: in apps/langgraph/.env set");
  console.log("  WECHAT_DATABASE_URL=postgresql://sparkflow:sparkflow@localhost:5433/sparkflow");
  console.log("then restart langgraph dev so hub_wechat tools pick it up.");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
