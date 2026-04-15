import { Pool } from "pg";

const globalForWechat = globalThis as unknown as {
  wechatPool: Pool | undefined;
};

function createPool(): Pool | null {
  const connectionString = process.env.WECHAT_DATABASE_URL;
  if (!connectionString) return null;
  return new Pool({
    connectionString,
    max: 5,
  });
}

export const wechatPool: Pool | null = globalForWechat.wechatPool ?? createPool();

if (process.env.NODE_ENV !== "production" && wechatPool) {
  globalForWechat.wechatPool = wechatPool;
}
