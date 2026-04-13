/**
 * Wiki ingest service — extracts knowledge graph from source,
 * merges into notebook graph, clusters, generates wiki pages.
 */

import { runGraphPipeline, removeSourceFromGraph, clusterGraph, generateWikiPages } from "./graph-service";
import type { GraphData } from "./graph-service";
import prisma from "@/lib/prisma";

export async function ingestSourceToWiki(
  notebookId: string,
  sourceId: string
): Promise<{ pagesWritten: number; pages: string[] }> {
  const source = await prisma.source.findUnique({
    where: { id: sourceId },
    include: { notebook: { select: { wikiSchema: true } } },
  });

  if (!source) throw new Error(`Source ${sourceId} not found`);

  const content = source.markdownContent || source.content;
  if (!content) throw new Error("Source has no content to ingest");

  try {
    // Set initial wiki status
    const meta = (source.metadata as Record<string, unknown>) || {};
    await prisma.source.update({
      where: { id: sourceId },
      data: { metadata: { ...meta, wikiStatus: "starting" } },
    });

    const result = await runGraphPipeline(notebookId, sourceId, content, source.title);

    // Store extraction report in source metadata for UI display
    const currentMeta = (await prisma.source.findUnique({ where: { id: sourceId }, select: { metadata: true } }))?.metadata as Record<string, unknown> || {};
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
      pages: [`${result.nodesAdded} nodes, ${result.edgesAdded} edges, ${result.communities} communities`],
    };
  } catch (err) {
    // Mark wiki status as failed
    try {
      const current = await prisma.source.findUnique({ where: { id: sourceId }, select: { metadata: true } });
      const meta = (current?.metadata as Record<string, unknown>) || {};
      await prisma.source.update({
        where: { id: sourceId },
        data: { metadata: { ...meta, wikiStatus: "failed", wikiError: String(err) } },
      });
    } catch { /* ignore metadata update failure */ }
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
  sourceTitle: string
): Promise<{ pagesDeleted: number; pagesUpdated: number }> {
  const existingGraph = await prisma.notebookGraph.findUnique({
    where: { notebookId },
  });

  if (!existingGraph?.graphData) {
    return { pagesDeleted: 0, pagesUpdated: 0 };
  }

  const graphData = existingGraph.graphData as unknown as GraphData;

  // 1. Remove source from graph (deterministic)
  const cleaned = removeSourceFromGraph(graphData, sourceId);

  // 2. Re-cluster
  const { graphWithCommunities, communities } = await clusterGraph(cleaned);

  // 3. Store updated graph
  await prisma.notebookGraph.update({
    where: { notebookId },
    data: {
      graphData: graphWithCommunities as any,
      communities: communities as any,
    },
  });

  // 4. Delete old community pages
  const oldPages = await prisma.wikiPage.findMany({
    where: { notebookId, slug: { startsWith: "community-" } },
  });
  await prisma.wikiPage.deleteMany({
    where: { notebookId, slug: { startsWith: "community-" } },
  });

  // 5. Regenerate wiki pages from new communities
  let pagesWritten = 0;
  if (cleaned.nodes.length > 0) {
    const slugs = await generateWikiPages(notebookId, graphWithCommunities, communities);
    pagesWritten = slugs.length;
  } else {
    await prisma.wikiPage.upsert({
      where: { notebookId_slug: { notebookId, slug: "index" } },
      create: { notebookId, slug: "index", title: "Wiki Index", content: "# Wiki Index\n\nWiki is empty. Add sources to start building knowledge.", pageType: "INDEX", sourceRefs: [] },
      update: { content: "# Wiki Index\n\nWiki is empty. Add sources to start building knowledge." },
    });
  }

  // 6. Log
  const today = new Date().toISOString().split("T")[0];
  const logEntry = `\n## [${today}] remove | ${sourceTitle}\nRemoved source, ${oldPages.length} old pages deleted, ${pagesWritten} pages regenerated`;
  const logPage = await prisma.wikiPage.findUnique({
    where: { notebookId_slug: { notebookId, slug: "log" } },
  });
  if (logPage) {
    await prisma.wikiPage.update({
      where: { id: logPage.id },
      data: { content: logPage.content + logEntry },
    });
  }

  return { pagesDeleted: oldPages.length, pagesUpdated: pagesWritten };
}
