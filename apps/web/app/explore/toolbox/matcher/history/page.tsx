import { Metadata } from "next";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = {
  title: "Match History | SparkFlow",
  description: "View your past matching jobs and download results",
};

function getStatusColor(status: string) {
  switch (status) {
    case "PENDING":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
    case "PROCESSING":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    case "COMPLETED":
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    case "FAILED":
      return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
    case "CANCELLED":
      return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

function formatRelativeTime(date: Date) {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  return new Date(date).toLocaleDateString();
}

export default async function MatchHistoryPage() {
  const session = await auth();
  if (!session?.user?.id) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Please sign in to view your history.</p>
      </div>
    );
  }

  const jobs = await prisma.matchJob.findMany({
    where: { userId: session.user.id },
    include: {
      instance: {
        select: {
          name: true,
          venue: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-muted-foreground mb-2 font-mono">
          ~/research-hub/toolbox/query-matcher/history
        </p>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold tracking-tight mb-2">
              Match History
            </h1>
            <p className="text-muted-foreground">
              View your past matching jobs and download results.
            </p>
          </div>
          <Link href="/explore/toolbox/matcher">
            <Button variant="outline">New Match</Button>
          </Link>
        </div>
      </div>

      {jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 border rounded-lg">
          <p className="text-muted-foreground mb-4">No matching jobs yet.</p>
          <Link href="/explore/toolbox/matcher">
            <Button>Create Your First Match</Button>
          </Link>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Instance</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-center">Queries</TableHead>
                <TableHead className="text-center">Matches</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{job.instance.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {job.instance.venue.name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="capitalize">
                      {job.targetType.toLowerCase()}s
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge className={getStatusColor(job.status)} variant="outline">
                      {job.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">{job.queryCount}</TableCell>
                  <TableCell className="text-center">{job.matchCount}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatRelativeTime(job.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    {job.status === "COMPLETED" && (
                      <a
                        href={`/api/matcher/jobs/${job.id}/download`}
                        download
                      >
                        <Button variant="outline" size="sm">
                          Download
                        </Button>
                      </a>
                    )}
                    {job.status === "PROCESSING" && (
                      <span className="text-sm text-muted-foreground">
                        {job.progress}%
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
