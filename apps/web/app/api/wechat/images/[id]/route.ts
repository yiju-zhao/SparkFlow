import { NextRequest, NextResponse } from "next/server";
import { getWechatImage } from "@/lib/wechat/queries";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const imageId = parseInt(id, 10);
  if (isNaN(imageId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const image = await getWechatImage(imageId);
  if (!image) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.mime_type,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
