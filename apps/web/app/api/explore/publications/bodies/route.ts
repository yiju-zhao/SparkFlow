import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const MAX_IDS = 50;

// Input:  { ids: string[] }
// Output: publication details for the shortlist chosen after title triage.
// Returns full abstract + summary so the body-judge pass has enough context.
export async function POST(req: NextRequest) {
  const body = (await req.json()) as { ids?: string[] };
  const ids = Array.from(
    new Set((Array.isArray(body.ids) ? body.ids : []).filter((v) => typeof v === "string")),
  ).slice(0, MAX_IDS);

  if (ids.length === 0) {
    return NextResponse.json([]);
  }

  const rows = await prisma.publication.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      title: true,
      authors: true,
      abstract: true,
      summary: true,
      pdfUrl: true,
      researchTopic: true,
      instance: { select: { year: true, venue: { select: { name: true } } } },
    },
  });

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      title: r.title,
      authors: r.authors,
      abstract: r.abstract ?? "",
      summary: r.summary ?? "",
      pdfUrl: r.pdfUrl ?? "",
      researchTopic: r.researchTopic ?? "",
      venue: r.instance?.venue?.name ?? "",
      year: r.instance?.year ?? null,
    })),
  );
}
