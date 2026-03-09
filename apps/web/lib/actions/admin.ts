"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import {
  assertImportMatchesInstance,
  importPublicationsForInstance,
  importSessionsForInstance,
  parseImportPayload,
  type InstanceImportPayload,
  type InstanceImportResult,
} from "@/lib/import/instance-import";
import prisma from "@/lib/prisma";

async function requireAdminUser() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
}

// ============================================
// Venue Actions
// ============================================

export async function getVenues() {
  await requireAdminUser();

  return prisma.venue.findMany({
    include: {
      _count: {
        select: { instances: true },
      },
    },
    orderBy: { name: "asc" },
  });
}

export async function createVenue(data: {
  name: string;
  type?: string;
  description?: string;
}) {
  await requireAdminUser();

  const venue = await prisma.venue.create({ data });
  revalidatePath("/admin/venues");
  return venue;
}

export async function updateVenue(
  id: string,
  data: { name?: string; type?: string; description?: string },
) {
  await requireAdminUser();

  const venue = await prisma.venue.update({ where: { id }, data });
  revalidatePath("/admin/venues");
  return venue;
}

export async function deleteVenue(id: string) {
  await requireAdminUser();

  await prisma.venue.delete({ where: { id } });
  revalidatePath("/admin/venues");
}

// ============================================
// Instance Actions
// ============================================

export async function getInstances() {
  await requireAdminUser();

  return prisma.instance.findMany({
    include: {
      venue: { select: { id: true, name: true } },
      _count: {
        select: { sessions: true },
      },
    },
    orderBy: [{ year: "desc" }, { name: "asc" }],
  });
}

export async function createInstance(data: {
  venueId: string;
  year: number;
  name: string;
  startDate?: Date;
  endDate?: Date;
  location?: string;
  website?: string;
  summary?: string;
}) {
  await requireAdminUser();

  const instance = await prisma.instance.create({ data });
  revalidatePath("/admin/instances");
  return instance;
}

export async function updateInstance(
  id: string,
  data: {
    venueId?: string;
    year?: number;
    name?: string;
    startDate?: Date | null;
    endDate?: Date | null;
    location?: string;
    website?: string;
    summary?: string;
  },
) {
  await requireAdminUser();

  const instance = await prisma.instance.update({ where: { id }, data });
  revalidatePath("/admin/instances");
  return instance;
}

export async function deleteInstance(id: string) {
  await requireAdminUser();

  await prisma.instance.delete({ where: { id } });
  revalidatePath("/admin/instances");
}

export async function saveInstanceWithImport(input: {
  instanceId?: string;
  data: {
    venueId: string;
    year: number;
    name: string;
    startDate?: Date | null;
    endDate?: Date | null;
    location?: string;
    website?: string;
    summary?: string;
  };
  importPayload?: InstanceImportPayload;
}): Promise<{
  instance: {
    id: string;
    venueId: string;
    year: number;
    name: string;
    startDate: Date | null;
    endDate: Date | null;
    location: string | null;
    website: string | null;
    summary: string | null;
  };
  importResult?: InstanceImportResult;
}> {
  await requireAdminUser();

  const venue = await prisma.venue.findUnique({
    where: { id: input.data.venueId },
    select: { id: true, name: true },
  });

  if (!venue) {
    throw new Error("Venue not found");
  }

  const parsedImport = input.importPayload
    ? parseImportPayload(input.importPayload)
    : null;

  if (parsedImport) {
    assertImportMatchesInstance(parsedImport, {
      venueName: venue.name,
      year: input.data.year,
    });
  }

  const instance = input.instanceId
    ? await prisma.instance.update({
        where: { id: input.instanceId },
        data: input.data,
      })
    : await prisma.instance.create({
        data: input.data,
      });

  let importResult: InstanceImportResult | undefined;

  if (parsedImport?.kind === "PUBLICATIONS") {
    importResult = await importPublicationsForInstance(
      instance.id,
      parsedImport.data,
      {
        reset: input.importPayload?.reset,
      },
    );
  } else if (parsedImport?.kind === "SESSIONS") {
    importResult = await importSessionsForInstance(
      instance.id,
      parsedImport.data,
      {
        reset: input.importPayload?.reset,
      },
    );
  }

  revalidatePath("/admin/instances");
  revalidatePath("/admin/sessions");
  revalidatePath("/explore/conferences");
  revalidatePath("/explore/publications");
  revalidatePath("/explore/sessions");

  return { instance, importResult };
}

// ============================================
// ConferenceSession Actions
// ============================================

export async function getSessions(instanceId?: string) {
  await requireAdminUser();

  return prisma.conferenceSession.findMany({
    where: instanceId ? { instanceId } : undefined,
    include: {
      instance: {
        select: {
          id: true,
          name: true,
          year: true,
          venue: { select: { name: true } },
        },
      },
    },
    orderBy: [{ date: "asc" }, { title: "asc" }],
  });
}

export async function createSession(data: {
  instanceId: string;
  title: string;
  type?: string;
  date?: Date;
  startTime?: string;
  endTime?: string;
  location?: string;
  speaker?: string[];
  abstract?: string;
  overview?: string;
  transcript?: string;
  sessionUrl?: string;
  topic?: string[];
  affiliation?: string[];
  technology?: string[];
}) {
  await requireAdminUser();

  const conferenceSession = await prisma.conferenceSession.create({ data });
  revalidatePath("/admin/sessions");
  return conferenceSession;
}

export async function updateSession(
  id: string,
  data: {
    instanceId?: string;
    title?: string;
    type?: string;
    date?: Date | null;
    startTime?: string;
    endTime?: string;
    location?: string;
    speaker?: string[];
    abstract?: string;
    overview?: string;
    transcript?: string;
    sessionUrl?: string;
    topic?: string[];
    affiliation?: string[];
    technology?: string[];
  },
) {
  await requireAdminUser();

  const conferenceSession = await prisma.conferenceSession.update({
    where: { id },
    data,
  });
  revalidatePath("/admin/sessions");
  return conferenceSession;
}

export async function deleteSession(id: string) {
  await requireAdminUser();

  await prisma.conferenceSession.delete({ where: { id } });
  revalidatePath("/admin/sessions");
}
