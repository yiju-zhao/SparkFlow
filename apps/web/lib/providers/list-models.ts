import {
  PROVIDER_MAP,
  CUSTOM_PROVIDER_PREFIX,
} from "@/lib/types/providers";

/**
 * Apps/web (Node) cannot reach LLM providers directly from the
 * corporate network — outbound TLS is intercepted or blocked. All
 * BYOK calls go through apps/agent's `/v1/llm/*` gateway, which uses
 * Python's working httpx + CA trust chain.
 */

const FETCH_TIMEOUT_MS = 12_000;

export type FetchModelsErrorCode =
  | "INVALID_KEY"
  | "INVALID_BASE_URL"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "BAD_RESPONSE"
  | "PROVIDER_UNKNOWN"
  | "GATEWAY_NOT_CONFIGURED";

export class FetchModelsError extends Error {
  public readonly code: FetchModelsErrorCode;
  public readonly providerId: string;
  public readonly upstreamStatus?: number;

  constructor(
    code: FetchModelsErrorCode,
    providerId: string,
    message: string,
    upstreamStatus?: number,
  ) {
    super(message);
    this.code = code;
    this.providerId = providerId;
    this.upstreamStatus = upstreamStatus;
  }
}

/**
 * Resolves the URL of the apps/agent LLM gateway. Defaults to
 * localhost:2027 (host-side dev), overridden in production via
 * WORKFLOWS_API_URL or the docker-compose service hostname.
 */
function gatewayBase(): string {
  return (
    process.env.WORKFLOWS_API_URL ||
    process.env.NEXT_PUBLIC_WORKFLOWS_API_URL ||
    "http://localhost:2027"
  ).replace(/\/$/, "");
}

function internalToken(): string {
  const t = process.env.INTERNAL_CALLBACK_TOKEN;
  if (!t) {
    throw new FetchModelsError(
      "GATEWAY_NOT_CONFIGURED",
      "_",
      "INTERNAL_CALLBACK_TOKEN is not set; the Node side cannot authenticate to the LLM gateway",
    );
  }
  return t;
}

/**
 * Lightweight SSRF check on the user-supplied custom baseUrl. The
 * Python gateway re-checks before issuing the upstream call (defense
 * in depth) — this version just gives the user fast feedback when
 * they typo a localhost URL into the settings form.
 */
export function assertSafeUrl(raw: string, providerId: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new FetchModelsError("INVALID_BASE_URL", providerId, "Invalid URL");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new FetchModelsError(
      "INVALID_BASE_URL",
      providerId,
      `Unsupported protocol "${parsed.protocol}"`,
    );
  }
  if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
    throw new FetchModelsError(
      "INVALID_BASE_URL",
      providerId,
      "https:// is required in production",
    );
  }
  const host = parsed.hostname.toLowerCase();
  const blocked =
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
    /^\[?(::1|fc|fd|fe80)/i.test(host);
  if (blocked) {
    throw new FetchModelsError(
      "INVALID_BASE_URL",
      providerId,
      `Private / loopback host "${host}" is not allowed`,
    );
  }
  return parsed;
}

/**
 * Fetch the chat-capable model id list for `providerId`. Built-in
 * providers resolve their baseUrl via PROVIDER_MAP; custom providers
 * (id `custom` or `custom-…`) require an explicit `baseUrl`.
 *
 * Implementation: POST to apps/agent's /v1/llm/models gateway. The
 * Python side handles the actual upstream call + response filtering.
 */
export async function fetchProviderModels(
  providerId: string,
  apiKey: string,
  baseUrl?: string,
  signal?: AbortSignal,
): Promise<string[]> {
  // Built-in providers don't carry baseUrl from the caller — fill it
  // from PROVIDER_MAP so the gateway can route.
  let resolvedBaseUrl = baseUrl;
  if (!resolvedBaseUrl) {
    const provider = PROVIDER_MAP.get(providerId);
    if (!provider) {
      throw new FetchModelsError(
        "PROVIDER_UNKNOWN",
        providerId,
        `Unknown provider "${providerId}"`,
      );
    }
    resolvedBaseUrl = provider.baseUrl;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener("abort", () => ctrl.abort());
  }

  let res: Response;
  try {
    res = await fetch(`${gatewayBase()}/v1/llm/models`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": internalToken(),
      },
      body: JSON.stringify({
        providerId,
        apiKey,
        ...(resolvedBaseUrl ? { baseUrl: resolvedBaseUrl } : {}),
      }),
      signal: ctrl.signal,
      cache: "no-store",
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      throw new FetchModelsError(
        "TIMEOUT",
        providerId,
        `LLM gateway timed out after ${FETCH_TIMEOUT_MS}ms`,
      );
    }
    if (err instanceof FetchModelsError) throw err;
    throw new FetchModelsError(
      "NETWORK_ERROR",
      providerId,
      (err as Error)?.message ?? "fetch failed",
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.ok) {
    const body = (await res.json()) as { models?: string[] };
    if (!Array.isArray(body.models)) {
      throw new FetchModelsError(
        "BAD_RESPONSE",
        providerId,
        "Gateway response missing models[]",
      );
    }
    return body.models;
  }

  // FastAPI puts our structured detail in `body.detail`.
  let detail: unknown;
  try {
    detail = (await res.json())?.detail;
  } catch {
    detail = undefined;
  }
  if (detail && typeof detail === "object") {
    const d = detail as {
      code?: FetchModelsErrorCode;
      message?: string;
      upstreamStatus?: number;
    };
    throw new FetchModelsError(
      d.code ?? "BAD_RESPONSE",
      providerId,
      d.message ?? `Gateway returned HTTP ${res.status}`,
      d.upstreamStatus,
    );
  }
  throw new FetchModelsError(
    "BAD_RESPONSE",
    providerId,
    `Gateway returned HTTP ${res.status}`,
  );
}

export function isCustomProviderId(providerId: string): boolean {
  return providerId === "custom" || providerId.startsWith(CUSTOM_PROVIDER_PREFIX);
}
