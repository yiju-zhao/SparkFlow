import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getMineruHealth } from "@/lib/services/mineru-task-client";

export async function GET() {
  const session = await auth();
  const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim());
  if (!session?.user?.email || !adminEmails.includes(session.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const health = await getMineruHealth();
  if (!health) {
    return NextResponse.json({ healthy: false, error: "MinerU unreachable" }, { status: 503 });
  }

  return NextResponse.json({ healthy: true, ...health });
}
