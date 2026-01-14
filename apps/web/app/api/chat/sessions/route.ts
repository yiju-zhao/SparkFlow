import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return new Response("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const notebookId = searchParams.get("notebookId");

    if (!notebookId) {
        return new Response("notebookId is required", { status: 400 });
    }

    try {
        const sessions = await prisma.chatSession.findMany({
            where: {
                notebookId,
                status: { in: ["ACTIVE", "CLOSED"] }, // Or just list all non-archived
            },
            orderBy: { lastActivity: "desc" },
            select: {
                id: true,
                title: true,
                lastActivity: true,
                langgraphThreadId: true,
                ragflowAgentId: true,
                startedAt: true,
                _count: {
                    select: { messages: true },
                },
            },
        });

        return NextResponse.json(sessions);
    } catch (error) {
        console.error("Error fetching chat sessions:", error);
        return new Response("Internal server error", { status: 500 });
    }
}
