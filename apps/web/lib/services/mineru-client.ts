import { readFile } from "fs/promises";

export interface ContentListItem {
  type: string;
  content?: any;
  bbox?: number[];
  // For legacy content_list.json format
  text?: string;
  text_level?: number;
  img_path?: string;
  image_caption?: string[];
  table_body?: string;
  table_caption?: string[];
  table_footnote?: string[];
  sub_type?: string;
  [key: string]: any;
}

export interface MineruResult {
  markdown: string;
  images: { name: string; fullPath?: string; data: Buffer; mimeType: string }[];
  contentList?: ContentListItem[];
}

const MINERU_MODE = process.env.MINERU_MODE || "local";
const MINERU_API_TOKEN = process.env.MINERU_API_TOKEN || "";

/** Extract a human-readable message from fetch errors (which bury the cause). */
function describeFetchError(error: unknown, context: string): string {
  if (!(error instanceof Error)) return `${context}: ${String(error)}`;
  const cause = (error as Error & { cause?: Error }).cause;
  const detail = cause ? `${cause.message || cause}` : error.message;
  return `${context}: ${detail}`;
}

/** Retry a fetch call up to `retries` times on network errors. */
async function fetchWithRetry(
  input: string | URL | Request,
  init?: RequestInit,
  retries = 2,
): Promise<Response> {
  let lastError: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fetch(input, init);
    } catch (err) {
      lastError = err;
      if (i < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
      }
    }
  }
  throw lastError;
}

export async function parsePdf(
  filePathOrUrl: string,
  options?: { modelVersion?: string },
): Promise<MineruResult> {
  if (MINERU_MODE === "api") {
    return parsePdfViaApi(filePathOrUrl, options);
  }
  return parsePdfLocal(filePathOrUrl);
}

async function parsePdfLocal(filePath: string): Promise<MineruResult> {
  const { submitMineruTask, pollMineruTask, downloadMineruResult } =
    await import("./mineru-task-client");

  const { task_id } = await submitMineruTask(filePath, {
    backend: "hybrid-auto-engine",
    returnMd: true,
    returnContentList: true,
    returnImages: true,
    responseFormatZip: true,
    formulaEnable: true,
    tableEnable: true,
  });

  await pollMineruTask(task_id, { intervalMs: 2000, maxAttempts: 300 });

  const zipBuffer = await downloadMineruResult(task_id);
  return extractFromZipBuffer(zipBuffer);
}

async function parsePdfViaApi(
  filePath: string,
  options?: { modelVersion?: string },
): Promise<MineruResult> {
  if (!MINERU_API_TOKEN) {
    throw new Error("MINERU_API_TOKEN is required when MINERU_MODE=api");
  }

  const modelVersion = options?.modelVersion || "vlm";
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${MINERU_API_TOKEN}`,
  };

  const fileName = filePath.split("/").pop()!;

  // Step 1: Request presigned upload URL via batch API
  let batchRes: Response;
  try {
    batchRes = await fetchWithRetry("https://mineru.net/api/v4/file-urls/batch", {
      method: "POST",
      headers,
      body: JSON.stringify({
        files: [{ name: fileName }],
        model_version: modelVersion,
      }),
    });
  } catch (err) {
    throw new Error(describeFetchError(err, "MinerU API batch request network error"));
  }

  if (!batchRes.ok) {
    throw new Error(`MinerU API batch request failed: ${batchRes.status}`);
  }

  const batchData = await batchRes.json();
  if (batchData.code !== 0) {
    throw new Error(`MinerU API batch error: ${batchData.msg}`);
  }

  const batchId = batchData.data.batch_id;
  const uploadUrl = batchData.data.file_urls[0];

  // Step 2: Upload file to presigned URL (Alibaba Cloud OSS)
  const fileBuffer = await readFile(filePath);
  let uploadRes: Response;
  try {
    uploadRes = await fetchWithRetry(uploadUrl, {
      method: "PUT",
      body: fileBuffer,
    });
  } catch (err) {
    throw new Error(describeFetchError(err, "MinerU file upload to OSS failed"));
  }

  if (!uploadRes.ok) {
    throw new Error(`MinerU file upload failed: ${uploadRes.status}`);
  }

  // Step 3: Poll for batch results
  const result = await pollMineruBatch(batchId, headers);
  return downloadAndExtractZip(result.full_zip_url);
}

async function pollMineruBatch(
  batchId: string,
  headers: Record<string, string>,
  maxAttempts = 120,
  intervalMs = 3000,
): Promise<{ full_zip_url: string }> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));

    let res: Response;
    try {
      res = await fetchWithRetry(
        `https://mineru.net/api/v4/extract-results/batch/${batchId}`,
        { headers },
        1,
      );
    } catch {
      continue; // transient network error during polling, retry on next iteration
    }

    if (!res.ok) continue;

    const data = await res.json();
    const results = data.data?.extract_result;

    if (!results || results.length === 0) continue;

    const result = results[0];

    if (result.state === "done") {
      return { full_zip_url: result.full_zip_url };
    }
    if (result.state === "failed") {
      throw new Error(`MinerU extraction failed: ${result.err_msg || "unknown error"}`);
    }
    // "waiting-file", "pending", "running", "converting" — keep polling
  }

  throw new Error(`MinerU extraction timed out after ${(maxAttempts * intervalMs) / 1000}s`);
}

/** Parse a zip buffer containing MinerU output (markdown + images). */
export async function extractFromZipBuffer(buffer: ArrayBuffer): Promise<MineruResult> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(buffer);

  let markdown = "";
  let contentList: ContentListItem[] | undefined;
  const images: MineruResult["images"] = [];

  for (const [path, file] of Object.entries(zip.files)) {
    if (file.dir) continue;

    if (path.endsWith(".md")) {
      const content = await file.async("string");
      // Prefer files with "full" in the name (MinerU API convention).
      // For local-mode zips there's usually only one .md file.
      if (!markdown || path.includes("full")) {
        markdown = content;
      }
    } else if (path.endsWith("_content_list_v2.json") || path.endsWith("_content_list.json")) {
      // Prefer v2 (3.0+) — overwrites legacy if both present
      const json = await file.async("string");
      try {
        const parsed = JSON.parse(json);
        // v2 is page-grouped: [[items], [items], ...] — flatten
        // legacy is flat: [items...]
        if (Array.isArray(parsed) && parsed.length > 0 && Array.isArray(parsed[0])) {
          contentList = parsed.flat() as ContentListItem[];
        } else {
          contentList = parsed as ContentListItem[];
        }
      } catch (err) {
        console.warn(`[MinerU] Failed to parse ${path}:`, err);
      }
    } else if (/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(path)) {
      const data = await file.async("nodebuffer");
      const ext = path.split(".").pop()!.toLowerCase();
      const mimeMap: Record<string, string> = {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        gif: "image/gif",
        webp: "image/webp",
        svg: "image/svg+xml",
      };
      // Store both the full path and filename — markdown may reference either
      const fullPath = path;
      const fileName = path.split("/").pop()!;
      images.push({
        name: fileName,
        fullPath,
        data: Buffer.from(data),
        mimeType: mimeMap[ext] || "image/png",
      });
    }
  }

  if (!markdown) {
    throw new Error(
      `MinerU zip contained no markdown file. Entries: ${Object.keys(zip.files).join(", ")}`,
    );
  }

  return { markdown, images, contentList };
}

async function downloadAndExtractZip(zipUrl: string): Promise<MineruResult> {
  let response: Response;
  try {
    response = await fetchWithRetry(zipUrl);
  } catch (err) {
    throw new Error(describeFetchError(err, "Failed to download MinerU result zip"));
  }
  if (!response.ok) {
    throw new Error(`Failed to download MinerU result zip: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return extractFromZipBuffer(arrayBuffer);
}

// Alias — MinerU handles PDF/DOCX/PPT uniformly
export const parseDocumentViaMineru = parsePdf;
