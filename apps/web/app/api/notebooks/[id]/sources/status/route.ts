import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { ragflowClient } from "@/lib/ragflow-client";

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

        if (isDone) {
          status = "READY";
          errorMessage = null;

          // Store chunks in database when processing completes
          if (source.ragflowDocumentId) {
            try {
              const { chunks } = await ragflowClient.listChunks(
                ragflowDatasetId,
                source.ragflowDocumentId,
                { pageSize: 1024 }
              );
              if (chunks.length > 0) {
                // Delete existing chunks and insert new ones
                await prisma.chunk.deleteMany({ where: { sourceId: source.id } });
                await prisma.chunk.createMany({
                  data: chunks
                    .filter((chunk) => chunk.content)
                    .map((chunk, index) => ({
                      id: chunk.id,
                      sourceId: source.id,
                      contentPreview: chunk.content.slice(0, 100),
                      contentSuffix: chunk.content.length > 100
                        ? chunk.content.slice(-100)
                        : null,
                      position: index,
                    })),
                });
              }
            } catch (err) {
              console.error("Failed to store chunks:", err);
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
