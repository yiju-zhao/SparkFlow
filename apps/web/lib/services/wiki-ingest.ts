/**
 * Wiki ingest service — extracts knowledge graph from source,
 * merges into notebook graph, clusters, generates wiki pages.
 */

import {
  runGraphPipeline,
  removeSourceFromGraph,
  clusterGraph,
  buildWikiPagePayload,
} from "./graph-service";
import type { GraphData } from "./graph-service";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

export async function ingestSourceToWiki(
  notebookId: string,
  sourceId: string,
  userId: string,
): Promise<{ pagesWritten: number; pages: string[] }> {
  const source = await prisma.source.findUnique({
    where: { id: sourceId },
    include: { notebook: { select: { wikiSchema: true } } },
  });

  if (!source) throw new Error(`Source ${sourceId} not found`);

  const content = source.markdown;
  if (!content) throw new Error("Source has no content to ingest");

  try {
    // Set initial wiki status
    const meta = (source.metadata as Record<string, unknown>) || {};
    await prisma.source.update({
      where: { id: sourceId },
      data: { metadata: { ...meta, wikiStatus: "starting" } },
    });

    const result = await runGraphPipeline(notebookId, sourceId, content, source.title, userId);

    // Store extraction report in source metadata for UI display
    const currentMeta =
      ((await prisma.source.findUnique({ where: { id: sourceId }, select: { metadata: true } }))
        ?.metadata as Record<string, unknown>) || {};
    await prisma.source.update({
      where: { id: sourceId },
      data: {
        metadata: {
          ...currentMeta,
          wikiStatus: "done",
          extractionReport: result.extractionReport,
        },
      },
    });

    return {
      pagesWritten: result.pagesWritten,
      pages: [
        `${result.nodesAdded} nodes, ${result.edgesAdded} edges, ${result.communities} communities`,
      ],
    };
  } catch (err) {
    // Mark wiki status as failed
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

/**
 * Remove a source's contributions from the wiki via graph operations.
 * Deterministic — no LLM needed for removal, only for regeneration.
 */
export async function removeSourceFromWiki(
  notebookId: string,
  sourceId: string,
  sourceTitle: string,
  userId: string,
): Promise<{ pagesDeleted: number; pagesUpdated: number }> {
  const existingGraph = await prisma.notebookGraph.findUnique({
    where: { notebookId },
  });

  if (!existingGraph?.graphData) {
    return { pagesDeleted: 0, pagesUpdated: 0 };
  }

  const graphData = existingGraph.graphData as unknown as GraphData;

  // 1. Deterministic graph mutation — no LLM needed.
  const cleaned = removeSourceFromGraph(graphData, sourceId);

  // 2. Re-cluster in-memory.
  const { graphWithCommunities, communities } = await clusterGraph(cleaned);

  // 3. Build wiki page content (LLM calls) OUTSIDE any transaction.
  const payload =
    cleaned.nodes.length > 0
      ? await buildWikiPagePayload(graphWithCommunities, communities, userId)
      : null;

  // Count pre-existing pages for the return value; the actual delete happens
  // inside the transaction below.
  const oldPagesCount = await prisma.wikiPage.count({
    where: { notebookId, slug: { startsWith: "community-" } },
  });

  const writtenSlugs = payload ? payload.communityPages.map((p) => p.slug) : [];
  const today = new Date().toISOString().split("T")[0];
  const logEntry = `\n## [${today}] remove | ${sourceTitle}\nRemoved source, ${oldPagesCount} old pages deleted, ${writtenSlugs.length} pages regenerated`;

  // 4. Commit everything atomically.
  await prisma.$transaction(
    async (tx) => {
      await tx.notebookGraph.update({
        where: { notebookId },
        data: {
          graphData: graphWithCommunities as unknown as Prisma.InputJsonValue,
          communities: communities as unknown as Prisma.InputJsonValue,
        },
      });

      if (payload) {
        for (const p of payload.communityPages) {
          await tx.wikiPage.upsert({
            where: { notebookId_slug: { notebookId, slug: p.slug } },
            create: {
              notebookId,
              slug: p.slug,
              title: p.title,
              content: p.content,
              pageType: "CONCEPT",
              sourceRefs: p.sourceRefs,
            },
            update: { title: p.title, content: p.content, sourceRefs: p.sourceRefs },
          });
        }
        await tx.wikiPage.upsert({
          where: { notebookId_slug: { notebookId, slug: payload.indexPage.slug } },
          create: {
            notebookId,
            slug: payload.indexPage.slug,
            title: payload.indexPage.title,
            content: payload.indexPage.content,
            pageType: "INDEX",
            sourceRefs: [],
          },
          update: { content: payload.indexPage.content },
        });
      } else {
        // Empty graph — keep the index page but surface an empty-state message.
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

      // Delete community-* pages orphaned by re-clustering. For the empty-graph
      // branch, `writtenSlugs` is empty so every old page goes.
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
