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

function resolveBackfillPaths(): { scriptPath: string; logDir: string; cwd: string } {
  const scriptEnv = process.env.WECHAT_BACKFILL_SCRIPT;
  const logDirEnv = process.env.WECHAT_BACKFILL_LOG_DIR;
  const cwdEnv = process.env.WECHAT_BACKFILL_CWD;
  if (scriptEnv && logDirEnv && cwdEnv) {
    return { scriptPath: scriptEnv, logDir: logDirEnv, cwd: cwdEnv };
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "wechat-embedding-job: WECHAT_BACKFILL_SCRIPT, WECHAT_BACKFILL_LOG_DIR, " +
        "and WECHAT_BACKFILL_CWD must all be set in production.",
    );
  }
  // Dev fallback — walk up from apps/web to the monorepo root. The parent
  // segment is constructed at runtime so Next.js file tracing cannot follow
  // it out of the app (otherwise it pulls the whole monorepo into the bundle).
  const up = String.fromCharCode(46, 46);
  const repoRoot = path.resolve(process.cwd(), up, up);
  return {
    scriptPath:
      scriptEnv ?? path.join(repoRoot, "apps/langgraph/scripts/backfill_wechat_embeddings.py"),
    logDir: logDirEnv ?? path.join(repoRoot, "apps/langgraph/.logs"),
    cwd: cwdEnv ?? repoRoot,
  };
}

export async function startBackfill(mode: "incremental" | "full"): Promise<JobStatus> {
  if (isRunning()) {
    return getJobStatus();
  }

  const { scriptPath, logDir, cwd } = resolveBackfillPaths();

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
    cwd,
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
