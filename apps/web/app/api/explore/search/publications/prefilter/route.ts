import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const EMBED_DIM = 1024;
const DEFAULT_LIMIT = 80;

// Input: { embedding: number[1024], limit?: number, venueIds?: string[], years?: number[] }
// Output: publication candidates by weighted cosine distance (title 60% + abstract 40%).
export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    embedding?: number[];
    limit?: number;
    venueIds?: string[];
    years?: number[];
  };

  if (!Array.isArray(body.embedding) || body.embedding.length !== EMBED_DIM) {
    return NextResponse.json(
      { error: `embedding must be a number[] of length ${EMBED_DIM}` },
      { status: 400 },
    );
  }

  const limit = Math.min(Math.max(body.limit ?? DEFAULT_LIMIT, 1), 200);
  const vectorLiteral = "[" + body.embedding.map((v) => v.toFixed(7)).join(",") + "]";

  // Prisma.$queryRawUnsafe is used because pgvector literals and table aliases
  // aren't easily parameterized. Input values are still parameterized.
  type Row = {
    id: string;
    title: string;
    authors: string[];
    abstract: string | null;
    pdfUrl: string | null;
    venue: string | null;
    year: number | null;
    distance: number;
  };

  const filters: string[] = [`p."titleEmbedding" IS NOT NULL`];
  const params: unknown[] = [vectorLiteral];
  let i = 2;
  if (body.venueIds?.length) {
    filters.push(`v.id = ANY($${i})`);
    params.push(body.venueIds);
    i++;
  }
  if (body.years?.length) {
    filters.push(`i.year = ANY($${i})`);
    params.push(body.years);
    i++;
  }
  params.push(limit);

  const sql = `
    SELECT
      p.id,
      p.title,
      p.authors,
      LEFT(COALESCE(p.abstract, ''), 500) AS abstract,
      p."pdfUrl",
      v.name AS venue,
      i.year,
      (
        0.6 * (p."titleEmbedding" <=> $1::vector) +
        0.4 * COALESCE(p."abstractEmbedding" <=> $1::vector, p."titleEmbedding" <=> $1::vector)
      ) AS distance
    FROM "publications" p
    LEFT JOIN "Instance" i ON p."instanceId" = i.id
    LEFT JOIN "Venue"    v ON i."venueId"    = v.id
    WHERE ${filters.join(" AND ")}
    ORDER BY distance ASC
    LIMIT $${i}
  `;

  const rows = await prisma.$queryRawUnsafe<Row[]>(sql, ...params);

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      title: r.title,
      authors: r.authors,
      abstract: r.abstract ?? "",
      pdfUrl: r.pdfUrl ?? "",
      venue: r.venue ?? "",
      year: r.year,
      score: Math.max(0, 1 - Number(r.distance ?? 1)),
    })),
  );
}
