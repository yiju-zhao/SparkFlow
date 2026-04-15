import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveApiKey } from "@/lib/services/api-key-resolver";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const providerId = req.nextUrl.searchParams.get("provider");
  if (!providerId) {
    return NextResponse.json({ error: "Provider is required" }, { status: 400 });
  }

  try {
    const resolved = await resolveApiKey(session.user.id, providerId);
    return NextResponse.json(resolved);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Key not found" },
      { status: 404 },
    );
  }
}
