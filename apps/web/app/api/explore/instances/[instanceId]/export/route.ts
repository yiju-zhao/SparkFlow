import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ instanceId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { instanceId } = await params;

    // Fetch instance with venue name for the filename
    const instance = await prisma.instance.findUnique({
      where: { id: instanceId },
      select: {
        name: true,
        year: true,
        venue: { select: { name: true } },
      },
    });

    if (!instance) {
      return NextResponse.json({ error: "Conference not found" }, { status: 404 });
    }

    // Fetch all publications and sessions in parallel
    const [publications, sessions] = await Promise.all([
      prisma.publication.findMany({
        where: { instanceId },
        select: {
          title: true,
          authors: true,
          abstract: true,
          summary: true,
          affiliations: true,
          countries: true,
          keywords: true,
          researchTopic: true,
          rating: true,
          status: true,
          doi: true,
          pdfUrl: true,
          githubUrl: true,
          websiteUrl: true,
        },
        orderBy: { title: "asc" },
      }),
      prisma.conferenceSession.findMany({
        where: { instanceId },
        select: {
          title: true,
          type: true,
          date: true,
          startTime: true,
          endTime: true,
          location: true,
          speaker: true,
          abstract: true,
          overview: true,
          transcript: true,
          sessionUrl: true,
          topic: true,
          affiliation: true,
          technology: true,
          sessionFormat: true,
          hasRecording: true,
          intendedAudience: true,
        },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
      }),
    ]);

    // Build Excel workbook with SheetJS
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();

    // --- Publications sheet ---
    const pubHeaders = [
      "Title",
      "Authors",
      "Abstract",
      "Summary",
      "Affiliations",
      "Countries",
      "Keywords",
      "Research Topic",
      "Rating",
      "Status",
      "DOI",
      "PDF URL",
      "GitHub URL",
      "Website URL",
    ];
    const pubRows: unknown[][] = [pubHeaders];
    for (const pub of publications) {
      pubRows.push([
        pub.title,
        pub.authors.join("; "),
        pub.abstract,
        pub.summary,
        pub.affiliations.join("; "),
        pub.countries.join("; "),
        pub.keywords.join("; "),
        pub.researchTopic,
        pub.rating,
        pub.status,
        pub.doi,
        pub.pdfUrl,
        pub.githubUrl,
        pub.websiteUrl,
      ]);
    }
    const pubSheet = XLSX.utils.aoa_to_sheet(pubRows);
    pubSheet["!cols"] = [
      { wch: 50 }, { wch: 40 }, { wch: 80 }, { wch: 80 }, { wch: 40 }, { wch: 25 },
      { wch: 35 }, { wch: 25 }, { wch: 10 }, { wch: 15 }, { wch: 30 }, { wch: 40 },
      { wch: 40 }, { wch: 40 },
    ];
    XLSX.utils.book_append_sheet(wb, pubSheet, "Publications");

    // --- Sessions sheet ---
    const sessHeaders = [
      "Title",
      "Type",
      "Date",
      "Start Time",
      "End Time",
      "Location",
      "Speaker",
      "Abstract",
      "Overview",
      "Transcript",
      "Session URL",
      "Topics",
      "Affiliations",
      "Technologies",
      "Format",
      "Has Recording",
      "Intended Audience",
    ];
    const sessRows: unknown[][] = [sessHeaders];
    for (const sess of sessions) {
      sessRows.push([
        sess.title,
        sess.type,
        sess.date ? new Intl.DateTimeFormat("en-CA").format(new Date(sess.date)) : null,
        sess.startTime,
        sess.endTime,
        sess.location,
        sess.speaker.join("; "),
        sess.abstract,
        sess.overview,
        sess.transcript,
        sess.sessionUrl,
        sess.topic.join("; "),
        sess.affiliation.join("; "),
        sess.technology.join("; "),
        sess.sessionFormat,
        sess.hasRecording ? "Yes" : "No",
        sess.intendedAudience,
      ]);
    }
    const sessSheet = XLSX.utils.aoa_to_sheet(sessRows);
    sessSheet["!cols"] = [
      { wch: 50 }, { wch: 20 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 25 },
      { wch: 40 }, { wch: 80 }, { wch: 80 }, { wch: 80 }, { wch: 40 }, { wch: 35 },
      { wch: 40 }, { wch: 35 }, { wch: 15 }, { wch: 15 }, { wch: 25 },
    ];
    XLSX.utils.book_append_sheet(wb, sessSheet, "Sessions");

    // Write to buffer and return
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const filename = `${instance.venue.name.toLowerCase()}-${instance.year}.xlsx`;

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Conference export error:", error);
    return NextResponse.json({ error: "Failed to export conference data" }, { status: 500 });
  }
}
