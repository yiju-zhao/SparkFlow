import prisma from "@/lib/prisma";

/**
 * Store extracted images in PostgreSQL and rewrite markdown image references.
 * Returns rewritten markdown AND a mapping of all image path aliases to their
 * final /api/images/{id} URL, so callers can reuse the map (e.g., for HTML rewriting).
 */
export async function storeImagesAndRewriteMarkdown(
  sourceId: string,
  markdown: string,
  images: { name: string; fullPath?: string; data: Buffer; mimeType: string }[],
): Promise<{ markdown: string; imagePathToApiUrl: Map<string, string> }> {
  let rewrittenMarkdown = markdown;
  const imagePathToApiUrl = new Map<string, string>();

  for (const image of images) {
    const imageData = new Uint8Array(image.data);
    console.log(
      `[storeImage] Saving "${image.name}" (${image.mimeType}), ${imageData.byteLength} bytes`,
    );

    const savedImage = await prisma.sourceImage.create({
      data: {
        sourceId,
        originalName: image.name,
        mimeType: image.mimeType,
        data: imageData,
      },
    });

    const apiUrl = `/api/images/${savedImage.id}`;

    // Record every known alias for this image so later consumers (HTML builder)
    // can resolve references by any of them.
    imagePathToApiUrl.set(image.name, apiUrl);
    if (image.fullPath) {
      imagePathToApiUrl.set(image.fullPath, apiUrl);
      // Path suffixes too (e.g., "images/hash.jpg" from "prefix/images/hash.jpg")
      const parts = image.fullPath.split("/");
      for (let i = 1; i < parts.length; i++) {
        imagePathToApiUrl.set(parts.slice(i).join("/"), apiUrl);
      }
    }

    // Rewrite markdown
    if (image.fullPath) {
      rewrittenMarkdown = rewrittenMarkdown.replaceAll(image.fullPath, apiUrl);
      const parts = image.fullPath.split("/");
      for (let i = 1; i < parts.length - 1; i++) {
        const suffix = parts.slice(i).join("/");
        if (rewrittenMarkdown.includes(suffix)) {
          rewrittenMarkdown = rewrittenMarkdown.replaceAll(suffix, apiUrl);
          break;
        }
      }
    }

    const escaped = image.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    rewrittenMarkdown = rewrittenMarkdown.replace(
      new RegExp(`(!\\[[^\\]]*\\]\\()[^)]*?${escaped}(\\))`, "g"),
      `$1${apiUrl}$2`,
    );
  }

  return { markdown: rewrittenMarkdown, imagePathToApiUrl };
}
