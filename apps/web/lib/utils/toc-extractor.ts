export interface TocHeading {
  text: string;
  level: number;
}

/**
 * Extracts H1-H3 headings from markdown content to build a table of contents.
 * Returns plain objects that are JSON-serializable for Prisma storage.
 */
export function extractTocFromMarkdown(content: string): Array<{ text: string; level: number }> {
  const headingRegex = /^(#{1,3})\s+(.+)$/gm;
  const headings: Array<{ text: string; level: number }> = [];

  let match;
  while ((match = headingRegex.exec(content)) !== null) {
    headings.push({
      level: match[1].length,
      text: match[2].trim(),
    });
  }

  return headings;
}
