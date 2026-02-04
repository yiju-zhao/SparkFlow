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
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { Readable } from "stream";

// Configuration from environment
const S3_ENDPOINT = process.env.S3_ENDPOINT || "http://localhost:9002";
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY || "minioadmin";
const S3_SECRET_KEY = process.env.S3_SECRET_KEY || "minioadmin";
const DEFAULT_BUCKET_NAME = process.env.S3_BUCKET_NAME || "sparkflow-images";
const S3_REGION = process.env.S3_REGION || "us-east-1";

/**
 * S3 Storage Client class for consistent API pattern.
 */
class S3StorageClient {
  private client: S3Client;
  private bucketName: string;

  constructor() {
    this.client = new S3Client({
      endpoint: S3_ENDPOINT,
      region: S3_REGION,
      credentials: {
        accessKeyId: S3_ACCESS_KEY,
        secretAccessKey: S3_SECRET_KEY,
      },
      forcePathStyle: true, // Required for MinIO
    });
    this.bucketName = DEFAULT_BUCKET_NAME;
  }

  /**
   * Upload an image to S3/MinIO
   */
  async uploadImage(
    key: string,
    data: Buffer | Uint8Array,
    contentType = "image/png"
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: data,
      ContentType: contentType,
    });

    await this.client.send(command);
    return key;
  }

  /**
   * Get an image from S3/MinIO as a stream
   */
  async getImageStream(
    key: string
  ): Promise<{ stream: Readable; contentType: string | undefined }> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    const response = await this.client.send(command);

    if (!response.Body) {
      throw new Error("No body in S3 response");
    }

    const stream = response.Body as Readable;

    return {
      stream,
      contentType: response.ContentType,
    };
  }

  /**
   * Delete an image from S3/MinIO
   */
  async deleteImage(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    await this.client.send(command);
  }

  /**
   * Delete all images for a source
   */
  async deleteSourceImages(sourceId: string): Promise<number> {
    const prefix = `sources/${sourceId}/images/`;
    let deletedCount = 0;

    const listCommand = new ListObjectsV2Command({
      Bucket: this.bucketName,
      Prefix: prefix,
    });

    const listResponse = await this.client.send(listCommand);

    if (!listResponse.Contents || listResponse.Contents.length === 0) {
      return 0;
    }

    for (const obj of listResponse.Contents) {
      if (obj.Key) {
        await this.deleteImage(obj.Key);
        deletedCount++;
      }
    }

    return deletedCount;
  }

  /**
   * Generate a storage key for a source image
   */
  generateImageKey(sourceId: string, originalName: string): string {
    return `sources/${sourceId}/images/${originalName}`;
  }

  /**
   * Upload multiple images for a source
   */
  async uploadSourceImages(
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
      let base64Data = rawData;
      let contentType = "image/png";

      if (rawData.startsWith("data:")) {
        const match = rawData.match(/^data:([^;]+);base64,(.*)$/);
        if (match) {
          contentType = match[1];
          base64Data = match[2];
        }
      } else {
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

      const buffer = Buffer.from(base64Data, "base64");
      const storageKey = this.generateImageKey(sourceId, imageName);

      await this.uploadImage(storageKey, buffer, contentType);

      results.push({
        originalName: imageName,
        storageKey,
        contentType,
      });
    }

    return results;
  }

  /**
   * Get the underlying S3 client (for advanced usage)
   */
  getClient(): S3Client {
    return this.client;
  }

  /**
   * Get the bucket name
   */
  getBucketName(): string {
    return this.bucketName;
  }
}

// Export singleton instance
export const s3StorageClient = new S3StorageClient();

// Export class for testing
export { S3StorageClient };

// Legacy function exports for backward compatibility
export const uploadImage = s3StorageClient.uploadImage.bind(s3StorageClient);
export const getImageStream = s3StorageClient.getImageStream.bind(s3StorageClient);
export const deleteImage = s3StorageClient.deleteImage.bind(s3StorageClient);
export const deleteSourceImages = s3StorageClient.deleteSourceImages.bind(s3StorageClient);
export const generateImageKey = s3StorageClient.generateImageKey.bind(s3StorageClient);
export const uploadSourceImages = s3StorageClient.uploadSourceImages.bind(s3StorageClient);

// Legacy exports
export const s3Client = s3StorageClient.getClient();
export const S3_BUCKET_NAME = s3StorageClient.getBucketName();
