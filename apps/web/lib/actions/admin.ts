"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// ============================================
// Venue Actions
// ============================================

export async function getVenues() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

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
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const venue = await prisma.venue.create({ data });
  revalidatePath("/admin/venues");
  return venue;
}

export async function updateVenue(
  id: string,
  data: { name?: string; type?: string; description?: string },
) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const venue = await prisma.venue.update({ where: { id }, data });
  revalidatePath("/admin/venues");
  return venue;
}

export async function deleteVenue(id: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  await prisma.venue.delete({ where: { id } });
  revalidatePath("/admin/venues");
}

// ============================================
// Instance Actions
// ============================================

export async function getInstances() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

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
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

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
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const instance = await prisma.instance.update({ where: { id }, data });
  revalidatePath("/admin/instances");
  return instance;
}

export async function deleteInstance(id: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  await prisma.instance.delete({ where: { id } });
  revalidatePath("/admin/instances");
}

// ============================================
// ConferenceSession Actions
// ============================================

export async function getSessions(instanceId?: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

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
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

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
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const conferenceSession = await prisma.conferenceSession.update({
    where: { id },
    data,
  });
  revalidatePath("/admin/sessions");
  return conferenceSession;
}

export async function deleteSession(id: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  await prisma.conferenceSession.delete({ where: { id } });
  revalidatePath("/admin/sessions");
}
