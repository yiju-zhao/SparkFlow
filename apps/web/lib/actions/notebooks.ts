"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function getNotebooks() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  return prisma.notebook.findMany({
    where: { userId: session.user.id },
    include: {
      _count: {
        select: { sources: true, notes: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function createNotebook(name: string, description?: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const notebook = await prisma.notebook.create({
    data: {
      name,
      description,
      userId: session.user.id,
      wikiSchema: {
        searchCollections: ["publications", "sessions"],
        pageTypes: {
          entity: "People, organizations, methods, datasets, tools",
          concept: "Themes, topics, theories, research areas",
          summary: "Per-source summaries with key takeaways",
          comparison: "Cross-source analyses, contrasts, debates",
        },
        emphasis: [],
      },
    },
  });

  // Auto-create index and log wiki pages
  const today = new Date().toISOString().split("T")[0];
  await prisma.wikiPage.createMany({
    data: [
      {
        notebookId: notebook.id,
        slug: "index",
        title: "Wiki Index",
        content: `# ${name} — Wiki Index\n\nThis wiki is empty. Add sources to start building your knowledge base.\n\n## Entities\n\n(none yet)\n\n## Concepts\n\n(none yet)\n\n## Summaries\n\n(none yet)\n\n## Comparisons\n\n(none yet)\n`,
        pageType: "INDEX",
        sourceRefs: [],
      },
      {
        notebookId: notebook.id,
        slug: "log",
        title: "Activity Log",
        content: `# Activity Log\n\n## [${today}] created | Notebook initialized`,
        pageType: "LOG",
        sourceRefs: [],
      },
    ],
  });

  // Create empty graph
  await prisma.notebookGraph.create({
    data: {
      notebookId: notebook.id,
      graphData: { nodes: [], edges: [] },
      communities: {},
    },
  });

  revalidatePath("/deepdive");
  return notebook;
}

export async function deleteNotebook(id: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const notebook = await prisma.notebook.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!notebook) {
    throw new Error("Notebook not found");
  }

  await prisma.notebook.delete({ where: { id } });
  revalidatePath("/deepdive");
}

export async function updateNotebook(
  id: string,
  data: { name?: string; description?: string },
) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const notebook = await prisma.notebook.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!notebook) {
    throw new Error("Notebook not found");
  }

  const updated = await prisma.notebook.update({
    where: { id },
    data,
  });

  revalidatePath("/deepdive");
  return updated;
}
