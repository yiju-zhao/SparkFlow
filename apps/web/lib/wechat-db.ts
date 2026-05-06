import { Pool } from "pg";

const globalForWechat = globalThis as unknown as {
  wechatPool: Pool | undefined;
};

function readIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function createPool(): Pool | null {
  const connectionString = process.env.WECHAT_DATABASE_URL;
  if (!connectionString) return null;
  return new Pool({
    connectionString,
    max: readIntEnv("WECHAT_POOL_MAX", 10),
    idleTimeoutMillis: readIntEnv("WECHAT_POOL_IDLE_MS", 30_000),
    connectionTimeoutMillis: readIntEnv("WECHAT_POOL_CONNECT_MS", 5_000),
    statement_timeout: readIntEnv("WECHAT_STATEMENT_TIMEOUT_MS", 15_000),
  });
}

export const wechatPool: Pool | null = globalForWechat.wechatPool ?? createPool();

if (process.env.NODE_ENV !== "production" && wechatPool) {
  globalForWechat.wechatPool = wechatPool;
}
