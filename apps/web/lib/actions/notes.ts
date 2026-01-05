"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function getNotes(notebookId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  // Verify notebook ownership
  const notebook = await prisma.notebook.findFirst({
    where: { id: notebookId, userId: session.user.id },
  });

  if (!notebook) {
    throw new Error("Notebook not found");
  }

  return prisma.note.findMany({
    where: { notebookId },
    orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
  });
}

export async function createNote(
  notebookId: string,
  data: { title: string; content: string; tags?: string[] }
) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  // Verify notebook ownership
  const notebook = await prisma.notebook.findFirst({
    where: { id: notebookId, userId: session.user.id },
  });

  if (!notebook) {
    throw new Error("Notebook not found");
  }

  const note = await prisma.note.create({
    data: {
      notebookId,
      createdById: session.user.id,
      title: data.title,
      content: data.content,
      tags: data.tags || [],
    },
  });

  revalidatePath(`/studio/${notebookId}`);
  return note;
}

export async function updateNote(
  noteId: string,
  data: { title?: string; content?: string; tags?: string[] }
) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  // Verify ownership
  const note = await prisma.note.findUnique({
    where: { id: noteId },
    include: { notebook: true },
  });

  if (!note || note.notebook.userId !== session.user.id) {
    throw new Error("Note not found");
  }

  const updated = await prisma.note.update({
    where: { id: noteId },
    data: {
      ...data,
      updatedAt: new Date(),
    },
  });

  revalidatePath(`/studio/${note.notebookId}`);
  return updated;
}

export async function deleteNote(noteId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  // Verify ownership
  const note = await prisma.note.findUnique({
    where: { id: noteId },
    include: { notebook: true },
  });

  if (!note || note.notebook.userId !== session.user.id) {
    throw new Error("Note not found");
  }

  await prisma.note.delete({ where: { id: noteId } });
  revalidatePath(`/studio/${note.notebookId}`);
}

export async function togglePinNote(noteId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  // Verify ownership
  const note = await prisma.note.findUnique({
    where: { id: noteId },
    include: { notebook: true },
  });

  if (!note || note.notebook.userId !== session.user.id) {
    throw new Error("Note not found");
  }

  const updated = await prisma.note.update({
    where: { id: noteId },
    data: { isPinned: !note.isPinned },
  });

  revalidatePath(`/studio/${note.notebookId}`);
  return updated;
}
