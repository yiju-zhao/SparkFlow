import { z } from "zod";

export const SESSION_FORMAT_VALUES = ["IN_PERSON", "VIRTUAL", "BOTH"] as const;

export const PublicationInputSchema = z.object({
  title: z.string().min(1),
  authors: z.array(z.string()),
  abstract: z.string().optional(),
  summary: z.string().optional(),
  affiliations: z.array(z.string()).default([]),
  countries: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  researchTopic: z.string().optional(),
  status: z.string().optional(),
  rating: z.number().optional(),
  doi: z.string().optional(),
  pdfUrl: z.string().url().or(z.literal("")).optional(),
  githubUrl: z.string().url().or(z.literal("")).optional(),
  websiteUrl: z.string().url().or(z.literal("")).optional(),
});

export const PublicationsFileSchema = z.object({
  venue: z.string().min(1),
  year: z.number().int().min(1900).max(2100),
  publications: z.array(PublicationInputSchema),
});

export const SessionInputSchema = z.object({
  title: z.string().min(1),
  type: z.string().optional(),
  date: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  location: z.string().optional(),
  speaker: z.array(z.string()).default([]),
  abstract: z.string().optional(),
  overview: z.string().optional(),
  transcript: z.string().optional(),
  sessionUrl: z.string().url().or(z.literal("")).optional(),
  topic: z.array(z.string()).default([]),
  affiliation: z.array(z.string()).default([]),
  technology: z.array(z.string()).default([]),
  sessionFormat: z.enum(SESSION_FORMAT_VALUES).optional(),
  hasRecording: z.boolean().default(false),
  intendedAudience: z.string().optional(),
  publicationTitles: z.array(z.string()).default([]),
});

export const SessionsFileSchema = z.object({
  venue: z.string().min(1),
  year: z.number().int().min(1900).max(2100),
  sessions: z.array(SessionInputSchema),
});

export type PublicationInput = z.infer<typeof PublicationInputSchema>;
export type PublicationsFile = z.infer<typeof PublicationsFileSchema>;
export type SessionInput = z.infer<typeof SessionInputSchema>;
export type SessionsFile = z.infer<typeof SessionsFileSchema>;
