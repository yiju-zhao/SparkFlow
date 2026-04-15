import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { query, limit = 20 } = (await req.json()) as {
    query: string;
    limit?: number;
  };

  if (!query?.trim()) {
    return NextResponse.json({ error: "Query is required" }, { status: 400 });
  }

  // Use plainto_tsquery for safe, automatic tokenization of user input.
  const results = await prisma.$queryRaw`
    SELECT
      p.id,
      p.title,
      LEFT(p.abstract, 300) AS abstract,
      p.authors,
      p."pdfUrl",
      v.name AS venue,
      i.year,
      ts_rank(
        setweight(to_tsvector('english', coalesce(p.title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(p.abstract, '')), 'B'),
        plainto_tsquery('english', ${query})
      ) AS rank
    FROM "Publication" p
    LEFT JOIN "Instance" i ON p."instanceId" = i.id
    LEFT JOIN "Venue" v ON i."venueId" = v.id
    WHERE (
      to_tsvector('english', coalesce(p.title, '')) ||
      to_tsvector('english', coalesce(p.abstract, ''))
    ) @@ plainto_tsquery('english', ${query})
    ORDER BY rank DESC
    LIMIT ${limit}
  `;

  return NextResponse.json(results);
}
