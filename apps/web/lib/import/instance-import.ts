import prisma from "@/lib/prisma";
import {
  PublicationsFileSchema,
  SessionsFileSchema,
  type PublicationsFile,
  type SessionsFile,
} from "@/lib/import/schemas";

export type InstanceImportKind = "PUBLICATIONS" | "SESSIONS";

export interface InstanceImportPayload {
  kind: InstanceImportKind;
  rawData: unknown;
  fileName?: string;
  reset?: boolean;
}

export interface ImportErrorItem {
  title: string;
  error: string;
}

export interface SessionImportWarning {
  session: string;
  publication: string;
}

export interface PublicationsImportResult {
  kind: "PUBLICATIONS";
  total: number;
  created: number;
  skipped: number;
  deleted: number;
  errors: ImportErrorItem[];
}

export interface SessionsImportResult {
  kind: "SESSIONS";
  total: number;
  created: number;
  skipped: number;
  deleted: number;
  errors: ImportErrorItem[];
  warnings: SessionImportWarning[];
}

export type InstanceImportResult =
  | PublicationsImportResult
  | SessionsImportResult;

type ParsedImportPayload =
  | { kind: "PUBLICATIONS"; data: PublicationsFile }
  | { kind: "SESSIONS"; data: SessionsFile };

function normalizeOptionalText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function formatValidationErrors(result: {
  error: { issues: Array<{ path: PropertyKey[]; message: string }> };
}) {
  return result.error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "root";
      return `${path}: ${issue.message}`;
    })
    .join("\n");
}

export function parseImportPayload(
  payload: InstanceImportPayload,
): ParsedImportPayload {
  if (payload.kind === "PUBLICATIONS") {
    const result = PublicationsFileSchema.safeParse(payload.rawData);
    if (!result.success) {
      throw new Error(formatValidationErrors(result));
    }

    return {
      kind: "PUBLICATIONS",
      data: result.data,
    };
  }

  const result = SessionsFileSchema.safeParse(payload.rawData);
  if (!result.success) {
    throw new Error(formatValidationErrors(result));
  }

  return {
    kind: "SESSIONS",
    data: result.data,
  };
}

export function assertImportMatchesInstance(
  parsed: ParsedImportPayload,
  target: { venueName: string; year: number },
) {
  if (
    parsed.data.venue !== target.venueName ||
    parsed.data.year !== target.year
  ) {
    throw new Error(
      `JSON file targets ${parsed.data.venue} ${parsed.data.year}, but the form is set to ${target.venueName} ${target.year}.`,
    );
  }
}

export async function importPublicationsForInstance(
  instanceId: string,
  data: PublicationsFile,
  options?: { reset?: boolean },
): Promise<PublicationsImportResult> {
  const reset = Boolean(options?.reset);
  let deleted = 0;

  if (reset) {
    const deleteResult = await prisma.publication.deleteMany({
      where: { instanceId },
    });
    deleted = deleteResult.count;
  }

  const existingTitles = reset
    ? new Set<string>()
    : new Set(
        (
          await prisma.publication.findMany({
            where: { instanceId },
            select: { title: true },
          })
        ).map((publication) => publication.title),
      );

  let created = 0;
  let skipped = 0;
  const errors: ImportErrorItem[] = [];

  for (const publication of data.publications) {
    if (existingTitles.has(publication.title)) {
      skipped++;
      continue;
    }

    try {
      await prisma.publication.create({
        data: {
          instanceId,
          title: publication.title,
          authors: publication.authors,
          abstract: normalizeOptionalText(publication.abstract),
          summary: normalizeOptionalText(publication.summary),
          affiliations: publication.affiliations,
          countries: publication.countries,
          keywords: publication.keywords,
          researchTopic: normalizeOptionalText(publication.researchTopic),
          status: normalizeOptionalText(publication.status),
          rating: publication.rating,
          doi: normalizeOptionalText(publication.doi),
          pdfUrl: normalizeOptionalText(publication.pdfUrl),
          githubUrl: normalizeOptionalText(publication.githubUrl),
          websiteUrl: normalizeOptionalText(publication.websiteUrl),
        },
      });
      existingTitles.add(publication.title);
      created++;
    } catch (error) {
      errors.push({
        title: publication.title,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    kind: "PUBLICATIONS",
    total: data.publications.length,
    created,
    skipped,
    deleted,
    errors,
  };
}

export async function importSessionsForInstance(
  instanceId: string,
  data: SessionsFile,
  options?: { reset?: boolean },
): Promise<SessionsImportResult> {
  const reset = Boolean(options?.reset);
  let deleted = 0;

  if (reset) {
    const deleteResult = await prisma.conferenceSession.deleteMany({
      where: { instanceId },
    });
    deleted = deleteResult.count;
  }

  const existingTitles = reset
    ? new Set<string>()
    : new Set(
        (
          await prisma.conferenceSession.findMany({
            where: { instanceId },
            select: { title: true },
          })
        ).map((session) => session.title),
      );

  const publicationMap = new Map(
    (
      await prisma.publication.findMany({
        where: { instanceId },
        select: { id: true, title: true },
      })
    ).map((publication) => [publication.title, publication.id]),
  );

  let created = 0;
  let skipped = 0;
  const errors: ImportErrorItem[] = [];
  const warnings: SessionImportWarning[] = [];

  for (const session of data.sessions) {
    if (existingTitles.has(session.title)) {
      skipped++;
      continue;
    }

    try {
      const publicationLinks = session.publicationTitles
        .map((title, index) => {
          const publicationId = publicationMap.get(title);

          if (!publicationId) {
            warnings.push({ session: session.title, publication: title });
            return null;
          }

          return { publicationId, presentationOrder: index };
        })
        .filter(
          (
            entry,
          ): entry is { publicationId: string; presentationOrder: number } =>
            Boolean(entry),
        );

      await prisma.conferenceSession.create({
        data: {
          instanceId,
          title: session.title,
          type: normalizeOptionalText(session.type),
          date: session.date ? new Date(session.date) : undefined,
          startTime: normalizeOptionalText(session.startTime),
          endTime: normalizeOptionalText(session.endTime),
          location: normalizeOptionalText(session.location),
          speaker: session.speaker,
          abstract: normalizeOptionalText(session.abstract),
          overview: normalizeOptionalText(session.overview),
          transcript: normalizeOptionalText(session.transcript),
          sessionUrl: normalizeOptionalText(session.sessionUrl),
          topic: session.topic,
          affiliation: session.affiliation,
          technology: session.technology,
          sessionFormat: session.sessionFormat,
          hasRecording: session.hasRecording,
          intendedAudience: normalizeOptionalText(session.intendedAudience),
          publications: {
            create: publicationLinks,
          },
        },
      });
      existingTitles.add(session.title);
      created++;
    } catch (error) {
      errors.push({
        title: session.title,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    kind: "SESSIONS",
    total: data.sessions.length,
    created,
    skipped,
    deleted,
    errors,
    warnings,
  };
}
