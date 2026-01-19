import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { ragflowClient } from "@/lib/ragflow-client";
import { deleteSourceImages } from "@/lib/s3-client";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/notebooks/[id] - Get a single notebook
export async function GET(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const notebook = await prisma.notebook.findFirst({
    where: { id, userId: session.user.id },
    include: {
      sources: { orderBy: { createdAt: "desc" } },
      notes: { orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }] },
      _count: { select: { sources: true, notes: true } },
    },
  });

  if (!notebook) {
    return NextResponse.json({ error: "Notebook not found" }, { status: 404 });
  }

  return NextResponse.json(notebook);
}

// PUT /api/notebooks/[id] - Update a notebook
export async function PUT(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Verify ownership
    const existing = await prisma.notebook.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Notebook not found" }, { status: 404 });
    }

    const { name, description } = await req.json();

    const notebook = await prisma.notebook.update({
      where: { id },
      data: {
        ...(name?.trim() && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
      },
    });

    return NextResponse.json(notebook);
  } catch (error) {
    console.error("Update notebook error:", error);
    return NextResponse.json(
      { error: "Failed to update notebook" },
      { status: 500 }
    );
  }
}

// DELETE /api/notebooks/[id] - Delete a notebook
export async function DELETE(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify ownership and get sources
  const notebook = await prisma.notebook.findFirst({
    where: { id, userId: session.user.id },
    include: { sources: { select: { id: true } } },
  });

  if (!notebook) {
    return NextResponse.json({ error: "Notebook not found" }, { status: 404 });
  }

  // Delete source images from MinIO (non-blocking)
  for (const source of notebook.sources) {
    try {
      await deleteSourceImages(source.id);
    } catch (error) {
      console.error(`Failed to delete images for source ${source.id}:`, error);
    }
  }

  // Delete RagFlow dataset (non-blocking)
  if (notebook.ragflowDatasetId) {
    try {
      await ragflowClient.deleteDataset(notebook.ragflowDatasetId);
    } catch (error) {
      console.error("RagFlow dataset deletion failed:", error);
    }
  }

  await prisma.notebook.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
