import { NextResponse } from "next/server";

/**
 * Create a JSON response with the given data and status code.
 */
export function jsonResponse<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

/**
 * Create a 201 Created response with the given data.
 */
export function created<T>(data: T): NextResponse {
  return NextResponse.json(data, { status: 201 });
}

/**
 * Create a 401 Unauthorized response.
 */
export function unauthorized(msg = "Unauthorized"): NextResponse {
  return NextResponse.json({ error: msg }, { status: 401 });
}

/**
 * Create a 404 Not Found response.
 */
export function notFound(resource = "Resource"): NextResponse {
  return NextResponse.json({ error: `${resource} not found` }, { status: 404 });
}

/**
 * Create a 400 Bad Request response.
 */
export function badRequest(msg: string): NextResponse {
  return NextResponse.json({ error: msg }, { status: 400 });
}

/**
 * Create a 500 Internal Server Error response.
 */
export function serverError(msg = "Internal server error"): NextResponse {
  return NextResponse.json({ error: msg }, { status: 500 });
}

/**
 * Create a streaming response for AI data streams.
 */
export function streamResponse(stream: ReadableStream): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Vercel-AI-Data-Stream": "v1",
    },
  });
}
