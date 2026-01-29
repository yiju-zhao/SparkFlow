import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";
import type { Notebook } from "@prisma/client";

type AuthResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

type NotebookAuthResult =
  | { ok: true; userId: string; notebook: Notebook }
  | { ok: false; response: NextResponse };

/**
 * Require authentication and return the user ID.
 * Returns a 401 Unauthorized response if not authenticated.
 */
export async function requireAuth(): Promise<AuthResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { ok: true, userId: session.user.id };
}

/**
 * Require authentication and notebook ownership.
 * Returns the notebook if the user owns it, otherwise a 401 or 404 response.
 */
export async function requireNotebookOwner(
  notebookId: string
): Promise<NotebookAuthResult> {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult;

  const notebook = await prisma.notebook.findFirst({
    where: { id: notebookId, userId: authResult.userId },
  });

  if (!notebook) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Notebook not found" },
        { status: 404 }
      ),
    };
  }

  return { ok: true, userId: authResult.userId, notebook };
}
