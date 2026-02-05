#!/usr/bin/env npx tsx
/**
 * Import publications from a JSON file into the database.
 *
 * Usage: npx tsx scripts/import-publications.ts [--reset] ./path/to/publications.json
 *
 * Options:
 *   --reset  Delete all existing publications for this instance before importing
 */

import * as fs from "fs";
import * as path from "path";
import { PublicationsFileSchema, type PublicationInput } from "./lib/import-schemas";
import {
  prisma,
  findOrCreateVenue,
  findOrCreateInstance,
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
    console.error("Usage: npx tsx scripts/import-publications.ts [--reset] <json-file>");
    console.error("\nOptions:");
    console.error("  --reset  Delete all existing publications for this instance before importing");
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
  const parseResult = PublicationsFileSchema.safeParse(rawData);
  if (!parseResult.success) {
    console.error("Validation errors:");
    for (const issue of parseResult.error.issues) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }

  const data = parseResult.data;
  console.log(`\u2713 Validated ${data.publications.length} publications\n`);

  console.log("Processing...");

  // Find or create Venue
  const venueResult = await findOrCreateVenue(data.venue);
  if (venueResult.created) {
    console.log(`\u2713 Venue "${data.venue}" created`);
  } else {
    console.log(`\u2713 Venue "${data.venue}" found`);
  }

  // Find or create Instance
  const instanceResult = await findOrCreateInstance(
    venueResult.id,
    data.year,
    data.instanceMetadata
  );
  const instanceName = data.instanceMetadata?.name ?? `${data.venue} ${data.year}`;
  if (instanceResult.created) {
    console.log(`\u2713 Instance "${instanceName}" created`);
  } else {
    console.log(`\u2713 Instance "${instanceName}" found`);
  }

  // Reset mode: delete existing publications for this instance
  let deleted = 0;
  if (resetMode) {
    const deleteResult = await prisma.publication.deleteMany({
      where: { instanceId: instanceResult.id },
    });
    deleted = deleteResult.count;
    console.log(`\u2713 Deleted ${deleted} existing publications (--reset mode)`);
  }

  // Import publications
  let created = 0;
  let skipped = 0;
  const errors: { title: string; error: string }[] = [];

  for (const pub of data.publications) {
    try {
      // Check for duplicate
      const existingId = await findPublicationByTitle(instanceResult.id, pub.title);
      if (existingId) {
        skipped++;
        continue;
      }

      // Create publication
      await prisma.publication.create({
        data: {
          instanceId: instanceResult.id,
          title: pub.title,
          authors: pub.authors,
          abstract: pub.abstract,
          affiliations: pub.affiliations,
          countries: pub.countries,
          keywords: pub.keywords,
          researchTopic: pub.researchTopic,
          rating: pub.rating,
          doi: pub.doi,
          pdfUrl: pub.pdfUrl,
          githubUrl: pub.githubUrl,
          websiteUrl: pub.websiteUrl,
        },
      });
      created++;
    } catch (err) {
      errors.push({
        title: pub.title,
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
