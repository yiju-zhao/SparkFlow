import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(
    _request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params;
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const chunk = await prisma.chunk.findUnique({
        where: { id },
        include: {
            source: {
                select: {
                    id: true,
                    title: true,
                    notebookId: true,
                    notebook: {
                        select: { userId: true },
                    },
                },
            },
        },
    });

    if (!chunk) {
        return NextResponse.json({ error: "Chunk not found" }, { status: 404 });
    }

    // Verify user owns the notebook
    if (chunk.source.notebook.userId !== session.user.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    return NextResponse.json({
        chunkId: chunk.id,
        sourceId: chunk.sourceId,
        contentPreview: chunk.contentPreview,
        sourceTitle: chunk.source.title,
    });
}
