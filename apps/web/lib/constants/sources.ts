export const MAX_SOURCES_PER_NOTEBOOK = 50;

export const SOURCE_LIMIT_ERROR_PREFIX = "SOURCE_LIMIT_REACHED";

export function formatSourceLimitError(remaining: number, attempted: number): string {
  return `${SOURCE_LIMIT_ERROR_PREFIX}: ${remaining} slot${remaining === 1 ? "" : "s"} remaining, tried to add ${attempted}`;
}
