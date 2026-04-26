import {
  PROVIDER_MAP,
  NON_CHAT_MODEL_SUBSTRINGS,
  CUSTOM_PROVIDER_PREFIX,
} from "@/lib/types/providers";

const FETCH_TIMEOUT_MS = 10_000;

export type FetchModelsErrorCode =
  | "INVALID_KEY"
  | "INVALID_BASE_URL"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "BAD_RESPONSE"
  | "PROVIDER_UNKNOWN";

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
 * Reject baseUrls that point inside the docker network or back at the
 * server itself. Defends against SSRF via a user-supplied custom
 * endpoint. Called from both the POST /api/settings validation path
 * AND immediately before the fetch in fetchProviderModels (defense in
 * depth — the URL might bypass zod if a built-in provider's baseUrl
 * is later overridden).
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

function sanitizeError(err: unknown, apiKey: string): string {
  const raw = err instanceof Error ? err.message : String(err);
  return apiKey ? raw.replaceAll(apiKey, "***") : raw;
}

export function isChatModel(id: string): boolean {
  const lower = id.toLowerCase();
  return !NON_CHAT_MODEL_SUBSTRINGS.some((s) => lower.includes(s));
}

interface ProviderListResponse {
  data?: Array<{ id?: string }>;
}

/**
 * GET ${baseUrl}${modelsPath} with Bearer auth. Returns the chat-model
 * IDs only. Built-in providers resolve `baseUrl` from PROVIDER_MAP;
 * `custom-*` providers must pass `baseUrl` explicitly.
 *
 * Throws FetchModelsError on any failure — never leaks the apiKey
 * into messages, never returns a partial result.
 */
export async function fetchProviderModels(
  providerId: string,
  apiKey: string,
  baseUrl?: string,
  signal?: AbortSignal,
): Promise<string[]> {
  // Providers without a /v1/models endpoint (e.g. Minimax) get a
  // hardcoded fallback. We still validate the apiKey though — see
  // validateApiKey() below. This branch is purely about returning the
  // model list for the dropdown.
  const cfg = PROVIDER_MAP.get(providerId);
  if (cfg?.noModelsEndpoint && cfg.fallbackModels) {
    return cfg.fallbackModels.filter(isChatModel);
  }

  // Resolve the actual URL. Custom providers MUST supply baseUrl;
  // built-ins fall back to PROVIDER_MAP.
  let resolvedBaseUrl = baseUrl;
  if (!resolvedBaseUrl) {
    const provider = PROVIDER_MAP.get(providerId);
    if (!provider?.baseUrl) {
      throw new FetchModelsError(
        "PROVIDER_UNKNOWN",
        providerId,
        `Unknown provider "${providerId}" or missing baseUrl`,
      );
    }
    resolvedBaseUrl = provider.baseUrl;
  }
  // SSRF guard runs on every fetch, even for built-ins, so a future
  // misconfigured PROVIDERS entry can't accidentally bypass.
  const safe = assertSafeUrl(resolvedBaseUrl, providerId);
  const provider = PROVIDER_MAP.get(providerId);
  const path = provider?.modelsPath ?? "/models";
  // strip trailing slash from base, leading slash from path consistency
  const base = safe.toString().replace(/\/$/, "");
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener("abort", () => ctrl.abort());
  }

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: ctrl.signal,
      cache: "no-store",
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      throw new FetchModelsError(
        "TIMEOUT",
        providerId,
        `Request to ${providerId} /models timed out after ${FETCH_TIMEOUT_MS}ms`,
      );
    }
    throw new FetchModelsError(
      "NETWORK_ERROR",
      providerId,
      sanitizeError(err, apiKey),
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new FetchModelsError(
        "INVALID_KEY",
        providerId,
        `Provider rejected the API key (HTTP ${res.status})`,
        res.status,
      );
    }
    throw new FetchModelsError(
      "BAD_RESPONSE",
      providerId,
      `Provider returned HTTP ${res.status}`,
      res.status,
    );
  }

  let body: ProviderListResponse;
  try {
    body = (await res.json()) as ProviderListResponse;
  } catch (err) {
    throw new FetchModelsError(
      "BAD_RESPONSE",
      providerId,
      sanitizeError(err, apiKey),
    );
  }

  if (!Array.isArray(body.data)) {
    throw new FetchModelsError(
      "BAD_RESPONSE",
      providerId,
      "Response missing data[] array",
    );
  }

  const ids = body.data
    .map((m) => m.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0)
    .filter(isChatModel)
    .sort();

  return ids;
}

/**
 * True when this providerId belongs to a user-defined custom endpoint
 * (id is `custom` literal or `custom-…`). Built-in providers always
 * have an entry in PROVIDER_MAP.
 */
export function isCustomProviderId(providerId: string): boolean {
  return providerId === "custom" || providerId.startsWith(CUSTOM_PROVIDER_PREFIX);
}
