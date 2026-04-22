# Conference Data Import Mechanism Design

**Date:** 2026-02-05
**Status:** Approved

## Overview

CLI scripts for importing conference publications and sessions from JSON files into the SparkFlow database. Designed for developer use only (no admin UI).

## Goals

- Import publications from standardized JSON files
- Import sessions from standardized JSON files
- Auto-create Venue and Instance records as needed
- Detect and skip duplicates
- Link sessions to publications by title

## Non-Goals

- Admin UI for imports
- PDF extraction (deferred to future)
- Automatic data format conversion

## File Structure

```
apps/web/
├── scripts/
│   ├── import-publications.ts   # CLI entry point
│   ├── import-sessions.ts       # CLI entry point
│   └── lib/
│       ├── import-schemas.ts    # Zod validation schemas
│       └── import-utils.ts      # Shared helpers
│   └── samples/
│       ├── publications-sample.json
│       └── sessions-sample.json
```

## Standard JSON Formats

### Publications File

```json
{
  "venue": "CHI",
  "year": 2024,
  "instanceMetadata": {
    "name": "CHI 2024",
    "location": "Honolulu, Hawaii",
    "startDate": "2024-05-11",
    "endDate": "2024-05-16",
    "website": "https://chi2024.acm.org"
  },
  "publications": [
    {
      "title": "Paper Title Here",
      "authors": ["Alice Smith", "Bob Jones"],
      "abstract": "Paper abstract...",
      "affiliations": ["Stanford University", "MIT"],
      "countries": ["USA"],
      "keywords": ["HCI", "VR"],
      "researchTopic": "Virtual Reality",
      "rating": 4.5,
      "doi": "10.1145/xxxxx",
      "pdfUrl": "https://...",
      "githubUrl": "https://github.com/...",
      "websiteUrl": "https://..."
    }
  ]
}
```

### Sessions File

```json
{
  "venue": "CHI",
  "year": 2024,
  "sessions": [
    {
      "title": "Session Title",
      "type": "Paper Session",
      "date": "2024-05-12",
      "startTime": "09:00",
      "endTime": "10:30",
      "location": "Room 301A",
      "speaker": "Dr. Jane Doe",
      "abstract": "Session abstract...",
      "overview": "Session overview...",
      "publicationTitles": ["Paper Title Here", "Another Paper"]
    }
  ]
}
```

## Import Logic

### Publications Import

1. Read and validate JSON against Zod schema
2. Find or create `Venue` by name (unique constraint)
3. Find or create `Instance` by venue + year (unique constraint)
   - Apply instanceMetadata if creating new
4. For each publication:
   - Check if exists by `instanceId + title`
   - Create if new, skip if duplicate
5. Print summary: created, skipped, errors

### Sessions Import

1. Read and validate JSON against Zod schema
2. Find existing `Venue` + `Instance` (error if not found)
3. For each session:
   - Check if exists by `instanceId + title`
   - Create session if new
   - Link to publications by matching `publicationTitles`
   - Warn if any publication title not found
4. Print summary

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Duplicate detection | By title within instance | Simple, practical for conference data |
| Session-Publication linking | Exact title match | Publications imported first, titles are reliable |
| Error handling | Continue on record errors | Report all at end for batch review |
| Update behavior | Create only, no updates | Use Prisma Studio for edits |

## Usage

```bash
cd apps/web

# Import publications (creates venue + instance if needed)
npx tsx scripts/import-publications.ts ./data/chi2024-publications.json

# Import sessions (requires existing instance)
npx tsx scripts/import-sessions.ts ./data/chi2024-sessions.json
```

## Zod Schemas

### Publication Input Schema

```typescript
const PublicationInputSchema = z.object({
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

const InstanceMetadataSchema = z.object({
  name: z.string().optional(),
  location: z.string().optional(),
  startDate: z.string().optional(),  // ISO date
  endDate: z.string().optional(),
  website: z.string().url().optional(),
  summary: z.string().optional(),
});

const PublicationsFileSchema = z.object({
  venue: z.string().min(1),
  year: z.number().int().min(1900).max(2100),
  instanceMetadata: InstanceMetadataSchema.optional(),
  publications: z.array(PublicationInputSchema),
});
```

### Session Input Schema

```typescript
const SessionInputSchema = z.object({
  title: z.string().min(1),
  type: z.string().optional(),
  date: z.string().optional(),       // ISO date
  startTime: z.string().optional(),  // HH:mm
  endTime: z.string().optional(),
  location: z.string().optional(),
  speaker: z.string().optional(),
  abstract: z.string().optional(),
  overview: z.string().optional(),
  publicationTitles: z.array(z.string()).default([]),
});

const SessionsFileSchema = z.object({
  venue: z.string().min(1),
  year: z.number().int().min(1900).max(2100),
  sessions: z.array(SessionInputSchema),
});
```

## Shared Utilities

```typescript
// import-utils.ts

async function findOrCreateVenue(name: string): Promise<string>
// Returns venue ID, creates if not exists

async function findOrCreateInstance(
  venueId: string,
  year: number,
  metadata?: InstanceMetadata
): Promise<string>
// Returns instance ID, creates with metadata if not exists

async function findPublicationByTitle(
  instanceId: string,
  title: string
): Promise<string | null>
// Returns publication ID or null
```

## Output Examples

### Successful Publications Import

```
Reading ./data/chi2024-publications.json...
✓ Validated 150 publications

Processing...
✓ Venue "CHI" created
✓ Instance "CHI 2024" created

Results:
  Created: 147
  Skipped (duplicate): 3
  Errors: 0
```

### Sessions Import with Warnings

```
Reading ./data/chi2024-sessions.json...
✓ Validated 45 sessions

Processing...
✓ Found Instance "CHI 2024"

Results:
  Created: 42
  Skipped (duplicate): 3
  Errors: 0

Warnings:
  ⚠ Session "VR Papers" - publication not found: "Typo in Title"
  ⚠ Session "AI Panel" - publication not found: "Missing Paper"
```

## Future Enhancements (Not in Scope)

- PDF extraction using MineRU
- Admin UI for imports
- Bulk update capabilities
- Data validation reports
- Import history/audit log
