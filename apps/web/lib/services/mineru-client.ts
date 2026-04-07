import { readFile } from "fs/promises";

interface MineruResult {
  markdown: string;
  images: { name: string; fullPath?: string; data: Buffer; mimeType: string }[];
}

const MINERU_MODE = process.env.MINERU_MODE || "local";
const MINERU_LOCAL_URL = process.env.MINERU_LOCAL_URL || "http://localhost:8000";
const MINERU_API_TOKEN = process.env.MINERU_API_TOKEN || "";

export async function parsePdf(
  filePathOrUrl: string,
  options?: { modelVersion?: string }
): Promise<MineruResult> {
  if (MINERU_MODE === "api") {
    return parsePdfViaApi(filePathOrUrl, options);
  }
  return parsePdfLocal(filePathOrUrl);
}

async function parsePdfLocal(filePath: string): Promise<MineruResult> {
  const fileBuffer = await readFile(filePath);
  const formData = new FormData();
  formData.append("file", new Blob([fileBuffer]), filePath.split("/").pop()!);
  formData.append("parse_method", "auto");

  const response = await fetch(`${MINERU_LOCAL_URL}/api/v1/extract`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`MinerU local parse failed: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  return extractFromLocalResult(result);
}

function extractFromLocalResult(result: Record<string, unknown>): MineruResult {
  const markdown = (result.markdown as string) || "";
  const images: MineruResult["images"] = [];

  if (result.images && Array.isArray(result.images)) {
    for (const img of result.images) {
      images.push({
        name: img.name || "image.png",
        data: Buffer.from(img.data, "base64"),
        mimeType: img.content_type || "image/png",
      });
    }
  }

  return { markdown, images };
}

async function parsePdfViaApi(
  filePath: string,
  options?: { modelVersion?: string }
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
  const batchRes = await fetch("https://mineru.net/api/v4/file-urls/batch", {
    method: "POST",
    headers,
    body: JSON.stringify({
      files: [{ name: fileName }],
      model_version: modelVersion,
    }),
  });

  if (!batchRes.ok) {
    throw new Error(`MinerU API batch request failed: ${batchRes.status}`);
  }

  const batchData = await batchRes.json();
  if (batchData.code !== 0) {
    throw new Error(`MinerU API batch error: ${batchData.msg}`);
  }

  const batchId = batchData.data.batch_id;
  const uploadUrl = batchData.data.file_urls[0];

  // Step 2: Upload file to presigned URL
  const fileBuffer = await readFile(filePath);
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    body: fileBuffer,
  });

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
  intervalMs = 3000
): Promise<{ full_zip_url: string }> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));

    const res = await fetch(
      `https://mineru.net/api/v4/extract-results/batch/${batchId}`,
      { headers }
    );

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

  throw new Error(`MinerU extraction timed out after ${maxAttempts * intervalMs / 1000}s`);
}

async function downloadAndExtractZip(zipUrl: string): Promise<MineruResult> {
  const { default: JSZip } = await import("jszip");

  const response = await fetch(zipUrl);
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
