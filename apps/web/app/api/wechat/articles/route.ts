import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getWechatArticles } from "@/lib/wechat/queries";
import { parseWechatArticleFilters } from "@/lib/wechat/filters";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = Object.fromEntries(request.nextUrl.searchParams);
  const filters = parseWechatArticleFilters(searchParams);
  const result = await getWechatArticles(filters);

  return NextResponse.json(result);
}
