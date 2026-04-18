import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

export type JobState = "idle" | "running" | "succeeded" | "failed";

export interface JobStatus {
  state: JobState;
  startedAt: Date | null;
  finishedAt: Date | null;
  exitCode: number | null;
  logFile: string | null;
  mode: "incremental" | "full" | null;
}

// Single in-process job tracker — running more than one backfill at once would
// pound the CPU and hammer both DBs; we serialize instead.
let current: JobStatus = {
  state: "idle",
  startedAt: null,
  finishedAt: null,
  exitCode: null,
  logFile: null,
  mode: null,
};

export function getJobStatus(): JobStatus {
  return { ...current };
}

export function isRunning(): boolean {
  return current.state === "running";
}

const REPO_ROOT = path.resolve(process.cwd(), "../..");
const SCRIPT_PATH = path.join(
  REPO_ROOT,
  "apps/agent/scripts/backfill_wechat_embeddings.py",
);
const LOG_DIR = path.join(REPO_ROOT, "apps/agent/.logs");

export async function startBackfill(mode: "incremental" | "full"): Promise<JobStatus> {
  if (isRunning()) {
    return getJobStatus();
  }

  await mkdir(LOG_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logFile = path.join(LOG_DIR, `wechat-embed-${stamp}.log`);
  const logStream = createWriteStream(logFile, { flags: "a" });

  const python = process.env.PYTHON_BIN || "python3";
  const args = [SCRIPT_PATH];
  if (mode === "full") args.push("--full");

  current = {
    state: "running",
    startedAt: new Date(),
    finishedAt: null,
    exitCode: null,
    logFile,
    mode,
  };

  const child = spawn(python, args, {
    cwd: REPO_ROOT,
    env: { ...process.env },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout?.pipe(logStream);
  child.stderr?.pipe(logStream);

  child.on("close", (code) => {
    current = {
      ...current,
      state: code === 0 ? "succeeded" : "failed",
      finishedAt: new Date(),
      exitCode: code,
    };
    logStream.end();
  });

  child.on("error", () => {
    current = {
      ...current,
      state: "failed",
      finishedAt: new Date(),
      exitCode: -1,
    };
    logStream.end();
  });

  // Unref so the node process can exit even if the child is still running
  // (the child keeps going; we just stop tracking it at process end).
  child.unref();

  return getJobStatus();
}
