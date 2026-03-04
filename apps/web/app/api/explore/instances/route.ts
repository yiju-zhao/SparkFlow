import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * GET /api/explore/instances
 *
 * List all conference instances with their venue information.
 * Used by the query matcher to select which conference to match against.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const instances = await prisma.instance.findMany({
      include: {
        venue: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [{ year: "desc" }, { name: "asc" }],
    });

    return NextResponse.json(instances);
  } catch (error) {
    console.error("Get instances error:", error);
    return NextResponse.json(
      { error: "Failed to fetch instances" },
      { status: 500 },
    );
  }
}
