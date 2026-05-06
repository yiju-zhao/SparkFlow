import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { FeedbackTable } from "./_components/feedback-table";

export const dynamic = "force-dynamic";

export default async function AdminFeedbackPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (me?.role !== "ADMIN") {
    redirect("/access-denied");
  }

  const items = await prisma.feedback.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      user: { select: { id: true, email: true, username: true } },
    },
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Feedback</h1>
      <FeedbackTable
        items={items.map((item) => ({
          id: item.id,
          type: item.type,
          status: item.status,
          title: item.title,
          message: item.message,
          adminNote: item.adminNote,
          pageUrl: item.pageUrl,
          userAgent: item.userAgent,
          createdAt: item.createdAt.toISOString(),
          user: item.user,
        }))}
      />
    </div>
  );
}
