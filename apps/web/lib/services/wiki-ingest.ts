/**
 * Wiki ingest service — thin client around POST /v1/workflows/wiki/extract.
 *
 * The actual extraction (LLM calls + Louvain clustering + page generation)
 * runs in apps/langgraph/workflows/wiki_ingest.py. This module:
 *  - resolves the user's BYOK key
 *  - posts the request to the Python workflow
 *  - converts the snake_case response into the camelCase shape the
 *    Prisma schema and wiki UI expect
 *  - runs the existing prisma.$transaction (graph upsert + WikiPage
 *    upsert + orphan-page deleteMany + log append) on the result
 *
 * Both ingestSourceToWiki and removeSourceFromWiki call the same endpoint;
 * the latter passes mode="remove" with no sourceContent.
 */

import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { resolveApiKey } from "@/lib/services/api-key-resolver";

// ============================================================
// Workflows-API client
// ============================================================

function workflowsBase(): string {
  return (process.env.WORKFLOWS_API_URL || "http://localhost:2027").replace(/\/$/, "");
}

function internalToken(): string {
  const t = process.env.INTERNAL_CALLBACK_TOKEN;
  if (!t) {
    throw new Error(
      "INTERNAL_CALLBACK_TOKEN is not configured — apps/web cannot authenticate to the Python workflows API",
    );
  }
  return t;
}

async function resolveWikiByok(userId: string) {
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { wikiModelProvider: true, wikiModelName: true },
  });
  if (!settings?.wikiModelProvider || !settings.wikiModelName) {
    throw new Error(
      "Wiki model is not configured. Open Settings → Deepdive → Wiki generation model to pick one.",
    );
  }
  const resolved = await resolveApiKey(userId, settings.wikiModelProvider);
  return {
    provider: settings.wikiModelProvider,
    model: settings.wikiModelName,
    apiKey: resolved.apiKey,
    baseUrl: resolved.baseUrl,
  };
}

// ============================================================
// Snake → camel conversion (Python response → Prisma JSON shape)
// ============================================================

interface PyNode {
  id: string;
  label: string;
  type: string;
  summary: string;
  source_refs: string[];
}

interface PyEdge {
  source: string;
  target: string;
  relation: string;
  confidence: string;
  weight: number;
  source_ref: string;
}

interface PyGraph {
  nodes: PyNode[];
  edges: PyEdge[];
}

interface PyWikiPage {
  slug: string;
  title: string;
  markdown: string;
  sourceIds: string[];
}

interface PyExtractResponse {
  normalizedTitle: string;
  extraction: { normalizedTitle?: string; nodes: PyNode[]; edges: PyEdge[] } | null;
  extractionReport: {
    nodes: { id: string; label: string; type: string }[];
    edges: { source: string; target: string; relation: string }[];
    crossRefs: { label: string; existingSourceIds: string[] }[];
  } | null;
  mergedGraph: PyGraph;
  communities: Record<string, string[]>;
  communityPages: PyWikiPage[];
  indexPage: PyWikiPage;
  logEntry: string;
}

// Domain shapes consumed by the UI / Prisma JSON columns. Keep camelCase.
interface UiNode {
  id: string;
  label: string;
  type: string;
  summary: string;
  sourceRefs: string[];
}
interface UiEdge {
  source: string;
  target: string;
  relation: string;
  confidence: string;
  weight: number;
  sourceRef: string;
}
interface UiGraph {
  nodes: UiNode[];
  edges: UiEdge[];
}

function camelizeNode(n: PyNode): UiNode {
  return { id: n.id, label: n.label, type: n.type, summary: n.summary, sourceRefs: n.source_refs };
}
function camelizeEdge(e: PyEdge): UiEdge {
  return {
    source: e.source,
    target: e.target,
    relation: e.relation,
    confidence: e.confidence,
    weight: e.weight,
    sourceRef: e.source_ref,
  };
}
function camelizeGraph(g: PyGraph): UiGraph {
  return {
    nodes: g.nodes.map(camelizeNode),
    edges: g.edges.map(camelizeEdge),
  };
}

/**
 * Convert Python's structured crossRefs into the human-readable string[]
 * shape the UI (components/deepdive/sources/ingest-report.tsx) consumes.
 */
function flattenCrossRefs(
  refs: { label: string; existingSourceIds: string[] }[],
): string[] {
  return refs.map(
    (r) => `"${r.label}" already exists in the knowledge network`,
  );
}

/**
 * Convert UiGraph → snake_case shape Python expects in `existingGraph` request body.
 */
function snakeifyGraphForPython(g: UiGraph): PyGraph {
  return {
    nodes: g.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      type: n.type,
      summary: n.summary,
      source_refs: n.sourceRefs ?? [],
    })),
    edges: g.edges.map((e) => ({
      source: e.source,
      target: e.target,
      relation: e.relation,
      confidence: e.confidence,
      weight: e.weight,
      source_ref: e.sourceRef ?? "",
    })),
  };
}

// ============================================================
// HTTP call to apps/langgraph
// ============================================================

interface ExtractRequestBase {
  notebookId: string;
  sourceId: string;
  userId: string;
  sourceTitle: string;
  byok: { provider: string; model: string; apiKey: string; baseUrl?: string };
  sourceMap: Record<string, string>;
}

async function callExtractRoute(
  body: (ExtractRequestBase & {
    mode: "extract";
    sourceContent: string;
    existingNodeLabels: string[];
    existingGraph: PyGraph | null;
  }) | (ExtractRequestBase & {
    mode: "remove";
    existingGraph: PyGraph;
  }),
): Promise<PyExtractResponse> {
  const res = await fetch(`${workflowsBase()}/v1/workflows/wiki/extract`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Token": internalToken(),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`wiki extract failed (HTTP ${res.status}): ${text.slice(0, 500)}`);
  }
  return (await res.json()) as PyExtractResponse;
}

// ============================================================
// ingestSourceToWiki — mode=extract
// ============================================================

export async function ingestSourceToWiki(
  notebookId: string,
  sourceId: string,
  userId: string,
): Promise<{ pagesWritten: number; pages: string[] }> {
  const source = await prisma.source.findUnique({
    where: { id: sourceId },
    select: { id: true, title: true, markdown: true, metadata: true },
  });
  if (!source) throw new Error(`Source ${sourceId} not found`);
  const content = source.markdown;
  if (!content) throw new Error("Source has no content to ingest");

  const meta0 = (source.metadata as Record<string, unknown>) || {};

  try {
    // wikiStatus: starting → extracting → generating → done
    await prisma.source.update({
      where: { id: sourceId },
      data: { metadata: { ...meta0, wikiStatus: "starting" } },
    });

    const existingGraphRow = await prisma.notebookGraph.findUnique({
      where: { notebookId },
    });
    const existing: UiGraph = existingGraphRow?.graphData
      ? (existingGraphRow.graphData as unknown as UiGraph)
      : { nodes: [], edges: [] };

    await prisma.source.update({
      where: { id: sourceId },
      data: { metadata: { ...meta0, wikiStatus: "extracting" } },
    });

    const byok = await resolveWikiByok(userId);
    const result = await callExtractRoute({
      mode: "extract",
      notebookId,
      sourceId,
      userId,
      sourceTitle: source.title,
      sourceContent: content,
      existingNodeLabels: existing.nodes.map((n) => n.label),
      existingGraph: existing.nodes.length > 0 ? snakeifyGraphForPython(existing) : null,
      sourceMap: { [sourceId]: source.title },
      byok,
    });

    const mergedGraph = camelizeGraph(result.mergedGraph);
    const crossRefStrings = flattenCrossRefs(result.extractionReport?.crossRefs ?? []);
    const extractionReport = {
      nodes: result.extractionReport?.nodes ?? [],
      edges: result.extractionReport?.edges ?? [],
      crossRefs: crossRefStrings,
    };

    // Pre-transaction writes — preserves the hidden contracts the old code had:
    // Source.title = result.normalizedTitle, Source.metadata.extractionReport,
    // Source.metadata.wikiStatus = "generating".
    await prisma.source.update({
      where: { id: sourceId },
      data: {
        title: result.normalizedTitle || source.title,
        metadata: {
          ...meta0,
          extractionReport,
          wikiStatus: "generating",
        },
      },
    });

    const writtenSlugs = result.communityPages.map((p) => p.slug);
    const today = new Date().toISOString().split("T")[0];
    const logEntry = `\n## [${today}] ingest | ${result.normalizedTitle || source.title}\n${result.logEntry}`;

    await prisma.$transaction(
      async (tx) => {
        await tx.notebookGraph.upsert({
          where: { notebookId },
          create: {
            notebookId,
            graphData: mergedGraph as unknown as Prisma.InputJsonValue,
            communities: result.communities as unknown as Prisma.InputJsonValue,
          },
          update: {
            graphData: mergedGraph as unknown as Prisma.InputJsonValue,
            communities: result.communities as unknown as Prisma.InputJsonValue,
          },
        });

        for (const p of result.communityPages) {
          await tx.wikiPage.upsert({
            where: { notebookId_slug: { notebookId, slug: p.slug } },
            create: {
              notebookId,
              slug: p.slug,
              title: p.title,
              content: p.markdown,
              pageType: "CONCEPT",
              sourceRefs: p.sourceIds,
            },
            update: { title: p.title, content: p.markdown, sourceRefs: p.sourceIds },
          });
        }

        await tx.wikiPage.upsert({
          where: { notebookId_slug: { notebookId, slug: result.indexPage.slug } },
          create: {
            notebookId,
            slug: result.indexPage.slug,
            title: result.indexPage.title,
            content: result.indexPage.markdown,
            pageType: "INDEX",
            sourceRefs: [],
          },
          update: { content: result.indexPage.markdown },
        });

        await tx.wikiPage.deleteMany({
          where: {
            notebookId,
            slug: { startsWith: "community-" },
            NOT: { slug: { in: writtenSlugs } },
          },
        });

        const logPage = await tx.wikiPage.findUnique({
          where: { notebookId_slug: { notebookId, slug: "log" } },
          select: { id: true, content: true },
        });
        if (logPage) {
          await tx.wikiPage.update({
            where: { id: logPage.id },
            data: { content: logPage.content + logEntry },
          });
        }
      },
      { maxWait: 10_000, timeout: 60_000 },
    );

    await prisma.source.update({
      where: { id: sourceId },
      data: {
        metadata: {
          ...meta0,
          extractionReport,
          wikiStatus: "done",
        },
      },
    });

    const nodesAdded = result.extraction?.nodes.length ?? 0;
    const edgesAdded = result.extraction?.edges.length ?? 0;
    const communitiesCount = Object.keys(result.communities).length;
    return {
      pagesWritten: result.communityPages.length + 1,
      pages: [`${nodesAdded} nodes, ${edgesAdded} edges, ${communitiesCount} communities`],
    };
  } catch (err) {
    try {
      const current = await prisma.source.findUnique({
        where: { id: sourceId },
        select: { metadata: true },
      });
      const meta = (current?.metadata as Record<string, unknown>) || {};
      await prisma.source.update({
        where: { id: sourceId },
        data: { metadata: { ...meta, wikiStatus: "failed", wikiError: String(err) } },
      });
    } catch {
      /* ignore metadata update failure */
    }
    throw err;
  }
}

// ============================================================
// removeSourceFromWiki — mode=remove
// ============================================================

export async function removeSourceFromWiki(
  notebookId: string,
  sourceId: string,
  sourceTitle: string,
  userId: string,
): Promise<{ pagesDeleted: number; pagesUpdated: number }> {
  const existingGraphRow = await prisma.notebookGraph.findUnique({
    where: { notebookId },
  });
  if (!existingGraphRow?.graphData) {
    return { pagesDeleted: 0, pagesUpdated: 0 };
  }
  const existing = existingGraphRow.graphData as unknown as UiGraph;

  const oldPagesCount = await prisma.wikiPage.count({
    where: { notebookId, slug: { startsWith: "community-" } },
  });

  const byok = await resolveWikiByok(userId);
  const result = await callExtractRoute({
    mode: "remove",
    notebookId,
    sourceId,
    userId,
    sourceTitle,
    existingGraph: snakeifyGraphForPython(existing),
    sourceMap: {},
    byok,
  });

  const mergedGraph = camelizeGraph(result.mergedGraph);
  const writtenSlugs = result.communityPages.map((p) => p.slug);
  const today = new Date().toISOString().split("T")[0];
  const logEntry = `\n## [${today}] remove | ${sourceTitle}\nRemoved source, ${oldPagesCount} old pages deleted, ${writtenSlugs.length} pages regenerated`;

  await prisma.$transaction(
    async (tx) => {
      await tx.notebookGraph.update({
        where: { notebookId },
        data: {
          graphData: mergedGraph as unknown as Prisma.InputJsonValue,
          communities: result.communities as unknown as Prisma.InputJsonValue,
        },
      });

      if (mergedGraph.nodes.length > 0) {
        for (const p of result.communityPages) {
          await tx.wikiPage.upsert({
            where: { notebookId_slug: { notebookId, slug: p.slug } },
            create: {
              notebookId,
              slug: p.slug,
              title: p.title,
              content: p.markdown,
              pageType: "CONCEPT",
              sourceRefs: p.sourceIds,
            },
            update: { title: p.title, content: p.markdown, sourceRefs: p.sourceIds },
          });
        }
        await tx.wikiPage.upsert({
          where: { notebookId_slug: { notebookId, slug: result.indexPage.slug } },
          create: {
            notebookId,
            slug: result.indexPage.slug,
            title: result.indexPage.title,
            content: result.indexPage.markdown,
            pageType: "INDEX",
            sourceRefs: [],
          },
          update: { content: result.indexPage.markdown },
        });
      } else {
        const emptyContent = "# Wiki Index\n\nWiki is empty. Add sources to start building knowledge.";
        await tx.wikiPage.upsert({
          where: { notebookId_slug: { notebookId, slug: "index" } },
          create: {
            notebookId,
            slug: "index",
            title: "Wiki Index",
            content: emptyContent,
            pageType: "INDEX",
            sourceRefs: [],
          },
          update: { content: emptyContent },
        });
      }

      await tx.wikiPage.deleteMany({
        where: {
          notebookId,
          slug: { startsWith: "community-" },
          NOT: { slug: { in: writtenSlugs } },
        },
      });

      const logPage = await tx.wikiPage.findUnique({
        where: { notebookId_slug: { notebookId, slug: "log" } },
        select: { id: true, content: true },
      });
      if (logPage) {
        await tx.wikiPage.update({
          where: { id: logPage.id },
          data: { content: logPage.content + logEntry },
        });
      }
    },
    { maxWait: 10_000, timeout: 60_000 },
  );

  return { pagesDeleted: oldPagesCount, pagesUpdated: writtenSlugs.length };
}
