import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ProxyAgent } from "undici";

/**
 * Server-side download proxy for external files.
 * Handles auth, SSRF guards, timeouts, and streaming responses.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const fileUrl = searchParams.get("url");

  if (!fileUrl) {
    return NextResponse.json({ error: "Missing URL parameter" }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(fileUrl);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return NextResponse.json(
        { error: "Only http and https URLs are allowed" },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  const blockedHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);
  if (
    blockedHosts.has(hostname) ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
  }

  try {
    const proxyUrl =
      process.env.HTTPS_PROXY ||
      process.env.HTTP_PROXY ||
      process.env.https_proxy ||
      process.env.http_proxy ||
      "";
    const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    const response = await fetch(fileUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "*/*",
      },
      redirect: "follow",
      signal: controller.signal,
      ...(dispatcher ? { dispatcher } : {}),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to download: HTTP ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    const contentType =
      response.headers.get("content-type") || "application/octet-stream";
    const contentDisposition = response.headers.get("content-disposition");
    const contentLength = response.headers.get("content-length");

    let filename = "";
    if (contentDisposition) {
      const match = contentDisposition.match(
        /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/
      );
      if (match) {
        filename = match[1].replace(/['"]/g, "").trim();
      }
    }

    if (!filename) {
      try {
        const urlPath = new URL(fileUrl).pathname;
        filename = decodeURIComponent(urlPath.split("/").pop() || "download");
      } catch {
        filename = "download";
      }
    }

    filename = filename.replace(/[\\/\r\n"]/g, "_");

    if (!response.body) {
      return NextResponse.json({ error: "No response body" }, { status: 502 });
    }

    return new NextResponse(response.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename=\"${filename}\"`,
        "Cache-Control": "private, max-age=300",
        "X-Filename": filename,
        ...(contentLength ? { "Content-Length": contentLength } : {}),
      },
    });
  } catch (error) {
    console.error("[API Download] Error:", error);
    return NextResponse.json(
      {
        error: "Download failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
