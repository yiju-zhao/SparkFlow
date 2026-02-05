// scripts/lib/import-utils.ts
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { config } from "dotenv";

// Load environment variables
config();

// Create Prisma client with pg adapter (matching main app setup)
function createPrismaClient() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

const prisma = createPrismaClient();

export { prisma };

/**
 * Find venue by name or create if not exists
 * @returns Venue ID and whether it was created
 */
export async function findOrCreateVenue(
  name: string
): Promise<{ id: string; created: boolean }> {
  const existing = await prisma.venue.findUnique({
    where: { name },
  });

  if (existing) {
    return { id: existing.id, created: false };
  }

  const created = await prisma.venue.create({
    data: { name },
  });

  return { id: created.id, created: true };
}

/**
 * Find instance by venue+year or create if not exists
 * @returns Instance ID and whether it was created
 */
export async function findOrCreateInstance(
  venueId: string,
  year: number,
  metadata?: {
    name?: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    website?: string;
    summary?: string;
  }
): Promise<{ id: string; created: boolean }> {
  const existing = await prisma.instance.findUnique({
    where: {
      venueId_year: { venueId, year },
    },
  });

  if (existing) {
    return { id: existing.id, created: false };
  }

  const venue = await prisma.venue.findUnique({ where: { id: venueId } });
  const defaultName = `${venue?.name || "Conference"} ${year}`;

  const created = await prisma.instance.create({
    data: {
      venueId,
      year,
      name: metadata?.name || defaultName,
      location: metadata?.location,
      startDate: metadata?.startDate ? new Date(metadata.startDate) : undefined,
      endDate: metadata?.endDate ? new Date(metadata.endDate) : undefined,
      website: metadata?.website,
      summary: metadata?.summary,
    },
  });

  return { id: created.id, created: true };
}

/**
 * Find publication by instance and title
 */
export async function findPublicationByTitle(
  instanceId: string,
  title: string
): Promise<string | null> {
  const pub = await prisma.publication.findFirst({
    where: {
      instanceId,
      title,
    },
    select: { id: true },
  });

  return pub?.id || null;
}

/**
 * Find session by instance and title
 */
export async function findSessionByTitle(
  instanceId: string,
  title: string
): Promise<string | null> {
  const session = await prisma.conferenceSession.findFirst({
    where: {
      instanceId,
      title,
    },
    select: { id: true },
  });

  return session?.id || null;
}

/**
 * Find existing venue and instance by name and year
 * @returns Venue ID and Instance ID, or null if not found
 */
export async function findInstance(
  venueName: string,
  year: number
): Promise<{ venueId: string; instanceId: string; instanceName: string } | null> {
  const venue = await prisma.venue.findUnique({
    where: { name: venueName },
  });

  if (!venue) {
    return null;
  }

  const instance = await prisma.instance.findUnique({
    where: {
      venueId_year: { venueId: venue.id, year },
    },
  });

  if (!instance) {
    return null;
  }

  return { venueId: venue.id, instanceId: instance.id, instanceName: instance.name };
}

/**
 * Disconnect Prisma client (call at end of script)
 */
export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}
