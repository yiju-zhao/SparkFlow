import { readFile } from "fs/promises";

interface MineruResult {
  markdown: string;
  images: { name: string; data: Buffer; mimeType: string }[];
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
  fileUrl: string,
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

  const submitRes = await fetch("https://mineru.net/api/v4/extract/task", {
    method: "POST",
    headers,
    body: JSON.stringify({ url: fileUrl, model_version: modelVersion }),
  });

  if (!submitRes.ok) {
    throw new Error(`MinerU API submit failed: ${submitRes.status}`);
  }

  const submitData = await submitRes.json();
  if (submitData.code !== 0) {
    throw new Error(`MinerU API submit error: ${submitData.msg}`);
  }

  const taskId = submitData.data.task_id;
  const result = await pollMineruTask(taskId, headers);
  return downloadAndExtractZip(result.full_zip_url);
}

async function pollMineruTask(
  taskId: string,
  headers: Record<string, string>,
  maxAttempts = 120,
  intervalMs = 3000
): Promise<{ full_zip_url: string }> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));

    const res = await fetch(`https://mineru.net/api/v4/extract/task/${taskId}`, {
      headers,
    });

    if (!res.ok) continue;

    const data = await res.json();
    const state = data.data?.state;

    if (state === "done") {
      return { full_zip_url: data.data.full_zip_url };
    }
    if (state === "failed") {
      throw new Error(`MinerU extraction failed: ${data.data.err_msg || "unknown error"}`);
    }
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
      images.push({
        name: path.split("/").pop()!,
        data: Buffer.from(data),
        mimeType: mimeMap[ext] || "image/png",
      });
    }
  }

  return { markdown, images };
}
