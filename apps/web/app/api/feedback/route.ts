import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PostBodySchema = z.object({
  type: z.enum(["BUG", "FEATURE", "IMPROVEMENT"]),
  title: z.string().trim().max(200).optional().nullable(),
  message: z.string().trim().min(5).max(5000),
  pageUrl: z.string().trim().max(2000).optional().nullable(),
});

// POST /api/feedback — submit feedback (any signed-in user)
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Invalid JSON body" } },
      { status: 400 },
    );
  }

  const parsed = PostBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "BAD_REQUEST",
          message: "Invalid feedback payload",
          issues: parsed.error.issues,
        },
      },
      { status: 400 },
    );
  }
  const body = parsed.data;
  const userAgent = request.headers.get("user-agent")?.slice(0, 500) ?? null;

  const feedback = await prisma.feedback.create({
    data: {
      userId: session.user.id,
      type: body.type,
      title: body.title?.trim() || null,
      message: body.message.trim(),
      pageUrl: body.pageUrl?.trim() || null,
      userAgent,
    },
    select: { id: true, createdAt: true },
  });

  return NextResponse.json({ id: feedback.id, createdAt: feedback.createdAt }, { status: 201 });
}

// GET /api/feedback — list feedback (admin only)
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (me?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status");
  const typeParam = searchParams.get("type");

  const items = await prisma.feedback.findMany({
    where: {
      ...(statusParam && ["OPEN", "IN_REVIEW", "PLANNED", "RESOLVED", "CLOSED"].includes(statusParam)
        ? { status: statusParam as "OPEN" | "IN_REVIEW" | "PLANNED" | "RESOLVED" | "CLOSED" }
        : {}),
      ...(typeParam && ["BUG", "FEATURE", "IMPROVEMENT"].includes(typeParam)
        ? { type: typeParam as "BUG" | "FEATURE" | "IMPROVEMENT" }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      user: { select: { id: true, email: true, username: true } },
    },
  });

  return NextResponse.json({ items });
}
