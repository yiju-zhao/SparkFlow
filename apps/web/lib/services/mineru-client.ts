import { readFile } from "fs/promises";

interface MineruResult {
  markdown: string;
  images: { name: string; fullPath?: string; data: Buffer; mimeType: string }[];
}

const MINERU_MODE = process.env.MINERU_MODE || "local";
const MINERU_LOCAL_URL = process.env.MINERU_LOCAL_URL || "http://localhost:8000";
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
  const fileBuffer = await readFile(filePath);
  const fileName = filePath.split("/").pop()!;
  const formData = new FormData();
  formData.append("files", new Blob([fileBuffer], { type: "application/pdf" }), fileName);
  formData.append("parse_method", "auto");
  formData.append("return_md", "true");
  formData.append("return_images", "true");

  // Local MinerU /file_parse is synchronous — PDF parsing can take minutes.
  // Use a 10-minute timeout and no retries (retrying a long parse is wasteful).
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000);

  let response: Response;
  try {
    response = await fetch(`${MINERU_LOCAL_URL}/file_parse`, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(
        "MinerU local parse timed out after 10 minutes — the PDF may be too large or the server too slow",
      );
    }
    throw new Error(describeFetchError(err, "MinerU local connection failed"));
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(
      `MinerU local parse failed: ${response.status} ${response.statusText} ${errorBody}`,
    );
  }

  const result = await response.json();
  return extractFromLocalResult(result);
}

function extractFromLocalResult(result: Record<string, unknown>): MineruResult {
  // MinerU /file_parse response format:
  // { "backend": "pipeline", "version": "2.6.8", "results": { "filename": { "md_content": "..." } } }
  let markdown = "";
  const images: MineruResult["images"] = [];

  // Try new format first: results.{filename}.md_content
  const results = result.results as Record<string, Record<string, unknown>> | undefined;
  if (results) {
    const firstKey = Object.keys(results)[0];
    if (firstKey) {
      const fileResult = results[firstKey];
      markdown = (fileResult.md_content as string) || "";

      // Extract images if returned
      if (fileResult.images && Array.isArray(fileResult.images)) {
        for (const img of fileResult.images as any[]) {
          if (img.data) {
            // Handle multiple possible data formats from MinerU
            let buf: Buffer;
            if (typeof img.data === "string") {
              buf = Buffer.from(img.data, "base64");
            } else if (Buffer.isBuffer(img.data)) {
              buf = img.data;
            } else if (Array.isArray(img.data)) {
              buf = Buffer.from(img.data);
            } else if (img.data?.type === "Buffer" && Array.isArray(img.data.data)) {
              buf = Buffer.from(img.data.data);
            } else {
              buf = Buffer.from(img.data);
            }
            images.push({
              name: img.name || "image.png",
              data: buf,
              mimeType: img.content_type || "image/png",
            });
          }
        }
      } else {
        console.warn(
          `[MinerU] No images returned from local parse. Keys in result: ${Object.keys(fileResult).join(", ")}`,
        );
      }
    }
  }

  // Fallback: old format with top-level markdown field
  if (!markdown) {
    markdown = (result.markdown as string) || (result.md_content as string) || "";
  }

  if (!markdown) {
    throw new Error(
      `MinerU returned empty markdown. Response keys: ${Object.keys(result).join(", ")}`,
    );
  }

  return { markdown, images };
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

async function downloadAndExtractZip(zipUrl: string): Promise<MineruResult> {
  const { default: JSZip } = await import("jszip");

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
  const zip = await JSZip.loadAsync(arrayBuffer);

  let markdown = "";
  const images: MineruResult["images"] = [];

  for (const [path, file] of Object.entries(zip.files)) {
    if (file.dir) continue;

    if (path.endsWith(".md") && path.includes("full")) {
      markdown = await file.async("string");
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

  return { markdown, images };
}
