import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { ragflowClient, Chunk } from "@/lib/ragflow-client";

// Build chunk map by matching chunk content to source content positions
function buildChunkMap(
  sourceContent: string,
  chunks: Chunk[]
): { chunkId: string; startOffset: number; endOffset: number }[] {
  const chunkMap: { chunkId: string; startOffset: number; endOffset: number }[] = [];
  let searchStart = 0;

  // Normalize source content for matching
  const normalizedSource = sourceContent.replace(/\r\n/g, "\n");

  for (const chunk of chunks) {
    if (!chunk.content) continue;

    // Normalize chunk content
    const normalizedChunk = chunk.content.replace(/\r\n/g, "\n").trim();
    if (!normalizedChunk) continue;

    // Search for chunk content starting from last position (chunks are ordered)
    const startOffset = normalizedSource.indexOf(normalizedChunk, searchStart);

    if (startOffset !== -1) {
      chunkMap.push({
        chunkId: chunk.id,
        startOffset,
        endOffset: startOffset + normalizedChunk.length,
      });
      // Move search position forward
      searchStart = startOffset + 1;
    } else {
      // Try with first 100 chars if exact match fails
      const prefix = normalizedChunk.slice(0, 100);
      const prefixOffset = normalizedSource.indexOf(prefix, searchStart);
      if (prefixOffset !== -1) {
        chunkMap.push({
          chunkId: chunk.id,
          startOffset: prefixOffset,
          endOffset: prefixOffset + normalizedChunk.length,
        });
        searchStart = prefixOffset + 1;
      }
    }
  }

  return chunkMap;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const notebook = await prisma.notebook.findFirst({
    where: { id, userId: session.user.id },
    include: {
      sources: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!notebook) {
    return NextResponse.json({ error: "Notebook not found" }, { status: 404 });
  }

  const datasetId = notebook.ragflowDatasetId;
  if (!datasetId) {
    return NextResponse.json({ sources: notebook.sources });
  }
  const ragflowDatasetId = datasetId as string;

  const updatedSources = await Promise.all(
    notebook.sources.map(async (source) => {
      const shouldSync =
        Boolean(source.ragflowDocumentId) &&
        source.status !== "READY" &&
        source.status !== "FAILED";

      if (!shouldSync) {
        return source;
      }

      if (!source.ragflowDocumentId) {
        return source;
      }

      try {
        const doc = await ragflowClient.getDocumentStatus(
          ragflowDatasetId,
          source.ragflowDocumentId
        );

        if (!doc) {
          return source;
        }

        const runValue = (doc.run || doc.status || "").toString().toUpperCase();
        const isRunning = runValue === "RUNNING" || runValue === "1";
        const isDone = runValue === "DONE" || runValue === "3";
        const isFailed =
          runValue === "FAIL" ||
          runValue === "4" ||
          runValue === "-1" ||
          runValue === "ERROR";

        let status: "UPLOADING" | "PROCESSING" | "READY" | "FAILED" =
          source.status;
        let errorMessage = source.errorMessage || null;

        let chunkMap: { chunkId: string; startOffset: number; endOffset: number }[] | null = null;

        if (isDone) {
          status = "READY";
          errorMessage = null;

          // Build chunk map when processing completes
          if (source.content && source.ragflowDocumentId) {
            try {
              const { chunks } = await ragflowClient.listChunks(
                ragflowDatasetId,
                source.ragflowDocumentId,
                { pageSize: 1024 }
              );
              if (chunks.length > 0) {
                chunkMap = buildChunkMap(source.content, chunks);
              }
            } catch (err) {
              console.error("Failed to build chunk map:", err);
            }
          }
        } else if (isFailed) {
          status = "FAILED";
          const failureNote = Array.isArray(doc.progress_msg)
            ? doc.progress_msg.at(-1)
            : typeof doc.progress_msg === "string"
              ? doc.progress_msg
              : null;
          errorMessage = failureNote || "RagFlow processing failed";
        } else if (isRunning || runValue === "UNSTART" || runValue === "0") {
          status = "PROCESSING";
        }

        return prisma.source.update({
          where: { id: source.id },
          data: {
            status,
            errorMessage,
            metadata: {
              ...(source.metadata as Record<string, unknown> | null),
              ragflowRun: doc.run ?? runValue,
              ragflowStatus: doc.status ?? null,
              ragflowProgress:
                typeof doc.progress === "number"
                  ? doc.progress
                  : (source.metadata as Record<string, unknown> | null)?.ragflowProgress ??
                  null,
              ragflowUpdatedAt: new Date().toISOString(),
              // Store chunk map when available
              ...(chunkMap ? { chunkMap } : {}),
            },
          },
        });
      } catch (error) {
        console.error("RagFlow status sync error:", error);
        return source;
      }
    })
  );

  return NextResponse.json({ sources: updatedSources });
}
