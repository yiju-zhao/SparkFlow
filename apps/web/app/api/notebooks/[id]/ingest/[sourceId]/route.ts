import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sourceId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: notebookId, sourceId } = await params;

  const source = await prisma.source.findUnique({
    where: { id: sourceId },
    include: { notebook: { select: { userId: true, wikiSchema: true } } },
  });

  if (!source || source.notebook.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const content = source.markdownContent || source.content;
  if (!content) {
    return NextResponse.json(
      { error: "Source has no content to ingest" },
      { status: 400 }
    );
  }

  try {
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

    // Call LLM to generate wiki pages
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `You are a wiki builder. Given a source document and the current wiki index, generate wiki pages in JSON format.

Output a JSON object with this exact structure:
{
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

Rules:
- Slugs must be URL-friendly: lowercase, hyphens, no spaces
- Use [[slug]] to link between wiki pages
- Use [source:${sourceId}] to cite the source
- Keep entity/concept pages focused — one clear topic per page
- The updated index must list ALL pages (existing + new), organized by category with one-line summaries
- Only create entities/concepts that are genuinely important, not every noun
- Content should be informative and concise, not just a restatement of the source`,
        },
        {
          role: "user",
          content: `## Current Wiki Index

${currentIndex}

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

    // Write wiki pages to database
    const writtenPages: string[] = [];

    // Write summary page
    if (wikiData.summary) {
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
    if (wikiData.entities && Array.isArray(wikiData.entities)) {
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
    if (wikiData.concepts && Array.isArray(wikiData.concepts)) {
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

    return NextResponse.json({
      success: true,
      pagesWritten: writtenPages.length,
      pages: writtenPages,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Ingest failed";
    console.error("Wiki ingest failed:", errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
