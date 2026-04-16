import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getMineruHealth } from "@/lib/services/mineru-task-client";

export default async function MineruAdminPage() {
  const session = await auth();
  const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim());
  if (!session?.user?.email || !adminEmails.includes(session.user.email)) {
    redirect("/access-denied");
  }

  const [health, recentSources] = await Promise.all([
    getMineruHealth(),
    prisma.source.findMany({
      where: { sourceType: "DOCUMENT" },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        title: true,
        status: true,
        errorMessage: true,
        createdAt: true,
        notebookId: true,
      },
    }),
  ]);

  return (
    <div className="max-w-4xl mx-auto py-8 px-6 space-y-8">
      <h1 className="text-2xl font-semibold">MinerU Monitoring</h1>

      <section className="rounded-lg border border-border p-6">
        <h2 className="text-lg font-medium mb-4">Service Status</h2>
        {health ? (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Status</div>
              <div className="font-mono">{health.status}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Version</div>
              <div className="font-mono">{health.version}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Queued</div>
              <div className="font-mono">{health.queued_tasks}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Processing</div>
              <div className="font-mono">{health.processing_tasks}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Completed</div>
              <div className="font-mono">{health.completed_tasks}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Failed</div>
              <div className="font-mono">{health.failed_tasks}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Max Concurrent</div>
              <div className="font-mono">{health.max_concurrent_requests}</div>
            </div>
          </div>
        ) : (
          <div className="text-red-500">MinerU is unreachable</div>
        )}
      </section>

      <section className="rounded-lg border border-border p-6">
        <h2 className="text-lg font-medium mb-4">Recent Document Processing</h2>
        {recentSources.length === 0 ? (
          <div className="text-sm text-muted-foreground">No document sources yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2">Title</th>
                <th className="py-2">Status</th>
                <th className="py-2">Error</th>
                <th className="py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {recentSources.map((s) => (
                <tr key={s.id} className="border-b border-border/50">
                  <td className="py-2 truncate max-w-xs" title={s.title}>
                    {s.title}
                  </td>
                  <td className="py-2 font-mono">{s.status}</td>
                  <td
                    className="py-2 text-red-500 text-xs truncate max-w-xs"
                    title={s.errorMessage ?? ""}
                  >
                    {s.errorMessage ?? "—"}
                  </td>
                  <td className="py-2 text-xs text-muted-foreground">
                    {new Date(s.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
