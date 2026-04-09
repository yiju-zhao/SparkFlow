import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ instanceId: string }> }
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
      return NextResponse.json(
        { error: "Conference not found" },
        { status: 404 }
      );
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

    // Build Excel workbook with ExcelJS
    const { Workbook } = await import("exceljs");
    const workbook = new Workbook();

    // --- Publications sheet ---
    const pubSheet = workbook.addWorksheet("Publications");
    pubSheet.columns = [
      { header: "Title", key: "title", width: 50 },
      { header: "Authors", key: "authors", width: 40 },
      { header: "Abstract", key: "abstract", width: 80 },
      { header: "Summary", key: "summary", width: 80 },
      { header: "Affiliations", key: "affiliations", width: 40 },
      { header: "Countries", key: "countries", width: 25 },
      { header: "Keywords", key: "keywords", width: 35 },
      { header: "Research Topic", key: "researchTopic", width: 25 },
      { header: "Rating", key: "rating", width: 10 },
      { header: "Status", key: "status", width: 15 },
      { header: "DOI", key: "doi", width: 30 },
      { header: "PDF URL", key: "pdfUrl", width: 40 },
      { header: "GitHub URL", key: "githubUrl", width: 40 },
      { header: "Website URL", key: "websiteUrl", width: 40 },
    ];

    for (const pub of publications) {
      pubSheet.addRow({
        title: pub.title,
        authors: pub.authors.join("; "),
        abstract: pub.abstract,
        summary: pub.summary,
        affiliations: pub.affiliations.join("; "),
        countries: pub.countries.join("; "),
        keywords: pub.keywords.join("; "),
        researchTopic: pub.researchTopic,
        rating: pub.rating,
        status: pub.status,
        doi: pub.doi,
        pdfUrl: pub.pdfUrl,
        githubUrl: pub.githubUrl,
        websiteUrl: pub.websiteUrl,
      });
    }

    // Bold header row
    pubSheet.getRow(1).font = { bold: true };

    // --- Sessions sheet ---
    const sessSheet = workbook.addWorksheet("Sessions");
    sessSheet.columns = [
      { header: "Title", key: "title", width: 50 },
      { header: "Type", key: "type", width: 20 },
      { header: "Date", key: "date", width: 15 },
      { header: "Start Time", key: "startTime", width: 12 },
      { header: "End Time", key: "endTime", width: 12 },
      { header: "Location", key: "location", width: 25 },
      { header: "Speaker", key: "speaker", width: 40 },
      { header: "Abstract", key: "abstract", width: 80 },
      { header: "Overview", key: "overview", width: 80 },
      { header: "Transcript", key: "transcript", width: 80 },
      { header: "Session URL", key: "sessionUrl", width: 40 },
      { header: "Topics", key: "topic", width: 35 },
      { header: "Affiliations", key: "affiliation", width: 40 },
      { header: "Technologies", key: "technology", width: 35 },
      { header: "Format", key: "sessionFormat", width: 15 },
      { header: "Has Recording", key: "hasRecording", width: 15 },
      { header: "Intended Audience", key: "intendedAudience", width: 25 },
    ];

    for (const sess of sessions) {
      sessSheet.addRow({
        title: sess.title,
        type: sess.type,
        date: sess.date
          ? new Intl.DateTimeFormat("en-CA").format(new Date(sess.date))
          : null,
        startTime: sess.startTime,
        endTime: sess.endTime,
        location: sess.location,
        speaker: sess.speaker.join("; "),
        abstract: sess.abstract,
        overview: sess.overview,
        transcript: sess.transcript,
        sessionUrl: sess.sessionUrl,
        topic: sess.topic.join("; "),
        affiliation: sess.affiliation.join("; "),
        technology: sess.technology.join("; "),
        sessionFormat: sess.sessionFormat,
        hasRecording: sess.hasRecording ? "Yes" : "No",
        intendedAudience: sess.intendedAudience,
      });
    }

    sessSheet.getRow(1).font = { bold: true };

    // Write to buffer and return
    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `${instance.venue.name.toLowerCase()}-${instance.year}.xlsx`;

    return new Response(buffer as ArrayBuffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Conference export error:", error);
    return NextResponse.json(
      { error: "Failed to export conference data" },
      { status: 500 }
    );
  }
}
