#!/usr/bin/env npx tsx
/**
 * Import sessions from a JSON file into the database.
 * Requires venue and instance to already exist (run import-publications first).
 *
 * Usage: npx tsx scripts/import-sessions.ts [--reset] ./path/to/sessions.json
 *
 * Options:
 *   --reset  Delete all existing sessions for this instance before importing
 */

import * as fs from "fs";
import * as path from "path";
import { SessionsFileSchema } from "./lib/import-schemas";
import {
  prisma,
  findInstance,
  findSessionByTitle,
  findPublicationByTitle,
  disconnect,
} from "./lib/import-utils";

async function main() {
  const args = process.argv.slice(2);

  // Parse --reset flag
  const resetIndex = args.indexOf("--reset");
  const resetMode = resetIndex !== -1;
  if (resetMode) {
    args.splice(resetIndex, 1);
  }

  if (args.length === 0) {
    console.error("Usage: npx tsx scripts/import-sessions.ts [--reset] <json-file>");
    console.error("\nOptions:");
    console.error("  --reset  Delete all existing sessions for this instance before importing");
    process.exit(1);
  }

  const filePath = path.resolve(args[0]);

  // Read and parse JSON file
  console.log(`Reading ${filePath}...`);

  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  let rawData: unknown;
  try {
    const fileContent = fs.readFileSync(filePath, "utf-8");
    rawData = JSON.parse(fileContent);
  } catch (err) {
    console.error(`Error: Failed to parse JSON file: ${err}`);
    process.exit(1);
  }

  // Validate against schema
  const parseResult = SessionsFileSchema.safeParse(rawData);
  if (!parseResult.success) {
    console.error("Validation errors:");
    for (const issue of parseResult.error.issues) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }

  const data = parseResult.data;
  console.log(`\u2713 Validated ${data.sessions.length} sessions\n`);

  console.log("Processing...");

  // Find existing Venue + Instance (must exist)
  const instanceInfo = await findInstance(data.venue, data.year);
  if (!instanceInfo) {
    console.error(
      `Error: Instance not found for venue "${data.venue}" year ${data.year}`
    );
    console.error("Run import-publications first to create the venue and instance.");
    process.exit(1);
  }

  console.log(`\u2713 Found Instance "${instanceInfo.instanceName}"`);

  // Reset mode: delete existing sessions for this instance
  let deleted = 0;
  if (resetMode) {
    const deleteResult = await prisma.conferenceSession.deleteMany({
      where: { instanceId: instanceInfo.instanceId },
    });
    deleted = deleteResult.count;
    console.log(`\u2713 Deleted ${deleted} existing sessions (--reset mode)`);
  }

  // Import sessions
  let created = 0;
  let skipped = 0;
  const errors: { title: string; error: string }[] = [];
  const warnings: { session: string; publication: string }[] = [];

  for (const session of data.sessions) {
    try {
      // Check for duplicate
      const existingId = await findSessionByTitle(instanceInfo.instanceId, session.title);
      if (existingId) {
        skipped++;
        continue;
      }

      // Find publication IDs to link
      const publicationLinks: { publicationId: string; presentationOrder: number }[] = [];
      for (let i = 0; i < session.publicationTitles.length; i++) {
        const pubTitle = session.publicationTitles[i];
        const pubId = await findPublicationByTitle(instanceInfo.instanceId, pubTitle);
        if (pubId) {
          publicationLinks.push({ publicationId: pubId, presentationOrder: i });
        } else {
          warnings.push({ session: session.title, publication: pubTitle });
        }
      }

      // Create session with publication links
      await prisma.conferenceSession.create({
        data: {
          instanceId: instanceInfo.instanceId,
          title: session.title,
          type: session.type,
          date: session.date ? new Date(session.date) : undefined,
          startTime: session.startTime,
          endTime: session.endTime,
          location: session.location,
          speaker: session.speaker,
          abstract: session.abstract,
          overview: session.overview,
          publications: {
            create: publicationLinks,
          },
        },
      });
      created++;
    } catch (err) {
      errors.push({
        title: session.title,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Print summary
  console.log("\nResults:");
  if (resetMode) {
    console.log(`  Deleted: ${deleted}`);
  }
  console.log(`  Created: ${created}`);
  if (!resetMode) {
    console.log(`  Skipped (duplicate): ${skipped}`);
  }
  console.log(`  Errors: ${errors.length}`);

  if (warnings.length > 0) {
    console.log("\nWarnings:");
    for (const { session, publication } of warnings) {
      console.log(`  \u26a0 Session "${session}" - publication not found: "${publication}"`);
    }
  }

  if (errors.length > 0) {
    console.log("\nErrors:");
    for (const { title, error } of errors) {
      console.log(`  \u2717 "${title}": ${error}`);
    }
  }

  await disconnect();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
