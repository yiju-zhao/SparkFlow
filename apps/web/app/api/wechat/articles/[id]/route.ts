import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getWechatArticle } from "@/lib/wechat/queries";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const articleId = parseInt(id, 10);
  if (isNaN(articleId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const article = await getWechatArticle(articleId);
  if (!article) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  return NextResponse.json(article);
}
