/**
 * Instance Data API Route
 *
 * Returns instance data for the matcher service.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const instance = await prisma.instance.findUnique({
      where: { id },
      include: {
        venue: true,
      },
    });

    if (!instance) {
      return NextResponse.json({ error: "Instance not found" }, { status: 404 });
    }

    return NextResponse.json(instance);
  } catch (error) {
    console.error("Get instance error:", error);
    return NextResponse.json(
      { error: "Failed to get instance" },
      { status: 500 }
    );
  }
}
