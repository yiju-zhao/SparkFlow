import { auth } from "@/lib/auth";
import { chatService } from "@/lib/services/chat-service";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return new Response("Unauthorized", { status: 401 });
    }

    try {
        const { content } = await req.json();

        if (!content || typeof content !== "string") {
            return new Response("content is required", { status: 400 });
        }

        const optimized = await chatService.optimizePrompt(content);

        return NextResponse.json({ optimized });
    } catch (error) {
        console.error("Optimize prompt error:", error);
        return new Response("Internal server error", { status: 500 });
    }
}
