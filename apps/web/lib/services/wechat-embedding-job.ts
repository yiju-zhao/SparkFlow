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

export async function startBackfill(mode: "incremental" | "full"): Promise<JobStatus> {
  if (isRunning()) {
    return getJobStatus();
  }

  // Resolve paths lazily inside the handler (not at module scope) and hint
  // the bundler to skip tracing through `process.cwd()` — otherwise NFT
  // evaluates the dynamic path and pulls the whole monorepo into the bundle.
  const repoRoot = path.resolve(/*turbopackIgnore: true*/ process.cwd(), "../..");
  const scriptPath = path.join(repoRoot, "apps/agent/scripts/backfill_wechat_embeddings.py");
  const logDir = path.join(repoRoot, "apps/agent/.logs");

  await mkdir(logDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logFile = path.join(logDir, `wechat-embed-${stamp}.log`);
  const logStream = createWriteStream(logFile, { flags: "a" });

  const python = process.env.PYTHON_BIN || "python3";
  const args = [scriptPath];
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
    cwd: repoRoot,
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
