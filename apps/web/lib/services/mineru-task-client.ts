/**
 * Low-level wrapper around MinerU 3.0+ async Task API.
 * Endpoints:
 *   POST   /tasks                    → { task_id, status_url, result_url }
 *   GET    /tasks/{id}               → { status: "pending" | "processing" | "completed" | "failed", error? }
 *   GET    /tasks/{id}/result        → ZIP binary
 *   GET    /health                   → { status, version, queued_tasks, ... }
 */

const MINERU_LOCAL_URL = process.env.MINERU_LOCAL_URL || "http://localhost:8000";

export interface MineruTaskSubmitOptions {
  backend?: string;
  parseMethod?: string;
  returnMd?: boolean;
  returnContentList?: boolean;
  returnImages?: boolean;
  responseFormatZip?: boolean;
  formulaEnable?: boolean;
  tableEnable?: boolean;
  langList?: string[];
}

export interface MineruTaskSubmitResponse {
  task_id: string;
  status: string;
  status_url: string;
  result_url: string;
}

export interface MineruTaskStatus {
  task_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface MineruHealth {
  status: string;
  version: string;
  protocol_version: number;
  queued_tasks: number;
  processing_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  max_concurrent_requests: number;
  processing_window_size: number;
  task_retention_seconds: number;
}

export async function submitMineruTask(
  filePath: string,
  options: MineruTaskSubmitOptions = {},
): Promise<MineruTaskSubmitResponse> {
  const { readFile } = await import("fs/promises");
  const buffer = await readFile(filePath);
  const fileName = filePath.split("/").pop()!;

  const form = new FormData();
  form.append("files", new Blob([buffer], { type: "application/pdf" }), fileName);
  form.append("backend", options.backend ?? "hybrid-auto-engine");
  form.append("parse_method", options.parseMethod ?? "auto");
  form.append("return_md", String(options.returnMd ?? true));
  form.append("return_content_list", String(options.returnContentList ?? true));
  form.append("return_images", String(options.returnImages ?? true));
  form.append("response_format_zip", String(options.responseFormatZip ?? true));
  form.append("formula_enable", String(options.formulaEnable ?? true));
  form.append("table_enable", String(options.tableEnable ?? true));
  if (options.langList) {
    for (const lang of options.langList) form.append("lang_list", lang);
  }

  const res = await fetch(`${MINERU_LOCAL_URL}/tasks`, { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`MinerU task submission failed: ${res.status} ${res.statusText} ${body}`);
  }
  return res.json();
}

export async function getMineruTaskStatus(taskId: string): Promise<MineruTaskStatus> {
  const res = await fetch(`${MINERU_LOCAL_URL}/tasks/${taskId}`);
  if (!res.ok) {
    throw new Error(`MinerU status check failed: ${res.status}`);
  }
  return res.json();
}

export async function pollMineruTask(
  taskId: string,
  options: { intervalMs?: number; maxAttempts?: number } = {},
): Promise<void> {
  const interval = options.intervalMs ?? 2000;
  const maxAttempts = options.maxAttempts ?? 300; // 10 min default

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, interval));
    const status = await getMineruTaskStatus(taskId).catch(() => null);
    if (!status) continue;
    if (status.status === "completed") return;
    if (status.status === "failed") {
      throw new Error(`MinerU task failed: ${status.error || "unknown error"}`);
    }
  }
  throw new Error(`MinerU task ${taskId} timed out after ${(maxAttempts * interval) / 1000}s`);
}

export async function downloadMineruResult(taskId: string): Promise<ArrayBuffer> {
  const res = await fetch(`${MINERU_LOCAL_URL}/tasks/${taskId}/result`);
  if (!res.ok) {
    throw new Error(`MinerU result download failed: ${res.status}`);
  }
  return res.arrayBuffer();
}

export async function getMineruHealth(): Promise<MineruHealth | null> {
  try {
    const res = await fetch(`${MINERU_LOCAL_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
