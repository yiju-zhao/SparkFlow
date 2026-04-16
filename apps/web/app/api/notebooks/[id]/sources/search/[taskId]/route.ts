import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { searchTasks } from "../route";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { taskId } = await params;
  const task = searchTasks.get(taskId);

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const { ...response } = task;

  // Clean up completed/failed tasks after 5 minutes
  if (task.status === "completed" || task.status === "failed") {
    setTimeout(() => searchTasks.delete(taskId), 5 * 60 * 1000);
  }

  return NextResponse.json(response);
}
