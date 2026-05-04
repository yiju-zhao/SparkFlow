/**
 * Job Results Download Route
 *
 * Verifies ownership via database, then serves the Excel file from local storage.
 */

import { NextRequest, NextResponse } from "next/server";
import { createReadStream } from "fs";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { requireOwnedJob } from "@/lib/matcher/auth";

const DATA_DIR = path.join(process.cwd(), "data");
// Server-side only: prefer WORKFLOWS_API_URL, fall back to the public
// form for backwards-compat. See app/api/matcher/jobs/route.ts.
const WORKFLOWS_API_URL =
  process.env.WORKFLOWS_API_URL ||
  process.env.NEXT_PUBLIC_WORKFLOWS_API_URL ||
  "http://localhost:2027";

/**
 * If the row is COMPLETED but `resultFileKey` is null, pull the bytes
 * from workflows-api and persist them. Self-heals the case where the
 * status callback flipped the row to COMPLETED before any GET sync
 * ran, so the wizard's first download attempt would 404 forever.
 *
 * Returns the resolved fileKey or null if recovery wasn't possible
 * (workflows-api lost the bytes; nothing left to fetch).
 */
async function ensureResultFile(jobId: string): Promise<string | null> {
  try {
    const dlRes = await fetch(
      `${WORKFLOWS_API_URL}/v1/workflows/matcher/jobs/${jobId}/download?consume=true`,
    );
    if (!dlRes.ok) return null;
    const buffer = Buffer.from(await dlRes.arrayBuffer());
    const fileKey = `match-results/${jobId}.xlsx`;
    const filePath = path.join(DATA_DIR, fileKey);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);
    await prisma.matchJob.update({ where: { id: jobId }, data: { resultFileKey: fileKey } });
    return fileKey;
  } catch (err) {
    console.error("[Matcher Download] ensureResultFile failed:", err);
    return null;
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await params;
    const ownerCheck = await requireOwnedJob(jobId, {
      status: true,
      resultFileKey: true,
    });
    if (!ownerCheck.ok) {
      return NextResponse.json({ error: ownerCheck.error }, { status: ownerCheck.status });
    }
    const job = ownerCheck.job as { status: string; resultFileKey: string | null };

    // Check job is completed
    if (job.status !== "COMPLETED") {
      return NextResponse.json({ error: "Job is not completed yet" }, { status: 400 });
    }

    // Self-heal: row is COMPLETED but file isn't on disk yet. The
    // status-callback path can win the race and write COMPLETED to
    // Postgres before any GET sync had a chance to fetch the Excel.
    // Pull it now; only return 404 if workflows-api also can't help.
    let resultFileKey = job.resultFileKey;
    if (!resultFileKey) {
      resultFileKey = await ensureResultFile(jobId);
      if (!resultFileKey) {
        return NextResponse.json(
          {
            error:
              "Result file is missing and the matcher service no longer has the bytes. Please re-run the job.",
          },
          { status: 404 },
        );
      }
    }

    // Defence in depth: resultFileKey is set by our own code today, but the
    // Prisma column is a free-form string. Resolve and verify the path stays
    // inside DATA_DIR so a poisoned key (`..\..\etc\passwd`) can't read
    // arbitrary files off the host.
    const resolvedDataDir = path.resolve(DATA_DIR);
    const resolved = path.resolve(resolvedDataDir, resultFileKey);
    if (
      resolved !== resolvedDataDir &&
      !resolved.startsWith(resolvedDataDir + path.sep)
    ) {
      console.error(
        `[Matcher] Rejected out-of-DATA_DIR resultFileKey for job ${jobId}: ${resultFileKey}`,
      );
      return new Response("invalid path", { status: 400 });
    }

    // Get stream from local file
    const stream = createReadStream(resolved);

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
