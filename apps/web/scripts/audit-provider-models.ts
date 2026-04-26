/**
 * audit-provider-models — fetch each LLM provider's `/v1/models`
 * endpoint and print the live model id list. Useful for spot-checking
 * what the production app's settings dropdowns will surface for a
 * given BYOK key, without running the dev server.
 *
 * Run:
 *   cd apps/web
 *   npx tsx scripts/audit-provider-models.ts
 *
 * Reads API keys from environment variables. A provider with no key
 * set is skipped silently.
 *
 *   OPENAI_API_KEY
 *   GEMINI_API_KEY            (or GOOGLE_API_KEY)
 *   DEEPSEEK_API_KEY
 *   GLM_API_KEY               (or ZHIPU_API_KEY)
 *   MINIMAX_API_KEY            (no /v1/models endpoint — script reports skip)
 *   KIMI_API_KEY              (or MOONSHOT_API_KEY)
 *
 * Loads `.env` via dotenv if present so a normal dev `.env` works.
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

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

async function auditProvider(probe: ProviderProbe): Promise<void> {
  console.log(`\n=== ${probe.label} (${probe.id}) ===`);

  if (!probe.apiKey) {
    console.log("  (no API key in environment — skipping)");
    return;
  }

  if (probe.id === "minimax") {
    console.log("  (minimax has no /v1/models endpoint — skipping live probe)");
    return;
  }

  let remoteIds: string[];
  try {
    remoteIds = await fetchRemoteModels(probe);
  } catch (err) {
    console.log(`  ✗ fetch failed: ${(err as Error).message}`);
    return;
  }

  console.log(`  ${remoteIds.length} models from /v1/models:`);
  for (const id of remoteIds) console.log(`    ${id}`);
}

async function main(): Promise<void> {
  console.log("Listing live models per provider (/v1/models)");
  for (const probe of PROVIDERS) {
    await auditProvider(probe);
  }
  console.log("\nDone. Set missing API keys in .env / environment to expand coverage.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
