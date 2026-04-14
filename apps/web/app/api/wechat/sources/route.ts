import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getWechatSources } from "@/lib/wechat/queries";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sources = await getWechatSources();
  return NextResponse.json(sources);
}
