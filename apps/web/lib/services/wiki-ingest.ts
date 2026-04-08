/**
 * Wiki ingest service — reads a source, calls LLM to generate wiki pages,
 * writes pages directly to database via Prisma.
 */

import prisma from "@/lib/prisma";

export async function ingestSourceToWiki(
  notebookId: string,
  sourceId: string
): Promise<{ pagesWritten: number; pages: string[] }> {
  const source = await prisma.source.findUnique({
    where: { id: sourceId },
    include: { notebook: { select: { wikiSchema: true } } },
  });

  if (!source) {
    throw new Error(`Source ${sourceId} not found`);
  }

  const content = source.markdownContent || source.content;
  if (!content) {
    throw new Error("Source has no content to ingest");
  }

  // Read current wiki index
  const indexPage = await prisma.wikiPage.findUnique({
    where: { notebookId_slug: { notebookId, slug: "index" } },
  });

  const currentIndex = indexPage?.content || "(empty wiki)";

  // Truncate content for LLM context
  const truncated =
    content.length > 50000
      ? content.slice(0, 50000) + "\n\n[... truncated ...]"
      : content;

  // Fetch existing entity/concept pages so LLM can merge new info
  const existingPages = await prisma.wikiPage.findMany({
    where: {
      notebookId,
      pageType: { in: ["ENTITY", "CONCEPT"] },
    },
    select: { slug: true, title: true, content: true, sourceRefs: true },
  });

  const existingPagesContext = existingPages.length > 0
    ? existingPages
        .map((p) => `### [[${p.slug}]] — ${p.title}\n${p.content.slice(0, 500)}${p.content.length > 500 ? "..." : ""}`)
        .join("\n\n")
    : "(no existing pages yet)";

  // Dynamic import to avoid bundling OpenAI at compile time
  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI();

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content: `You are a wiki builder. Given a source document and the current wiki index, generate wiki pages in JSON format.

Output a JSON object with this exact structure:
{
  "normalizedTitle": "Clean, descriptive title for the source",
  "summary": {
    "slug": "source-slug-name",
    "title": "Source Title — Summary",
    "content": "markdown content with [[slug]] links to other pages"
  },
  "entities": [
    {"slug": "entity-slug", "title": "Entity Name", "content": "markdown about this entity"}
  ],
  "concepts": [
    {"slug": "concept-slug", "title": "Concept Name", "content": "markdown about this concept"}
  ],
  "updatedIndex": "full updated index markdown including all existing pages plus new ones"
}

Source Title Normalization Rules for normalizedTitle:
- Format: "[Author(s) Last Name(s)] — [Descriptive Title], [Year]"
- For papers: "Vaswani et al. — Attention Is All You Need, 2017"
- For blog posts: "Karpathy — LLM Wiki Pattern, 2026"
- For webpages: "[Site/Author] — [Article Topic], [Year if known]"
- Remove file extensions, version numbers, "final", "draft" etc.
- Keep it under 80 characters
- If author unknown, use "[Organization]" or "[Topic]" as prefix

Rules:
- Slugs must be URL-friendly: lowercase, hyphens, no spaces
- Use [[slug]] to link between wiki pages
- Use [source:${sourceId}] inline to cite specific claims from this source
- When updating existing pages with content from a new source, ADD to the existing content — don't replace it. Mark which claims come from which source using [source:id] inline
- Keep entity/concept pages focused — one clear topic per page
- The updated index must list ALL pages (existing + new), organized by category with one-line summaries
- Only create entities/concepts that are genuinely important, not every noun
- Content should be informative and concise
- If an existing page already has content from other sources, preserve that content and add new information with the new source citation`,
      },
      {
        role: "user",
        content: `## Current Wiki Index

${currentIndex}

## Existing Wiki Pages (for merging — add new info, don't replace)

${existingPagesContext}

## Source to Ingest

Title: ${source.title}
Source ID: ${sourceId}

${truncated}`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const responseText = completion.choices[0]?.message?.content;
  if (!responseText) {
    throw new Error("LLM returned empty response");
  }

  const wikiData = JSON.parse(responseText);
  const writtenPages: string[] = [];

  // Update source title if LLM provided a normalized one
  if (wikiData.normalizedTitle) {
    await prisma.source.update({
      where: { id: sourceId },
      data: { title: wikiData.normalizedTitle },
    });
  }

  // Write summary page
  if (wikiData.summary?.slug) {
    await prisma.wikiPage.upsert({
      where: {
        notebookId_slug: { notebookId, slug: wikiData.summary.slug },
      },
      create: {
        notebookId,
        slug: wikiData.summary.slug,
        title: wikiData.summary.title,
        content: wikiData.summary.content,
        pageType: "SUMMARY",
        sourceRefs: [sourceId],
      },
      update: {
        title: wikiData.summary.title,
        content: wikiData.summary.content,
        sourceRefs: [sourceId],
      },
    });
    writtenPages.push(wikiData.summary.slug);
  }

  // Write entity pages
  if (Array.isArray(wikiData.entities)) {
    for (const entity of wikiData.entities) {
      if (!entity.slug || !entity.title || !entity.content) continue;

      const existing = await prisma.wikiPage.findUnique({
        where: { notebookId_slug: { notebookId, slug: entity.slug } },
      });

      await prisma.wikiPage.upsert({
        where: { notebookId_slug: { notebookId, slug: entity.slug } },
        create: {
          notebookId,
          slug: entity.slug,
          title: entity.title,
          content: entity.content,
          pageType: "ENTITY",
          sourceRefs: [sourceId],
        },
        update: {
          title: entity.title,
          content: entity.content,
          sourceRefs: existing
            ? [...new Set([...existing.sourceRefs, sourceId])]
            : [sourceId],
        },
      });
      writtenPages.push(entity.slug);
    }
  }

  // Write concept pages
  if (Array.isArray(wikiData.concepts)) {
    for (const concept of wikiData.concepts) {
      if (!concept.slug || !concept.title || !concept.content) continue;

      const existing = await prisma.wikiPage.findUnique({
        where: { notebookId_slug: { notebookId, slug: concept.slug } },
      });

      await prisma.wikiPage.upsert({
        where: { notebookId_slug: { notebookId, slug: concept.slug } },
        create: {
          notebookId,
          slug: concept.slug,
          title: concept.title,
          content: concept.content,
          pageType: "CONCEPT",
          sourceRefs: [sourceId],
        },
        update: {
          title: concept.title,
          content: concept.content,
          sourceRefs: existing
            ? [...new Set([...existing.sourceRefs, sourceId])]
            : [sourceId],
        },
      });
      writtenPages.push(concept.slug);
    }
  }

  // Update index page
  if (wikiData.updatedIndex) {
    await prisma.wikiPage.upsert({
      where: { notebookId_slug: { notebookId, slug: "index" } },
      create: {
        notebookId,
        slug: "index",
        title: "Wiki Index",
        content: wikiData.updatedIndex,
        pageType: "INDEX",
        sourceRefs: [],
      },
      update: {
        content: wikiData.updatedIndex,
      },
    });
  }

  // Append to log
  const today = new Date().toISOString().split("T")[0];
  const logEntry = `\n## [${today}] ingest | ${source.title}\nCreated/updated: ${writtenPages.map((s) => `[[${s}]]`).join(", ")}`;

  const logPage = await prisma.wikiPage.findUnique({
    where: { notebookId_slug: { notebookId, slug: "log" } },
  });

  if (logPage) {
    await prisma.wikiPage.update({
      where: { id: logPage.id },
      data: { content: logPage.content + logEntry },
    });
  }

  return { pagesWritten: writtenPages.length, pages: writtenPages };
}

/**
 * Remove a source's contributions from the wiki.
 * Deletes the summary page, updates entity/concept pages to remove
 * content from this source, and deletes pages with no remaining sources.
 */
export async function removeSourceFromWiki(
  notebookId: string,
  sourceId: string,
  sourceTitle: string
): Promise<{ pagesDeleted: number; pagesUpdated: number }> {
  // Find all wiki pages that reference this source
  const affectedPages = await prisma.wikiPage.findMany({
    where: {
      notebookId,
      sourceRefs: { has: sourceId },
    },
  });

  if (affectedPages.length === 0) {
    return { pagesDeleted: 0, pagesUpdated: 0 };
  }

  let pagesDeleted = 0;
  let pagesUpdated = 0;

  // Pages that ONLY reference this source — delete them
  const singleSourcePages = affectedPages.filter(
    (p) => p.sourceRefs.length === 1 && p.pageType !== "INDEX" && p.pageType !== "LOG"
  );

  // Pages that reference multiple sources — need LLM to revise
  const multiSourcePages = affectedPages.filter(
    (p) => p.sourceRefs.length > 1 && p.pageType !== "INDEX" && p.pageType !== "LOG"
  );

  // Delete single-source pages
  if (singleSourcePages.length > 0) {
    await prisma.wikiPage.deleteMany({
      where: {
        id: { in: singleSourcePages.map((p) => p.id) },
      },
    });
    pagesDeleted = singleSourcePages.length;
  }

  // For multi-source pages, call LLM to revise content
  if (multiSourcePages.length > 0) {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI();

    for (const page of multiSourcePages) {
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0.3,
          messages: [
            {
              role: "system",
              content: `You are revising a wiki page. A source has been removed from the notebook.
Remove all content attributed to [source:${sourceId}] from the page.
Keep content from other sources intact.
Output only the revised markdown content — nothing else.
If after removal the page has no meaningful content left, output exactly: EMPTY`,
            },
            {
              role: "user",
              content: `## Wiki Page: ${page.title}

${page.content}

## Task
Remove all content from source "${sourceTitle}" (ID: ${sourceId}) from this page.`,
            },
          ],
        });

        const revised = completion.choices[0]?.message?.content?.trim();

        if (!revised || revised === "EMPTY") {
          await prisma.wikiPage.delete({ where: { id: page.id } });
          pagesDeleted++;
        } else {
          await prisma.wikiPage.update({
            where: { id: page.id },
            data: {
              content: revised,
              sourceRefs: page.sourceRefs.filter((ref) => ref !== sourceId),
            },
          });
          pagesUpdated++;
        }
      } catch (err) {
        // If LLM fails, just remove the sourceRef without revising content
        console.error(`Failed to revise page ${page.slug}:`, err);
        await prisma.wikiPage.update({
          where: { id: page.id },
          data: {
            sourceRefs: page.sourceRefs.filter((ref) => ref !== sourceId),
          },
        });
        pagesUpdated++;
      }
    }
  }

  // Rebuild index from remaining pages
  const remainingPages = await prisma.wikiPage.findMany({
    where: {
      notebookId,
      pageType: { notIn: ["INDEX", "LOG"] },
    },
    select: { slug: true, title: true, pageType: true },
    orderBy: { title: "asc" },
  });

  const grouped: Record<string, { slug: string; title: string }[]> = {};
  for (const p of remainingPages) {
    if (!grouped[p.pageType]) grouped[p.pageType] = [];
    grouped[p.pageType].push(p);
  }

  const indexSections = Object.entries(grouped)
    .map(([type, pages]) => {
      const label = { ENTITY: "Entities", CONCEPT: "Concepts", SUMMARY: "Summaries", COMPARISON: "Comparisons" }[type] || type;
      return `## ${label}\n\n${pages.map((p) => `- [[${p.slug}]] — ${p.title}`).join("\n")}`;
    })
    .join("\n\n");

  const indexContent = remainingPages.length > 0
    ? `# Wiki Index\n\n${indexSections}`
    : "# Wiki Index\n\nThis wiki is empty. Add sources to start building your knowledge base.";

  await prisma.wikiPage.upsert({
    where: { notebookId_slug: { notebookId, slug: "index" } },
    create: { notebookId, slug: "index", title: "Wiki Index", content: indexContent, pageType: "INDEX", sourceRefs: [] },
    update: { content: indexContent },
  });

  // Log the removal
  const today = new Date().toISOString().split("T")[0];
  const logEntry = `\n## [${today}] remove | ${sourceTitle}\nDeleted ${pagesDeleted} pages, updated ${pagesUpdated} pages`;

  const logPage = await prisma.wikiPage.findUnique({
    where: { notebookId_slug: { notebookId, slug: "log" } },
  });

  if (logPage) {
    await prisma.wikiPage.update({
      where: { id: logPage.id },
      data: { content: logPage.content + logEntry },
    });
  }

  return { pagesDeleted, pagesUpdated };
}
