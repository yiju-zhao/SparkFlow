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
                include: {
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
        contentPreview: chunk.contentPreview,
        contentSuffix: chunk.contentSuffix,
        source: {
            id: chunk.source.id,
            title: chunk.source.title,
            content: chunk.source.content,
            sourceType: chunk.source.sourceType,
            url: chunk.source.url,
            status: chunk.source.status,
            metadata: chunk.source.metadata,
            createdAt: chunk.source.createdAt,
            updatedAt: chunk.source.updatedAt,
            notebookId: chunk.source.notebookId,
            ragflowDocumentId: chunk.source.ragflowDocumentId,
            fileKey: chunk.source.fileKey,
            errorMessage: chunk.source.errorMessage,
        },
    });
}
