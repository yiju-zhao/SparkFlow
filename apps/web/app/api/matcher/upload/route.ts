/**
 * Matcher Upload API Route
 *
 * Handles Excel file uploads for query matching.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { s3StorageClient } from "@/lib/s3-client";
import { randomUUID } from "crypto";

const ALLOWED_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Please upload an Excel file (.xlsx, .xls)" },
        { status: 400 },
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 10MB" },
        { status: 400 },
      );
    }

    // Generate storage key
    const userId = session.user.id;
    const fileKey = `matcher-queries/${userId}/${randomUUID()}-${file.name}`;

    // Upload to S3
    const buffer = Buffer.from(await file.arrayBuffer());
    await s3StorageClient.upload(
      fileKey,
      buffer,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    return NextResponse.json({
      fileKey,
      fileName: file.name,
      fileSize: file.size,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 },
    );
  }
}
