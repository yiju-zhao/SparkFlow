import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET /api/notebooks - List all notebooks for the user
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const notebooks = await prisma.notebook.findMany({
    where: { userId: session.user.id },
    include: {
      _count: {
        select: { sources: true, notes: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(notebooks);
}

// POST /api/notebooks - Create a new notebook
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { name, description } = await req.json();

    if (!name?.trim()) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    const notebook = await prisma.notebook.create({
      data: {
        name: name.trim(),
        description: description?.trim(),
        userId: session.user.id,
      },
    });

    return NextResponse.json(notebook, { status: 201 });
  } catch (error) {
    console.error("Create notebook error:", error);
    return NextResponse.json(
      { error: "Failed to create notebook" },
      { status: 500 }
    );
  }
}
