import { z } from "zod";

// ============================================
// Publication Schemas
// ============================================

export const PublicationInputSchema = z.object({
  title: z.string().min(1),
  authors: z.array(z.string()),
  abstract: z.string().optional(),
  affiliations: z.array(z.string()).default([]),
  countries: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  researchTopic: z.string().optional(),
  rating: z.number().optional(),
  doi: z.string().optional(),
  pdfUrl: z.string().url().optional(),
  githubUrl: z.string().url().optional(),
  websiteUrl: z.string().url().optional(),
});

export const InstanceMetadataSchema = z.object({
  name: z.string().optional(),
  location: z.string().optional(),
  startDate: z.string().optional(), // ISO date
  endDate: z.string().optional(),
  website: z.string().url().optional(),
  summary: z.string().optional(),
});

export const PublicationsFileSchema = z.object({
  venue: z.string().min(1),
  year: z.number().int().min(1900).max(2100),
  instanceMetadata: InstanceMetadataSchema.optional(),
  publications: z.array(PublicationInputSchema),
});

// ============================================
// Session Schemas
// ============================================

export const SessionInputSchema = z.object({
  title: z.string().min(1),
  type: z.string().optional(),
  date: z.string().optional(), // ISO date
  startTime: z.string().optional(), // HH:mm
  endTime: z.string().optional(),
  location: z.string().optional(),
  speaker: z.string().optional(),
  abstract: z.string().optional(),
  overview: z.string().optional(),
  sessionUrl: z.string().url().optional(),
  publicationTitles: z.array(z.string()).default([]),
});

export const SessionsFileSchema = z.object({
  venue: z.string().min(1),
  year: z.number().int().min(1900).max(2100),
  sessions: z.array(SessionInputSchema),
});

// ============================================
// Type Exports
// ============================================

export type PublicationInput = z.infer<typeof PublicationInputSchema>;
export type InstanceMetadata = z.infer<typeof InstanceMetadataSchema>;
export type PublicationsFile = z.infer<typeof PublicationsFileSchema>;
export type SessionInput = z.infer<typeof SessionInputSchema>;
export type SessionsFile = z.infer<typeof SessionsFileSchema>;
