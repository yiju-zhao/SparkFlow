import { NextRequest, NextResponse } from "next/server";
import { ragflowClient } from "@/lib/ragflow-client";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  const { id: chunkId } = await context.params;
  const datasetId = request.nextUrl.searchParams.get("datasetId");

  if (!datasetId) {
    return NextResponse.json(
      { error: "datasetId query parameter is required" },
      { status: 400 }
    );
  }

  try {
    const chunk = await ragflowClient.getChunk(datasetId, chunkId);

    if (!chunk) {
      return NextResponse.json(
        { error: "Chunk not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      content: chunk.content,
      documentId: chunk.documentId,
      documentName: chunk.documentName,
    });
  } catch (error) {
    console.error("Error fetching chunk:", error);
    return NextResponse.json(
      { error: "Failed to fetch chunk" },
      { status: 500 }
    );
  }
}
