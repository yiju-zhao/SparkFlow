/**
 * Thin client around POST /v1/workflows/llm/list-models.
 *
 * apps/web (Node) cannot reach LLM providers directly from the corporate
 * network — outbound TLS to api.openai.com / api.deepseek.com / etc. is
 * intercepted or blocked. The Python workflows-API has working httpx +
 * CA trust, so all BYOK validation calls are proxied through there.
 *
 * Replaces the old graph-service-style OpenAI-SDK passthrough through
 * the deleted /v1/llm/models gateway.
 */

import { PROVIDER_MAP, CUSTOM_PROVIDER_PREFIX } from "@/lib/types/providers";

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

function workflowsBase(): string {
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
      "INTERNAL_CALLBACK_TOKEN is not set; the Node side cannot authenticate to the workflows API",
    );
  }
  return t;
}

/**
 * Lightweight SSRF check on the user-supplied custom baseUrl. Gives the
 * user fast feedback when they typo a localhost URL into the settings form.
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

export async function fetchProviderModels(
  providerId: string,
  apiKey: string,
  baseUrl?: string,
  signal?: AbortSignal,
): Promise<string[]> {
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
  } else {
    assertSafeUrl(resolvedBaseUrl, providerId);
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener("abort", () => ctrl.abort());
  }

  let res: Response;
  try {
    res = await fetch(`${workflowsBase()}/v1/workflows/llm/list-models`, {
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
        `workflows API timed out after ${FETCH_TIMEOUT_MS}ms`,
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
        "Workflows API response missing models[]",
      );
    }
    return body.models;
  }

  // FastAPI returns the structured detail in `body.detail`. The new
  // /v1/workflows/llm/list-models route returns plain HTTPException
  // detail strings ("Upstream openai: ...") on 4xx and "Upstream error: ..."
  // on 502 — both surface here as the message.
  let detail: unknown;
  try {
    detail = (await res.json())?.detail;
  } catch {
    detail = undefined;
  }
  const code: FetchModelsErrorCode =
    res.status === 401 || res.status === 403 ? "INVALID_KEY"
    : res.status === 502 || res.status === 503 || res.status === 504 ? "NETWORK_ERROR"
    : "BAD_RESPONSE";
  const message =
    typeof detail === "string"
      ? detail
      : `Workflows API returned HTTP ${res.status}`;
  throw new FetchModelsError(code, providerId, message, res.status);
}

export function isCustomProviderId(providerId: string): boolean {
  return providerId === "custom" || providerId.startsWith(CUSTOM_PROVIDER_PREFIX);
}
