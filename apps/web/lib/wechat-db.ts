import { Pool } from "pg";

const globalForWechat = globalThis as unknown as {
  wechatPool: Pool | undefined;
};

function createPool() {
  const connectionString = process.env.WECHAT_DATABASE_URL;
  if (!connectionString) {
    throw new Error("WECHAT_DATABASE_URL is not set");
  }
  return new Pool({
    connectionString,
    max: 5,
  });
}

export const wechatPool =
  globalForWechat.wechatPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalForWechat.wechatPool = wechatPool;
}
