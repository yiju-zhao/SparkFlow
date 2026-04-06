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
