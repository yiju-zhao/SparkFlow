import prisma from "@/lib/prisma";

/**
 * Get the next message order for a chat session.
 * Returns the next sequential order number based on existing messages.
 */
export async function getNextMessageOrder(sessionId: string): Promise<number> {
  const lastMessage = await prisma.chatMessage.findFirst({
    where: { sessionId },
    orderBy: { messageOrder: "desc" },
    select: { messageOrder: true },
  });
  return (lastMessage?.messageOrder ?? -1) + 1;
}
