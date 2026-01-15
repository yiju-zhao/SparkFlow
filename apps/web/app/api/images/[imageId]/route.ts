/**
 * Image API Route
 *
 * Serves images stored in S3/MinIO for source documents.
 * GET /api/images/[imageId] - Get an image by its database ID
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getImageStream } from "@/lib/s3-client";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ imageId: string }> }
) {
    try {
        const { imageId } = await params;

        // Find the image record
        const image = await prisma.sourceImage.findUnique({
            where: { id: imageId },
        });

        if (!image) {
            return NextResponse.json({ error: "Image not found" }, { status: 404 });
        }

        // Get the image from S3
        const { stream, contentType } = await getImageStream(image.storageKey);

        // Convert stream to buffer for Response
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
            chunks.push(Buffer.from(chunk));
        }
        const buffer = Buffer.concat(chunks);

        // Return the image
        return new NextResponse(buffer, {
            status: 200,
            headers: {
                "Content-Type": contentType || image.contentType || "image/png",
                "Cache-Control": "public, max-age=31536000, immutable",
            },
        });
    } catch (error) {
        console.error("Error serving image:", error);
        return NextResponse.json(
            { error: "Failed to serve image" },
            { status: 500 }
        );
    }
}
