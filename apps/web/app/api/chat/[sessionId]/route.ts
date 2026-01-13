import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

interface RouteParams {
    params: Promise<{ sessionId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
    const session = await auth();
    if (!session?.user?.id) {
        return new Response("Unauthorized", { status: 401 });
    }

    const resolvedParams = await params;
    const { sessionId } = resolvedParams;

    if (!sessionId) {
        return new Response("sessionId is required", { status: 400 });
    }

    try {
        // Verify session belongs to user (via notebook -> user)
        // Or just check if user has access to notebook. 
        // Simplified check: Access if session exists and user owns notebook or is shared? 
        // Assuming owner for now.
        const chatSession = await prisma.chatSession.findUnique({
            where: { id: sessionId },
            include: {
                notebook: {
                    select: { userId: true },
                },
            },
        });

        if (!chatSession) {
            return new Response("Session not found", { status: 404 });
        }

        if (chatSession.notebook.userId !== session.user.id) {
            return new Response("Unauthorized", { status: 403 });
        }

        const messages = await prisma.chatMessage.findMany({
            where: { sessionId },
            orderBy: { messageOrder: "asc" },
            select: {
                id: true,
                sender: true,
                content: true,
                createdAt: true,
            },
        });

        // Transform for frontend
        const formattedMessages = messages.map((msg) => ({
            id: msg.id,
            role: msg.sender === "USER" ? "user" : "assistant",
            content: msg.content,
            createdAt: msg.createdAt,
        }));

        return NextResponse.json(formattedMessages);
    } catch (error) {
        console.error("Error fetching chat history:", error);
        return new Response("Internal server error", { status: 500 });
    }
}
