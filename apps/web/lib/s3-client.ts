/**
 * S3/MinIO Client
 *
 * Handles image storage in S3-compatible object storage (MinIO).
 * Used for storing images extracted from PDFs by MinerU.
 */

import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { Readable } from "stream";

// Configuration from environment
const S3_ENDPOINT = process.env.S3_ENDPOINT || "http://localhost:9002";
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY || "minioadmin";
const S3_SECRET_KEY = process.env.S3_SECRET_KEY || "minioadmin";
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || "sparkflow-images";
const S3_REGION = process.env.S3_REGION || "us-east-1";

// Initialize S3 client
const s3Client = new S3Client({
    endpoint: S3_ENDPOINT,
    region: S3_REGION,
    credentials: {
        accessKeyId: S3_ACCESS_KEY,
        secretAccessKey: S3_SECRET_KEY,
    },
    forcePathStyle: true, // Required for MinIO
});

/**
 * Upload an image to S3/MinIO
 *
 * @param key - Storage key (path) for the object
 * @param data - Image data as Buffer or Uint8Array
 * @param contentType - MIME type of the image
 * @returns The storage key
 */
export async function uploadImage(
    key: string,
    data: Buffer | Uint8Array,
    contentType: string = "image/png"
): Promise<string> {
    const command = new PutObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: key,
        Body: data,
        ContentType: contentType,
    });

    await s3Client.send(command);
    return key;
}

/**
 * Get an image from S3/MinIO as a stream
 *
 * @param key - Storage key of the object
 * @returns Object containing the readable stream and content type
 */
export async function getImageStream(
    key: string
): Promise<{ stream: Readable; contentType: string | undefined }> {
    const command = new GetObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: key,
    });

    const response = await s3Client.send(command);

    if (!response.Body) {
        throw new Error("No body in S3 response");
    }

    // Convert to Node.js Readable stream
    const stream = response.Body as Readable;

    return {
        stream,
        contentType: response.ContentType,
    };
}

/**
 * Delete an image from S3/MinIO
 *
 * @param key - Storage key of the object to delete
 */
export async function deleteImage(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: key,
    });

    await s3Client.send(command);
}

/**
 * Generate a storage key for a source image
 *
 * @param sourceId - ID of the source document
 * @param originalName - Original filename from MinerU
 * @returns A unique storage key
 */
export function generateImageKey(
    sourceId: string,
    originalName: string
): string {
    // Format: sources/{sourceId}/images/{originalName}
    return `sources/${sourceId}/images/${originalName}`;
}

/**
 * Upload multiple images for a source
 *
 * @param sourceId - ID of the source document
 * @param images - Record of image names to base64 data (may include data URI prefix)
 * @returns Array of uploaded image info
 */
export async function uploadSourceImages(
    sourceId: string,
    images: Record<string, string>
): Promise<
    Array<{ originalName: string; storageKey: string; contentType: string }>
> {
    const results: Array<{
        originalName: string;
        storageKey: string;
        contentType: string;
    }> = [];

    for (const [imageName, rawData] of Object.entries(images)) {
        // Handle data URI format: "data:image/jpeg;base64,/9j/4AAQ..."
        let base64Data = rawData;
        let contentType = "image/png";

        if (rawData.startsWith("data:")) {
            const match = rawData.match(/^data:([^;]+);base64,(.*)$/);
            if (match) {
                contentType = match[1]; // e.g., "image/jpeg"
                base64Data = match[2];  // pure base64 without prefix
            }
        } else {
            // Fallback: detect content type from image name
            const ext = imageName.split(".").pop()?.toLowerCase() || "png";
            contentType =
                ext === "jpg" || ext === "jpeg"
                    ? "image/jpeg"
                    : ext === "gif"
                        ? "image/gif"
                        : ext === "webp"
                            ? "image/webp"
                            : "image/png";
        }

        // Convert base64 to Buffer
        const buffer = Buffer.from(base64Data, "base64");

        // Generate storage key
        const storageKey = generateImageKey(sourceId, imageName);

        // Upload to S3
        await uploadImage(storageKey, buffer, contentType);

        results.push({
            originalName: imageName,
            storageKey,
            contentType,
        });
    }

    return results;
}

export { s3Client, S3_BUCKET_NAME };
