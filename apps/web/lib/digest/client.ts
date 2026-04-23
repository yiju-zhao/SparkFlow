/**
 * Thin fetch client for the digest API routes.
 * Used by the /digest page and any other frontend consumers.
 */

import type {
  DigestGenerateRequest,
  DigestSectionStatus,
} from "@/lib/types/digest";

export async function createDigest(req: DigestGenerateRequest) {
  const res = await fetch("/api/digest/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`createDigest failed: ${res.status}`);
  return res.json();
}

export async function readDigest(date?: string) {
  const url = date
    ? `/api/digest?date=${encodeURIComponent(date)}`
    : "/api/digest";
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`readDigest failed: ${res.status}`);
  return res.json();
}

export async function pollSectionStatus(
  digestId: string,
  sectionId: string,
): Promise<DigestSectionStatus> {
  const res = await fetch(
    `/api/digest/${digestId}/sections/${sectionId}/status`,
  );
  if (!res.ok) throw new Error(`pollSectionStatus failed: ${res.status}`);
  return res.json();
}
