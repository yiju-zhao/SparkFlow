/**
 * audit-provider-models — fetch each LLM provider's `/v1/models` endpoint
 * and compare it against `apps/web/config/models.json`.
 *
 * Run:
 *   cd apps/web
 *   npx tsx scripts/audit-provider-models.ts
 *
 * Reads API keys from environment variables (same names used elsewhere
 * in the repo). A provider with no key set is skipped silently.
 *
 *   OPENAI_API_KEY
 *   GEMINI_API_KEY            (or GOOGLE_API_KEY)
 *   DEEPSEEK_API_KEY
 *   GLM_API_KEY               (or ZHIPU_API_KEY)
 *   MINIMAX_API_KEY
 *   KIMI_API_KEY              (or MOONSHOT_API_KEY)
 *
 * Loads `.env` via dotenv if present so a normal dev `.env` works
 * without re-exporting.
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import modelsConfig from "../config/models.json";

interface ProviderProbe {
  id: string;
  label: string;
  baseUrl: string;
  apiKey: string | undefined;
  /**
   * Path appended to baseUrl for the model list. Defaults to "/models"
   * (OpenAI-compatible). Override per provider when their endpoint
   * differs from the OpenAI shape.
   */
  modelsPath?: string;
}

const PROVIDERS: ProviderProbe[] = [
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    apiKey: process.env.OPENAI_API_KEY,
  },
  {
    id: "gemini",
    label: "Gemini",
    // Google exposes an OpenAI-compatible endpoint with the same /models shape.
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY,
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    apiKey: process.env.DEEPSEEK_API_KEY,
  },
  {
    id: "glm",
    label: "GLM (Zhipu)",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    apiKey: process.env.GLM_API_KEY ?? process.env.ZHIPU_API_KEY,
  },
  {
    id: "minimax",
    label: "Minimax",
    baseUrl: "https://api.minimax.chat/v1",
    apiKey: process.env.MINIMAX_API_KEY,
  },
  {
    id: "kimi",
    label: "Kimi (Moonshot)",
    baseUrl: "https://api.moonshot.cn/v1",
    apiKey: process.env.KIMI_API_KEY ?? process.env.MOONSHOT_API_KEY,
  },
];

interface ProviderModelsConfig {
  label: string;
  models: Array<{ id: string; label: string; desc: string }>;
}

const configProviders = (modelsConfig as { providers: Record<string, ProviderModelsConfig> })
  .providers;

async function fetchRemoteModels(probe: ProviderProbe): Promise<string[]> {
  const url = `${probe.baseUrl}${probe.modelsPath ?? "/models"}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${probe.apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} from ${url}`);
  }
  const body = (await res.json()) as { data?: Array<{ id: string }> };
  if (!Array.isArray(body.data)) {
    throw new Error(`Unexpected response shape from ${url}: missing data[]`);
  }
  return body.data.map((m) => m.id).sort();
}

function diff(a: string[], b: string[]): { onlyA: string[]; onlyB: string[]; both: string[] } {
  const setA = new Set(a);
  const setB = new Set(b);
  return {
    onlyA: a.filter((x) => !setB.has(x)),
    onlyB: b.filter((x) => !setA.has(x)),
    both: a.filter((x) => setB.has(x)),
  };
}

async function auditProvider(probe: ProviderProbe): Promise<void> {
  const local = configProviders[probe.id];
  const localIds = local ? local.models.map((m) => m.id).sort() : [];

  console.log(`\n=== ${probe.label} (${probe.id}) ===`);

  if (!probe.apiKey) {
    console.log("  (no API key in environment — skipping)");
    return;
  }

  let remoteIds: string[];
  try {
    remoteIds = await fetchRemoteModels(probe);
  } catch (err) {
    console.log(`  ✗ fetch failed: ${(err as Error).message}`);
    return;
  }

  const { onlyA: missingFromLocal, onlyB: stalLocal, both } = diff(remoteIds, localIds);
  console.log(`  remote: ${remoteIds.length} models   local: ${localIds.length} models`);

  if (both.length > 0) {
    console.log(`  ✓ in both (${both.length}): ${both.slice(0, 8).join(", ")}${both.length > 8 ? ", ..." : ""}`);
  }
  if (missingFromLocal.length > 0) {
    console.log(`  + only on API (${missingFromLocal.length}, candidates to ADD):`);
    for (const id of missingFromLocal) console.log(`      ${id}`);
  }
  if (stalLocal.length > 0) {
    console.log(`  - only in models.json (${stalLocal.length}, candidates to REMOVE):`);
    for (const id of stalLocal) console.log(`      ${id}`);
  }
}

async function main(): Promise<void> {
  console.log("Auditing apps/web/config/models.json against live provider /v1/models endpoints");
  for (const probe of PROVIDERS) {
    await auditProvider(probe);
  }
  console.log("\nDone. Set missing API keys in .env / environment to expand coverage.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
