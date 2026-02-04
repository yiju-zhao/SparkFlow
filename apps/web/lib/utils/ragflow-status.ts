export type SourceStatus = "UPLOADING" | "PROCESSING" | "READY" | "FAILED";

/**
 * Map RagFlow run/status values to our internal SourceStatus.
 * RagFlow uses various status codes:
 * - "DONE" or "3" = READY
 * - "FAIL", "4", "-1", "ERROR" = FAILED
 * - Everything else = PROCESSING
 */
export function mapRagFlowStatus(runValue: string | number): SourceStatus {
  const normalized = String(runValue).toUpperCase();

  if (normalized === "DONE" || normalized === "3") {
    return "READY";
  }

  if (
    normalized === "FAIL" ||
    normalized === "4" ||
    normalized === "-1" ||
    normalized === "ERROR"
  ) {
    return "FAILED";
  }

  return "PROCESSING";
}
