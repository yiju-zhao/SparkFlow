/**
 * Job Results Download Route
 *
 * Verifies ownership via database, then serves the Excel file from local storage.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createReadStream } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { jobId } = await params;

    // Verify user owns the job via database
    const job = await prisma.matchJob.findFirst({
      where: {
        id: jobId,
        userId: session.user.id,
      },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Check job is completed
    if (job.status !== "COMPLETED") {
      return NextResponse.json({ error: "Job is not completed yet" }, { status: 400 });
    }

    // Check result file exists
    if (!job.resultFileKey) {
      return NextResponse.json({ error: "Result file not available yet" }, { status: 404 });
    }

    // Get stream from local file
    const filePath = path.join(DATA_DIR, job.resultFileKey);
    const stream = createReadStream(filePath);

    // Convert Node.js Readable to web ReadableStream
    const webStream = new ReadableStream({
      start(controller) {
        stream.on("data", (chunk: string | Buffer) => controller.enqueue(chunk));
        stream.on("end", () => controller.close());
        stream.on("error", (err: Error) => controller.error(err));
      },
    });

    return new Response(webStream, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="match-results-${jobId}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("Download error:", error);
    return NextResponse.json({ error: "Failed to download results" }, { status: 500 });
  }
}
