# SparkFlow Usage Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a first-run tour + persistent Guides drawer that covers all 10 key SparkFlow features, zero new top-level deps, backed by a spotlight primitive reused across both.

**Architecture:** Client-side `<GuideProvider>` in the `[locale]` layout owns state (tour progress, dismissed guides). A hand-rolled `<Spotlight>` (4 masking divs + Radix Popover + Framer Motion) is used by both the first-run tour and the drawer's "Play" mode. Content is authored as typed `.ts` modules; text goes through the existing next-intl pipeline. State persists on `User` (two additive columns) with localStorage fallback for unauthenticated visitors.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind 4, Prisma 7 (PostgreSQL), next-intl, Radix UI (Dialog, Popover), Framer Motion, lucide-react. No new top-level deps.

**Verification convention:** This project has no test framework. Each task verifies with `npx tsc --noEmit`, `npm run lint`, and where UI-facing, a manual dev-server check (`npm run dev` → open http://localhost:3001). Commits go one-per-task.

**Reference spec:** `docs/superpowers/specs/2026-04-24-sparkflow-usage-guide-design.md` — keep open while implementing.

**Working directory for all commands:** `apps/web/` unless stated otherwise.

---

## Phase 1 — Foundation (Tasks 1–4)

### Task 1: Add `tourCompletedAt` and `dismissedGuides` to `User`

**Files:**
- Modify: `apps/web/prisma/schema.prisma`
- Create: `apps/web/prisma/migrations/<timestamp>_add_user_tour_state/migration.sql` (generated)

- [ ] **Step 1: Edit schema**

Open `apps/web/prisma/schema.prisma` and add the two fields to the `User` model (after `updatedAt DateTime @updatedAt`):

```prisma
model User {
  id           String   @id @default(cuid())
  username     String   @unique
  email        String   @unique
  passwordHash String
  role         UserRole @default(USER)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  tourCompletedAt DateTime?
  dismissedGuides String[]  @default([])

  // Relations
  notebooks Notebook[]
  notes     Note[]
  sessions  Session[]
  settings  UserSettings?

  @@map("users")
}
```

- [ ] **Step 2: Generate migration**

From `apps/web/`:

```bash
npx prisma migrate dev --name add_user_tour_state
```

Expected: a new folder under `prisma/migrations/` with a `migration.sql` that contains `ALTER TABLE "users" ADD COLUMN "tourCompletedAt" TIMESTAMP(3);` and `ADD COLUMN "dismissedGuides" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];` — both additive only.

- [ ] **Step 3: Inspect generated SQL**

Open the generated `migration.sql`. Confirm:
- Only `ADD COLUMN` statements, no `DROP` / no `ALTER COLUMN ... TYPE`.
- Both columns are additive-safe for the zero-downtime rule (see `apps/web/CLAUDE.md`).

If anything else appears, stop and ask — do not proceed.

- [ ] **Step 4: Verify client is regenerated**

```bash
npx prisma generate
```

Expected: no errors. `User` type in `@prisma/client` now includes `tourCompletedAt: Date | null` and `dismissedGuides: string[]`.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: PASS (no type errors introduced).

- [ ] **Step 6: Commit**

```bash
git add apps/web/prisma/schema.prisma apps/web/prisma/migrations/
git commit -m "$(cat <<'EOF'
feat(web): add User.tourCompletedAt and dismissedGuides for usage guide state

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Guide types module

**Files:**
- Create: `apps/web/content/guides/types.ts`

- [ ] **Step 1: Write types**

Create `apps/web/content/guides/types.ts` with:

```ts
export type GuideCategory = "deepdive" | "explore" | "account";

export type GuideStepPlacement = "top" | "bottom" | "left" | "right";

export type GuideStepAction = "click" | "hover" | "none";

export interface GuideStep {
  /** CSS selector for the anchor element, e.g. '[data-guide="new-notebook-button"]'. */
  selector: string;
  placement: GuideStepPlacement;
  /** next-intl key under the `guides.*` namespace. */
  titleKey: string;
  /** next-intl key under the `guides.*` namespace. */
  bodyKey: string;
  action?: GuideStepAction;
  /** Optional route to push before showing this step, e.g. '/deepdive'. */
  route?: string;
}

export interface GuideDefinition {
  /** Stable, forever-unchanging ID. Used in dismissedGuides[]. */
  id: string;
  category: GuideCategory;
  /** lucide icon name (PascalCase). */
  icon: string;
  titleKey: string;
  summaryKey: string;
  /** Show even without login (on landing page). Default false. */
  publicOnLanding?: boolean;
  /** Include in the first-run 4-step tour. Default false. */
  includeInFirstRunTour?: boolean;
  /** 1-indexed order within the first-run tour. Required if includeInFirstRunTour. */
  firstRunTourOrder?: number;
  steps: GuideStep[];
}

export interface GuideState {
  tourCompletedAt: string | null;
  dismissedGuides: string[];
}

export interface TourProgress {
  stepIndex: number;
  /** Pathname where tour was suspended. */
  path: string;
  startedAt: string;
}

export const TOUR_PROGRESS_STORAGE_KEY = "sparkflow.tour.progress";
export const GUIDE_STATE_STORAGE_KEY = "sparkflow.guides.state";
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/content/guides/types.ts
git commit -m "$(cat <<'EOF'
feat(web): add guide content type definitions

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `/api/guides/state` route (GET + PATCH)

**Files:**
- Create: `apps/web/app/api/guides/state/route.ts`

- [ ] **Step 1: Write route**

Create `apps/web/app/api/guides/state/route.ts`:

```ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { GuideState } from "@/content/guides/types";

export async function GET(): Promise<NextResponse<GuideState | { error: string }>> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { tourCompletedAt: true, dismissedGuides: true },
  });

  if (!user) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  return NextResponse.json({
    tourCompletedAt: user.tourCompletedAt ? user.tourCompletedAt.toISOString() : null,
    dismissedGuides: user.dismissedGuides,
  });
}

interface PatchBody {
  markTourCompleted?: boolean;
  dismissGuideId?: string;
  undismissGuideId?: string;
  resetTour?: boolean;
}

export async function PATCH(request: Request): Promise<NextResponse<GuideState | { error: string }>> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as PatchBody;

  const current = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, tourCompletedAt: true, dismissedGuides: true },
  });
  if (!current) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  const nextDismissed = new Set(current.dismissedGuides);
  if (body.dismissGuideId) nextDismissed.add(body.dismissGuideId);
  if (body.undismissGuideId) nextDismissed.delete(body.undismissGuideId);

  const updated = await prisma.user.update({
    where: { id: current.id },
    data: {
      tourCompletedAt: body.resetTour
        ? null
        : body.markTourCompleted
          ? new Date()
          : current.tourCompletedAt,
      dismissedGuides: Array.from(nextDismissed),
    },
    select: { tourCompletedAt: true, dismissedGuides: true },
  });

  return NextResponse.json({
    tourCompletedAt: updated.tourCompletedAt ? updated.tourCompletedAt.toISOString() : null,
    dismissedGuides: updated.dismissedGuides,
  });
}
```

- [ ] **Step 2: Type-check + lint**

```bash
npx tsc --noEmit && npm run lint
```

Expected: PASS.

- [ ] **Step 3: Manual smoke test**

```bash
npm run dev
```

Then from another shell:

```bash
curl -i http://localhost:3001/api/guides/state
```

Expected: `401 Unauthorized` (anonymous). Log in through the UI, then retry with browser DevTools → Network: should return `{ "tourCompletedAt": null, "dismissedGuides": [] }` for a new user.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/guides/state/route.ts
git commit -m "$(cat <<'EOF'
feat(web): add /api/guides/state GET + PATCH endpoint

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `GuideProvider` context + `useGuides` hook

**Files:**
- Create: `apps/web/components/guides/guide-provider.tsx`

- [ ] **Step 1: Write provider**

Create `apps/web/components/guides/guide-provider.tsx`:

```tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { GuideState } from "@/content/guides/types";
import { GUIDE_STATE_STORAGE_KEY } from "@/content/guides/types";

interface GuideContextValue extends GuideState {
  isAuthenticated: boolean;
  loading: boolean;
  drawerOpen: boolean;
  activeGuideId: string | null;
  setDrawerOpen: (open: boolean) => void;
  openGuide: (id: string) => void;
  closeGuide: () => void;
  dismissGuide: (id: string) => Promise<void>;
  undismissGuide: (id: string) => Promise<void>;
  markTourCompleted: () => Promise<void>;
  resetTour: () => Promise<void>;
}

const EMPTY_STATE: GuideState = { tourCompletedAt: null, dismissedGuides: [] };

const GuideContext = createContext<GuideContextValue | null>(null);

function readLocalState(): GuideState {
  if (typeof window === "undefined") return EMPTY_STATE;
  try {
    const raw = window.localStorage.getItem(GUIDE_STATE_STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as Partial<GuideState>;
    return {
      tourCompletedAt: parsed.tourCompletedAt ?? null,
      dismissedGuides: Array.isArray(parsed.dismissedGuides) ? parsed.dismissedGuides : [],
    };
  } catch {
    return EMPTY_STATE;
  }
}

function writeLocalState(state: GuideState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GUIDE_STATE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function GuideProvider({
  children,
  isAuthenticated,
}: {
  children: ReactNode;
  isAuthenticated: boolean;
}) {
  const [state, setState] = useState<GuideState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeGuideId, setActiveGuideId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!isAuthenticated) {
        if (!cancelled) {
          setState(readLocalState());
          setLoading(false);
        }
        return;
      }
      try {
        const res = await fetch("/api/guides/state");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as GuideState;
        if (!cancelled) setState(body);
      } catch {
        if (!cancelled) setState(EMPTY_STATE);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const patch = useCallback(
    async (body: Record<string, unknown>) => {
      if (!isAuthenticated) {
        setState((prev) => {
          const next: GuideState = { ...prev };
          if (body.markTourCompleted) next.tourCompletedAt = new Date().toISOString();
          if (body.resetTour) next.tourCompletedAt = null;
          if (typeof body.dismissGuideId === "string") {
            next.dismissedGuides = Array.from(new Set([...prev.dismissedGuides, body.dismissGuideId]));
          }
          if (typeof body.undismissGuideId === "string") {
            next.dismissedGuides = prev.dismissedGuides.filter((id) => id !== body.undismissGuideId);
          }
          writeLocalState(next);
          return next;
        });
        return;
      }
      try {
        const res = await fetch("/api/guides/state", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) return;
        const next = (await res.json()) as GuideState;
        setState(next);
      } catch {
        /* swallow — UI stays responsive */
      }
    },
    [isAuthenticated],
  );

  const value = useMemo<GuideContextValue>(
    () => ({
      ...state,
      isAuthenticated,
      loading,
      drawerOpen,
      activeGuideId,
      setDrawerOpen,
      openGuide: (id) => {
        setActiveGuideId(id);
      },
      closeGuide: () => setActiveGuideId(null),
      dismissGuide: (id) => patch({ dismissGuideId: id }),
      undismissGuide: (id) => patch({ undismissGuideId: id }),
      markTourCompleted: () => patch({ markTourCompleted: true }),
      resetTour: () => patch({ resetTour: true }),
    }),
    [state, isAuthenticated, loading, drawerOpen, activeGuideId, patch],
  );

  return <GuideContext.Provider value={value}>{children}</GuideContext.Provider>;
}

export function useGuides(): GuideContextValue {
  const ctx = useContext(GuideContext);
  if (!ctx) throw new Error("useGuides must be used inside <GuideProvider>");
  return ctx;
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/guides/guide-provider.tsx
git commit -m "$(cat <<'EOF'
feat(web): add GuideProvider context with state sync and dismissals

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2 — UI Primitives (Tasks 5–8)

### Task 5: `<Spotlight />` primitive

**Files:**
- Create: `apps/web/components/guides/spotlight.tsx`

- [ ] **Step 1: Write Spotlight**

Create `apps/web/components/guides/spotlight.tsx`:

```tsx
"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import type { GuideStepPlacement } from "@/content/guides/types";

interface SpotlightProps {
  selector: string;
  placement: GuideStepPlacement;
  title: string;
  body: string;
  stepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onPrev?: () => void;
  onClose: () => void;
  nextLabel: string;
  prevLabel: string;
  closeLabel: string;
  finishLabel: string;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PADDING = 6;

function getRect(selector: string): Rect | null {
  if (typeof document === "undefined") return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    top: r.top + window.scrollY - PADDING,
    left: r.left + window.scrollX - PADDING,
    width: r.width + PADDING * 2,
    height: r.height + PADDING * 2,
  };
}

function tooltipPosition(rect: Rect, placement: GuideStepPlacement) {
  switch (placement) {
    case "top":
      return { top: rect.top - 12, left: rect.left + rect.width / 2, transform: "translate(-50%, -100%)" };
    case "bottom":
      return { top: rect.top + rect.height + 12, left: rect.left + rect.width / 2, transform: "translate(-50%, 0)" };
    case "left":
      return { top: rect.top + rect.height / 2, left: rect.left - 12, transform: "translate(-100%, -50%)" };
    case "right":
      return { top: rect.top + rect.height / 2, left: rect.left + rect.width + 12, transform: "translate(0, -50%)" };
  }
}

export function Spotlight({
  selector,
  placement,
  title,
  body,
  stepIndex,
  totalSteps,
  onNext,
  onPrev,
  onClose,
  nextLabel,
  prevLabel,
  closeLabel,
  finishLabel,
}: SpotlightProps) {
  const [rect, setRect] = useState<Rect | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    let raf = 0;
    function update() {
      setRect(getRect(selector));
      raf = window.requestAnimationFrame(update);
    }
    // Poll with RAF for ~1s to catch late-mounting anchors, then settle.
    const timeout = window.setTimeout(() => {
      window.cancelAnimationFrame(raf);
    }, 1000);
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timeout);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [selector]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" || e.key === "Enter") onNext();
      else if (e.key === "ArrowLeft" && onPrev) onPrev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNext, onPrev, onClose]);

  if (!mounted) return null;

  const isLast = stepIndex === totalSteps - 1;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="spotlight-root"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="pointer-events-none fixed inset-0 z-50"
      >
        {rect ? (
          <>
            {/* Four masking divs around the hole */}
            <div
              className="pointer-events-auto fixed bg-black/55"
              style={{ top: 0, left: 0, right: 0, height: rect.top }}
              onClick={onClose}
            />
            <div
              className="pointer-events-auto fixed bg-black/55"
              style={{ top: rect.top + rect.height, left: 0, right: 0, bottom: 0 }}
              onClick={onClose}
            />
            <div
              className="pointer-events-auto fixed bg-black/55"
              style={{ top: rect.top, left: 0, width: rect.left, height: rect.height }}
              onClick={onClose}
            />
            <div
              className="pointer-events-auto fixed bg-black/55"
              style={{ top: rect.top, left: rect.left + rect.width, right: 0, height: rect.height }}
              onClick={onClose}
            />
            {/* Hole outline */}
            <div
              className="pointer-events-none fixed rounded-md ring-2 ring-indigo-500"
              style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
            />
            {/* Tooltip */}
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="pointer-events-auto fixed z-10 max-w-80 rounded-lg border border-border bg-background p-4 shadow-xl"
              style={tooltipPosition(rect, placement)}
            >
              <div className="mb-1 text-xs text-muted-foreground">
                {stepIndex + 1} / {totalSteps}
              </div>
              <div className="mb-1 text-sm font-semibold">{title}</div>
              <div className="mb-3 text-sm text-muted-foreground">{body}</div>
              <div className="flex items-center justify-between gap-2">
                <button
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={onClose}
                  type="button"
                >
                  {closeLabel}
                </button>
                <div className="flex gap-2">
                  {onPrev && stepIndex > 0 ? (
                    <button
                      className="rounded border border-border px-3 py-1 text-xs"
                      onClick={onPrev}
                      type="button"
                    >
                      {prevLabel}
                    </button>
                  ) : null}
                  <button
                    className="rounded bg-indigo-500 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-600"
                    onClick={onNext}
                    type="button"
                  >
                    {isLast ? finishLabel : nextLabel}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        ) : (
          /* Anchor not yet in DOM — show a centered fallback card so the tour doesn't stall. */
          <div className="pointer-events-auto fixed inset-0 flex items-center justify-center bg-black/55" onClick={onClose}>
            <div
              className="max-w-80 rounded-lg border border-border bg-background p-4 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-1 text-xs text-muted-foreground">
                {stepIndex + 1} / {totalSteps}
              </div>
              <div className="mb-1 text-sm font-semibold">{title}</div>
              <div className="mb-3 text-sm text-muted-foreground">{body}</div>
              <div className="flex justify-end gap-2">
                <button
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={onClose}
                  type="button"
                >
                  {closeLabel}
                </button>
                <button
                  className="rounded bg-indigo-500 px-3 py-1 text-xs font-medium text-white"
                  onClick={onNext}
                  type="button"
                >
                  {isLast ? finishLabel : nextLabel}
                </button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/guides/spotlight.tsx
git commit -m "$(cat <<'EOF'
feat(web): add Spotlight primitive for tour and guide playback

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Floating `?` button

**Files:**
- Create: `apps/web/components/guides/floating-guide-button.tsx`

- [ ] **Step 1: Write component**

Create `apps/web/components/guides/floating-guide-button.tsx`:

```tsx
"use client";

import { HelpCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useGuides } from "./guide-provider";

export function FloatingGuideButton() {
  const { drawerOpen, setDrawerOpen } = useGuides();
  const t = useTranslations("guides.button");

  if (drawerOpen) return null;

  return (
    <button
      type="button"
      aria-label={t("openGuides")}
      onClick={() => setDrawerOpen(true)}
      className="fixed right-5 bottom-5 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-500 text-white shadow-lg transition hover:bg-indigo-600 hover:scale-105"
    >
      <HelpCircle className="h-5 w-5" />
    </button>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/guides/floating-guide-button.tsx
git commit -m "$(cat <<'EOF'
feat(web): add floating ? button for guides drawer

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `<GuideDrawer>` shell

**Files:**
- Create: `apps/web/components/guides/guide-drawer.tsx`

- [ ] **Step 1: Write drawer**

Create `apps/web/components/guides/guide-drawer.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { X, Play, BookOpen, EyeOff, Search as SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { GUIDES } from "@/content/guides";
import type { GuideCategory, GuideDefinition } from "@/content/guides/types";
import { useGuides } from "./guide-provider";

const CATEGORY_ORDER: GuideCategory[] = ["deepdive", "explore", "account"];

function filterGuides(guides: GuideDefinition[], q: string, dismissed: string[]) {
  const normalized = q.trim().toLowerCase();
  return guides.filter((g) => {
    if (!normalized && dismissed.includes(g.id)) return false;
    if (!normalized) return true;
    return (
      g.id.toLowerCase().includes(normalized) ||
      g.titleKey.toLowerCase().includes(normalized) ||
      g.summaryKey.toLowerCase().includes(normalized)
    );
  });
}

export function GuideDrawer() {
  const t = useTranslations("guides");
  const { drawerOpen, setDrawerOpen, dismissedGuides, dismissGuide, openGuide, resetTour } = useGuides();
  const [q, setQ] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const visible = useMemo(() => filterGuides(GUIDES, q, dismissedGuides), [q, dismissedGuides]);
  const grouped = useMemo(() => {
    const map = new Map<GuideCategory, GuideDefinition[]>();
    for (const cat of CATEGORY_ORDER) map.set(cat, []);
    for (const g of visible) map.get(g.category)?.push(g);
    return map;
  }, [visible]);

  return (
    <Dialog.Root open={drawerOpen} onOpenChange={setDrawerOpen} modal={false}>
      <AnimatePresence>
        {drawerOpen ? (
          <Dialog.Portal forceMount>
            <Dialog.Content asChild>
              <motion.aside
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", damping: 28, stiffness: 260 }}
                className="fixed top-0 right-0 bottom-0 z-40 flex w-[420px] max-w-full flex-col border-l border-border bg-background shadow-2xl"
              >
                <header className="flex items-center justify-between border-b border-border p-4">
                  <Dialog.Title className="flex items-center gap-2 text-sm font-semibold">
                    <BookOpen className="h-4 w-4" /> {t("drawer.title")}
                  </Dialog.Title>
                  <Dialog.Close asChild>
                    <button aria-label={t("drawer.close")} className="text-muted-foreground hover:text-foreground">
                      <X className="h-4 w-4" />
                    </button>
                  </Dialog.Close>
                </header>

                <div className="border-b border-border p-3">
                  <div className="flex items-center gap-2 rounded border border-border bg-muted/20 px-2 py-1 text-sm">
                    <SearchIcon className="h-4 w-4 opacity-60" />
                    <input
                      aria-label={t("drawer.search")}
                      placeholder={t("drawer.search")}
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      className="w-full bg-transparent outline-none"
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2">
                  {CATEGORY_ORDER.map((cat) => {
                    const items = grouped.get(cat) ?? [];
                    if (items.length === 0) return null;
                    return (
                      <section key={cat} className="mb-4">
                        <h3 className="mb-2 px-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                          {t(`category.${cat}`)} <span className="opacity-60">({items.length})</span>
                        </h3>
                        <ul className="flex flex-col gap-1">
                          {items.map((g) => (
                            <li key={g.id} className="rounded border border-transparent hover:border-border">
                              <button
                                type="button"
                                onClick={() => setExpandedId(expandedId === g.id ? null : g.id)}
                                className="flex w-full items-start gap-2 px-2 py-2 text-left text-sm"
                              >
                                <span className="mt-0.5 text-base">📘</span>
                                <span className="flex-1">
                                  <span className="block font-medium">{t(g.titleKey.replace(/^guides\./, ""))}</span>
                                  <span className="block text-xs text-muted-foreground">{t(g.summaryKey.replace(/^guides\./, ""))}</span>
                                </span>
                              </button>
                              {expandedId === g.id ? (
                                <div className="flex gap-2 border-t border-border bg-muted/10 px-2 py-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDrawerOpen(false);
                                      openGuide(g.id);
                                    }}
                                    className="flex items-center gap-1 rounded bg-indigo-500 px-2 py-1 text-xs text-white hover:bg-indigo-600"
                                  >
                                    <Play className="h-3 w-3" /> {t("action.play")}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setExpandedId(g.id)}
                                    className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs"
                                  >
                                    <BookOpen className="h-3 w-3" /> {t("action.read")}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => dismissGuide(g.id)}
                                    className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                                  >
                                    <EyeOff className="h-3 w-3" /> {t("action.dismiss")}
                                  </button>
                                </div>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </section>
                    );
                  })}
                </div>

                <footer className="border-t border-border p-3">
                  <button
                    type="button"
                    onClick={async () => {
                      await resetTour();
                      setDrawerOpen(false);
                    }}
                    className="w-full rounded border border-border px-3 py-2 text-xs hover:bg-muted/40"
                  >
                    {t("drawer.replayTour")}
                  </button>
                </footer>
              </motion.aside>
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}
```

> Note: this task creates the shell + search + list. The "Read" view (in-drawer step accordion) and actual `<Spotlight />` playback from "Play" are wired in Task 12.

- [ ] **Step 2: Temporary `GUIDES` stub**

Create `apps/web/content/guides/index.ts` as a stub so the drawer compiles (fully populated in Task 12):

```ts
import type { GuideDefinition } from "./types";

export const GUIDES: GuideDefinition[] = [];
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/guides/guide-drawer.tsx apps/web/content/guides/index.ts
git commit -m "$(cat <<'EOF'
feat(web): add guides drawer shell with search and category groups

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Mount in `[locale]/layout.tsx` + minimum i18n namespace

**Files:**
- Modify: `apps/web/app/[locale]/layout.tsx`
- Modify: `apps/web/messages/en.json`
- Modify: `apps/web/messages/zh.json`

- [ ] **Step 1: Wire provider + drawer + button**

Edit `apps/web/app/[locale]/layout.tsx`. Replace the body contents with:

```tsx
import { auth } from "@/lib/auth";
import { GuideProvider } from "@/components/guides/guide-provider";
import { GuideDrawer } from "@/components/guides/guide-drawer";
import { FloatingGuideButton } from "@/components/guides/floating-guide-button";

// ... existing imports stay as-is ...

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as "en" | "zh")) {
    notFound();
  }

  setRequestLocale(locale);

  const messages = await getMessages();
  const session = await auth();
  const isAuthenticated = Boolean(session?.user?.email);

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${interSans.variable} ${jetbrainsMono.variable} antialiased`}>
        <ScrollbarAutoHide />
        <NextIntlClientProvider messages={messages}>
          <Providers>
            <GuideProvider isAuthenticated={isAuthenticated}>
              {children}
              <GuideDrawer />
              <FloatingGuideButton />
            </GuideProvider>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Add i18n namespace skeleton (en)**

Open `apps/web/messages/en.json`. Add a new top-level key (merge into existing object, do not replace):

```json
{
  "guides": {
    "button": { "openGuides": "Open guides" },
    "drawer": {
      "title": "Guides",
      "close": "Close",
      "search": "Search guides...",
      "replayTour": "▶ Replay first-run tour"
    },
    "category": {
      "deepdive": "DeepDive",
      "explore": "Explore",
      "account": "Account"
    },
    "action": {
      "play": "Play",
      "read": "Read",
      "dismiss": "Don't show again"
    },
    "tour": {
      "welcomeTitle": "Welcome to SparkFlow",
      "welcomeBody": "Take a 5-minute tour of the essentials?",
      "start": "Start tour",
      "skip": "Skip for now",
      "next": "Next",
      "prev": "Back",
      "finish": "Finish",
      "close": "Close",
      "skipToast": "Reopen anytime from the ? button"
    }
  }
}
```

- [ ] **Step 3: Add i18n namespace skeleton (zh)**

Open `apps/web/messages/zh.json`. Add the same `guides` namespace with Chinese text:

```json
{
  "guides": {
    "button": { "openGuides": "打开引导" },
    "drawer": {
      "title": "使用引导",
      "close": "关闭",
      "search": "搜索引导...",
      "replayTour": "▶ 重新运行首次引导"
    },
    "category": {
      "deepdive": "DeepDive",
      "explore": "Explore",
      "account": "账户"
    },
    "action": {
      "play": "播放演示",
      "read": "阅读",
      "dismiss": "不再显示"
    },
    "tour": {
      "welcomeTitle": "欢迎使用 SparkFlow",
      "welcomeBody": "用 5 分钟逛一圈?",
      "start": "开始",
      "skip": "稍后再说",
      "next": "下一步",
      "prev": "上一步",
      "finish": "完成",
      "close": "关闭",
      "skipToast": "随时点右下的 ? 按钮重启"
    }
  }
}
```

- [ ] **Step 4: Type-check, lint, dev-server check**

```bash
npx tsc --noEmit && npm run lint
npm run dev
```

Open `http://localhost:3001` → you should see the floating `?` button in the bottom right, clicking it opens an empty drawer labeled "Guides" with an empty state. Switch to `/zh` → labels become Chinese. Kill the dev server.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/[locale]/layout.tsx apps/web/messages/en.json apps/web/messages/zh.json
git commit -m "$(cat <<'EOF'
feat(web): mount GuideProvider, drawer, and floating button in locale layout

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3 — First-Run Tour (Tasks 9–11)

### Task 9: `<FirstRunTour>` orchestrator (welcome modal + step engine)

**Files:**
- Create: `apps/web/components/guides/first-run-tour.tsx`
- Create: `apps/web/components/guides/use-first-run-tour.ts`

- [ ] **Step 1: Write hook**

Create `apps/web/components/guides/use-first-run-tour.ts`:

```ts
"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { TourProgress } from "@/content/guides/types";
import { TOUR_PROGRESS_STORAGE_KEY } from "@/content/guides/types";
import { useGuides } from "./guide-provider";

export function useFirstRunTour() {
  const { loading, tourCompletedAt, markTourCompleted } = useGuides();
  const [stage, setStage] = useState<"idle" | "welcome" | "running" | "done">("idle");
  const [stepIndex, setStepIndex] = useState(0);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (tourCompletedAt) {
      setStage("done");
      return;
    }
    // Resume if a progress marker exists
    if (typeof window !== "undefined") {
      const raw = window.localStorage.getItem(TOUR_PROGRESS_STORAGE_KEY);
      if (raw) {
        try {
          const progress = JSON.parse(raw) as TourProgress;
          setStepIndex(progress.stepIndex);
          setStage("running");
          return;
        } catch {
          /* ignore */
        }
      }
    }
    setStage("welcome");
  }, [loading, tourCompletedAt]);

  function saveProgress(next: number) {
    if (typeof window === "undefined") return;
    const progress: TourProgress = {
      stepIndex: next,
      path: pathname ?? "/",
      startedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(TOUR_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
  }

  function clearProgress() {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(TOUR_PROGRESS_STORAGE_KEY);
  }

  return {
    stage,
    stepIndex,
    start: () => {
      setStage("running");
      saveProgress(0);
    },
    skip: async () => {
      clearProgress();
      await markTourCompleted();
      setStage("done");
    },
    next: () => {
      const n = stepIndex + 1;
      setStepIndex(n);
      saveProgress(n);
    },
    prev: () => {
      const n = Math.max(0, stepIndex - 1);
      setStepIndex(n);
      saveProgress(n);
    },
    finish: async () => {
      clearProgress();
      await markTourCompleted();
      setStage("done");
    },
    navigate: (route: string) => router.push(route),
  };
}
```

- [ ] **Step 2: Write FirstRunTour**

Create `apps/web/components/guides/first-run-tour.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { GUIDES } from "@/content/guides";
import type { GuideStep } from "@/content/guides/types";
import { Spotlight } from "./spotlight";
import { useFirstRunTour } from "./use-first-run-tour";

function firstRunSteps(): Array<GuideStep & { guideId: string }> {
  return GUIDES.filter((g) => g.includeInFirstRunTour)
    .sort((a, b) => (a.firstRunTourOrder ?? 0) - (b.firstRunTourOrder ?? 0))
    .flatMap((g) => g.steps.slice(0, 1).map((s) => ({ ...s, guideId: g.id })));
}

export function FirstRunTour() {
  const tour = useFirstRunTour();
  const t = useTranslations("guides.tour");
  const tGuides = useTranslations("guides");
  const pathname = usePathname();
  const steps = firstRunSteps();

  useEffect(() => {
    if (tour.stage !== "running") return;
    const current = steps[tour.stepIndex];
    if (!current?.route) return;
    // Only navigate if we're not already on the target path.
    if (pathname && !pathname.includes(current.route)) {
      tour.navigate(current.route);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour.stage, tour.stepIndex]);

  if (tour.stage === "welcome") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55">
        <div className="max-w-sm rounded-lg border border-border bg-background p-6 shadow-xl">
          <h2 className="mb-2 text-lg font-semibold">{t("welcomeTitle")}</h2>
          <p className="mb-4 text-sm text-muted-foreground">{t("welcomeBody")}</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={tour.skip} className="text-xs text-muted-foreground hover:text-foreground">
              {t("skip")}
            </button>
            <button
              type="button"
              onClick={tour.start}
              className="rounded bg-indigo-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-600"
            >
              {t("start")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (tour.stage === "running" && steps.length > 0) {
    const current = steps[tour.stepIndex] ?? steps[steps.length - 1];
    const stripPrefix = (k: string) => k.replace(/^guides\./, "");
    return (
      <Spotlight
        selector={current.selector}
        placement={current.placement}
        title={tGuides(stripPrefix(current.titleKey))}
        body={tGuides(stripPrefix(current.bodyKey))}
        stepIndex={tour.stepIndex}
        totalSteps={steps.length}
        onNext={() => (tour.stepIndex === steps.length - 1 ? tour.finish() : tour.next())}
        onPrev={tour.stepIndex > 0 ? tour.prev : undefined}
        onClose={tour.skip}
        nextLabel={t("next")}
        prevLabel={t("prev")}
        closeLabel={t("close")}
        finishLabel={t("finish")}
      />
    );
  }

  return null;
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Mount FirstRunTour in layout**

Edit `apps/web/app/[locale]/layout.tsx`. Add import and render inside `GuideProvider`:

```tsx
import { FirstRunTour } from "@/components/guides/first-run-tour";
// ...
<GuideProvider isAuthenticated={isAuthenticated}>
  {children}
  <GuideDrawer />
  <FloatingGuideButton />
  <FirstRunTour />
</GuideProvider>
```

- [ ] **Step 5: Type-check again**

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/guides/use-first-run-tour.ts apps/web/components/guides/first-run-tour.tsx apps/web/app/[locale]/layout.tsx
git commit -m "$(cat <<'EOF'
feat(web): add first-run tour orchestrator with welcome modal

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: `<ActiveGuidePlayer>` — runs a single guide from the drawer

**Files:**
- Create: `apps/web/components/guides/active-guide-player.tsx`
- Modify: `apps/web/app/[locale]/layout.tsx`

- [ ] **Step 1: Write player**

Create `apps/web/components/guides/active-guide-player.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { GUIDES } from "@/content/guides";
import { Spotlight } from "./spotlight";
import { useGuides } from "./guide-provider";

export function ActiveGuidePlayer() {
  const { activeGuideId, closeGuide } = useGuides();
  const [stepIndex, setStepIndex] = useState(0);
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("guides.tour");
  const tGuides = useTranslations("guides");

  const guide = GUIDES.find((g) => g.id === activeGuideId) ?? null;

  useEffect(() => {
    setStepIndex(0);
  }, [activeGuideId]);

  useEffect(() => {
    if (!guide) return;
    const step = guide.steps[stepIndex];
    if (!step?.route) return;
    if (pathname && !pathname.includes(step.route)) {
      router.push(step.route);
    }
  }, [guide, stepIndex, pathname, router]);

  if (!guide) return null;
  const step = guide.steps[stepIndex];
  if (!step) return null;

  const stripPrefix = (k: string) => k.replace(/^guides\./, "");

  return (
    <Spotlight
      selector={step.selector}
      placement={step.placement}
      title={tGuides(stripPrefix(step.titleKey))}
      body={tGuides(stripPrefix(step.bodyKey))}
      stepIndex={stepIndex}
      totalSteps={guide.steps.length}
      onNext={() => {
        if (stepIndex === guide.steps.length - 1) {
          closeGuide();
        } else {
          setStepIndex(stepIndex + 1);
        }
      }}
      onPrev={stepIndex > 0 ? () => setStepIndex(stepIndex - 1) : undefined}
      onClose={closeGuide}
      nextLabel={t("next")}
      prevLabel={t("prev")}
      closeLabel={t("close")}
      finishLabel={t("finish")}
    />
  );
}
```

- [ ] **Step 2: Mount in layout**

Add import in `apps/web/app/[locale]/layout.tsx` and render after `<FirstRunTour />`:

```tsx
import { ActiveGuidePlayer } from "@/components/guides/active-guide-player";
// ...
<ActiveGuidePlayer />
```

- [ ] **Step 3: Type-check + lint**

```bash
npx tsc --noEmit && npm run lint
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/guides/active-guide-player.tsx apps/web/app/[locale]/layout.tsx
git commit -m "$(cat <<'EOF'
feat(web): add ActiveGuidePlayer to replay guides from the drawer

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Add `data-guide` anchors to business components

The tour and guides target real UI elements. This task attaches `data-guide` attributes — one sweep, shared across all guides in Phase 4. Each anchor is additive and does not affect rendering.

**Files:** each is a small edit; show only what to add.

- [ ] **Step 1: Anchor `new-notebook-button`**

Find the "Create notebook" / "+ New Notebook" button. Start:

```bash
rg -n 'New Notebook|Create Notebook|create notebook' apps/web/components/deepdive apps/web/app/\[locale\]/deepdive
```

On the `<Button>` (or `<button>`) element, add `data-guide="new-notebook-button"`.

- [ ] **Step 2: Anchor `upload-button`**

Find the upload button (file + folder + URL upload). Start:

```bash
rg -n 'Upload|upload-menu|add-source' apps/web/components/deepdive apps/web/app/\[locale\]/deepdive
```

Add `data-guide="upload-button"`.

- [ ] **Step 3: Anchor `chat-input`**

Find the deepdive chat input container (the text input users type questions into).

```bash
rg -n 'chat-input|<textarea|ChatInput' apps/web/components/deepdive/chat
```

Add `data-guide="chat-input"` on the outer wrapper of the input.

- [ ] **Step 4: Anchor `api-keys-section`**

Find the API keys form in settings.

```bash
rg -n 'api[- ]keys|apiKeys' apps/web/app/\[locale\]/settings apps/web/components/settings
```

Add `data-guide="api-keys-section"` on the section container.

- [ ] **Step 5: Anchor `wiki-panel` and `notes-panel`**

In the deepdive workspace's right tab panel:

```bash
rg -n 'wiki-panel|notes-panel|TabsTrigger' apps/web/components/deepdive
```

Add `data-guide="wiki-panel"` on the wiki tab trigger (or panel root) and `data-guide="notes-panel"` on the notes equivalent.

- [ ] **Step 6: Anchor `conferences-nav`, `matcher-nav`, `wechat-nav`**

These are entry points in the explore section. Find the nav or landing tiles:

```bash
rg -n 'explore/conferences|explore/toolbox/matcher|explore/social-media/wechat' apps/web/components apps/web/app
```

On the link/card for each, add `data-guide="conferences-nav"`, `data-guide="matcher-nav"`, `data-guide="wechat-nav"`.

- [ ] **Step 7: Anchor `language-switcher` and `theme-toggle`**

```bash
rg -n 'locale-switcher|theme-toggle' apps/web/components
```

Add `data-guide="language-switcher"` and `data-guide="theme-toggle"`.

- [ ] **Step 8: Verify anchors exist**

```bash
rg -n 'data-guide=' apps/web
```

Expected: at least 11 matches (one per anchor above; some, like wiki/notes, may contribute 2+).

- [ ] **Step 9: Type-check + lint**

```bash
npx tsc --noEmit && npm run lint
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/web
git commit -m "$(cat <<'EOF'
feat(web): add data-guide anchors for usage guide spotlight targets

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4 — Guide Content (Tasks 12–17)

Pattern every guide file follows — **all fields required or explicitly omitted**:

```ts
import type { GuideDefinition } from "./types";

export const <camelCaseId>Guide: GuideDefinition = {
  id: "<kebab-case-id>",          // MUST match the key under `guides.<camelCaseId>` in messages/*.json
  category: "deepdive" | "explore" | "account",
  icon: "<LucideIconName>",
  titleKey: "guides.<camelCaseId>.title",
  summaryKey: "guides.<camelCaseId>.summary",
  includeInFirstRunTour: true | undefined,
  firstRunTourOrder: 1 | 2 | 3 | 4 | undefined,
  steps: [
    {
      selector: '[data-guide="<anchor>"]',
      placement: "top" | "bottom" | "left" | "right",
      titleKey: "guides.<camelCaseId>.step1.title",
      bodyKey:  "guides.<camelCaseId>.step1.body",
      route: "/deepdive" | "/settings" | ... | undefined,
      action: "click" | undefined,
    },
    // ...
  ],
};
```

### Task 12: DeepDive guides part 1 — `create-notebook` + `add-sources`

**Files:**
- Create: `apps/web/content/guides/create-notebook.ts`
- Create: `apps/web/content/guides/add-sources.ts`
- Modify: `apps/web/content/guides/index.ts`
- Modify: `apps/web/messages/en.json` + `zh.json`

- [ ] **Step 1: Write `create-notebook.ts`**

```ts
import type { GuideDefinition } from "./types";

export const createNotebookGuide: GuideDefinition = {
  id: "create-notebook",
  category: "deepdive",
  icon: "FolderPlus",
  titleKey: "guides.createNotebook.title",
  summaryKey: "guides.createNotebook.summary",
  includeInFirstRunTour: true,
  firstRunTourOrder: 1,
  steps: [
    {
      selector: '[data-guide="new-notebook-button"]',
      placement: "bottom",
      titleKey: "guides.createNotebook.step1.title",
      bodyKey: "guides.createNotebook.step1.body",
      route: "/deepdive",
    },
  ],
};
```

- [ ] **Step 2: Write `add-sources.ts`**

```ts
import type { GuideDefinition } from "./types";

export const addSourcesGuide: GuideDefinition = {
  id: "add-sources",
  category: "deepdive",
  icon: "Upload",
  titleKey: "guides.addSources.title",
  summaryKey: "guides.addSources.summary",
  includeInFirstRunTour: true,
  firstRunTourOrder: 2,
  steps: [
    {
      selector: '[data-guide="upload-button"]',
      placement: "bottom",
      titleKey: "guides.addSources.step1.title",
      bodyKey: "guides.addSources.step1.body",
    },
  ],
};
```

- [ ] **Step 3: Register in index**

Replace `apps/web/content/guides/index.ts` contents with:

```ts
import type { GuideDefinition } from "./types";
import { createNotebookGuide } from "./create-notebook";
import { addSourcesGuide } from "./add-sources";

export const GUIDES: GuideDefinition[] = [createNotebookGuide, addSourcesGuide];
```

- [ ] **Step 4: Add i18n entries (en)**

Inside `apps/web/messages/en.json`, under `"guides"`, add:

```json
"createNotebook": {
  "title": "Create a notebook",
  "summary": "Every research project lives in its own notebook.",
  "step1": {
    "title": "Start a new notebook",
    "body": "Click to create a fresh workspace for your sources, chat, and notes."
  }
},
"addSources": {
  "title": "Add sources",
  "summary": "Upload files, folders, or URLs — up to 50 at once.",
  "step1": {
    "title": "Upload your material",
    "body": "Drop PDFs, paste URLs, or pick a whole folder. The system will extract and index it."
  }
}
```

- [ ] **Step 5: Add i18n entries (zh)**

Inside `apps/web/messages/zh.json`, under `"guides"`, add:

```json
"createNotebook": {
  "title": "创建 notebook",
  "summary": "每个研究项目有独立的 notebook。",
  "step1": {
    "title": "新建 notebook",
    "body": "点击按钮新建一个独立的工作空间,承载你的资料、对话和笔记。"
  }
},
"addSources": {
  "title": "添加资料",
  "summary": "支持文件、文件夹、URL,一次最多 50 份。",
  "step1": {
    "title": "上传你的材料",
    "body": "拖放 PDF,粘贴 URL,或选一整个文件夹。系统会自动提取并建立索引。"
  }
}
```

- [ ] **Step 6: Type-check + lint**

```bash
npx tsc --noEmit && npm run lint
```

Expected: PASS.

- [ ] **Step 7: Dev-server verification**

```bash
npm run dev
```

Create a fresh test user via `/signup`. Log in. Expect:
- Welcome modal appears on first visit.
- Click "Start tour" → spotlight navigates to `/deepdive` and highlights the "+ New Notebook" button.
- Click Next → spotlight moves to the Upload button (after notebook is created, or shows centered fallback card if anchor isn't mounted).
- Click drawer `?` → "Create a notebook" and "Add sources" appear under DeepDive category.

Kill dev server.

- [ ] **Step 8: Commit**

```bash
git add apps/web/content/guides/ apps/web/messages/en.json apps/web/messages/zh.json
git commit -m "$(cat <<'EOF'
feat(web): add create-notebook and add-sources guides with i18n

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: DeepDive guides part 2 — `byok-api-keys` + `chat-with-ai`

These are first-run steps 3 and 4. **BYOK comes before chat-with-ai** (prevents non-admin dead-end).

**Files:**
- Create: `apps/web/content/guides/byok-api-keys.ts`
- Create: `apps/web/content/guides/chat-with-ai.ts`
- Modify: `apps/web/content/guides/index.ts`
- Modify: `apps/web/messages/en.json` + `zh.json`

- [ ] **Step 1: Write `byok-api-keys.ts`**

```ts
import type { GuideDefinition } from "./types";

export const byokApiKeysGuide: GuideDefinition = {
  id: "byok-api-keys",
  category: "account",
  icon: "KeyRound",
  titleKey: "guides.byokApiKeys.title",
  summaryKey: "guides.byokApiKeys.summary",
  includeInFirstRunTour: true,
  firstRunTourOrder: 3,
  steps: [
    {
      selector: '[data-guide="api-keys-section"]',
      placement: "top",
      titleKey: "guides.byokApiKeys.step1.title",
      bodyKey: "guides.byokApiKeys.step1.body",
      route: "/settings",
    },
  ],
};
```

- [ ] **Step 2: Write `chat-with-ai.ts`**

```ts
import type { GuideDefinition } from "./types";

export const chatWithAiGuide: GuideDefinition = {
  id: "chat-with-ai",
  category: "deepdive",
  icon: "MessageSquare",
  titleKey: "guides.chatWithAi.title",
  summaryKey: "guides.chatWithAi.summary",
  includeInFirstRunTour: true,
  firstRunTourOrder: 4,
  steps: [
    {
      selector: '[data-guide="chat-input"]',
      placement: "top",
      titleKey: "guides.chatWithAi.step1.title",
      bodyKey: "guides.chatWithAi.step1.body",
      route: "/deepdive",
    },
  ],
};
```

- [ ] **Step 3: Register in index**

Replace `apps/web/content/guides/index.ts`:

```ts
import type { GuideDefinition } from "./types";
import { createNotebookGuide } from "./create-notebook";
import { addSourcesGuide } from "./add-sources";
import { byokApiKeysGuide } from "./byok-api-keys";
import { chatWithAiGuide } from "./chat-with-ai";

export const GUIDES: GuideDefinition[] = [
  createNotebookGuide,
  addSourcesGuide,
  byokApiKeysGuide,
  chatWithAiGuide,
];
```

- [ ] **Step 4: Add i18n entries (en)**

Under `"guides"` in `apps/web/messages/en.json`:

```json
"byokApiKeys": {
  "title": "Bring your own API key",
  "summary": "Use your own OpenAI / Gemini / DeepSeek key — optional.",
  "step1": {
    "title": "Add a key (optional)",
    "body": "Paste a provider key here and all AI calls use it. Skip to stay on the system key."
  }
},
"chatWithAi": {
  "title": "Chat with AI",
  "summary": "Ask questions grounded in your sources — answers cite the original.",
  "step1": {
    "title": "Ask anything",
    "body": "Type a question about your sources. The AI cites exact passages so you can verify."
  }
}
```

- [ ] **Step 5: Add i18n entries (zh)**

Under `"guides"` in `apps/web/messages/zh.json`:

```json
"byokApiKeys": {
  "title": "自带 API Key",
  "summary": "用自己的 OpenAI / Gemini / DeepSeek key,可选。",
  "step1": {
    "title": "填入你的 Key(可选)",
    "body": "把 key 粘贴在这里,所有 AI 调用都走你的 key;跳过则沿用系统 key。"
  }
},
"chatWithAi": {
  "title": "与 AI 对话",
  "summary": "基于你的资料提问,AI 回答会附带原文引用。",
  "step1": {
    "title": "提问",
    "body": "输入关于你资料的问题。AI 会引用原文段落,方便你核对。"
  }
}
```

- [ ] **Step 6: Type-check, lint, commit**

```bash
npx tsc --noEmit && npm run lint
git add apps/web/content/guides/ apps/web/messages/en.json apps/web/messages/zh.json
git commit -m "$(cat <<'EOF'
feat(web): add byok-api-keys and chat-with-ai guides completing the first-run tour

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Dev-server end-to-end tour check**

```bash
npm run dev
```

Create a fresh test user. Log in. The full 4-step tour should flow:
1. `/deepdive` — highlight new-notebook-button
2. After clicking Next, highlight upload-button (or centered fallback)
3. Navigate to `/settings`, highlight api-keys-section
4. Navigate back to `/deepdive`, highlight chat-input
5. Click Finish → tour ends, `?` button remains, drawer lists 4 guides.

Kill dev server.

---

### Task 14: DeepDive guides part 3 — `wiki-graph` + `notes`

**Files:**
- Create: `apps/web/content/guides/wiki-graph.ts`
- Create: `apps/web/content/guides/notes.ts`
- Modify: `apps/web/content/guides/index.ts`
- Modify: `apps/web/messages/en.json` + `zh.json`

- [ ] **Step 1: Write guide files**

`apps/web/content/guides/wiki-graph.ts`:

```ts
import type { GuideDefinition } from "./types";

export const wikiGraphGuide: GuideDefinition = {
  id: "wiki-graph",
  category: "deepdive",
  icon: "Network",
  titleKey: "guides.wikiGraph.title",
  summaryKey: "guides.wikiGraph.summary",
  steps: [
    {
      selector: '[data-guide="wiki-panel"]',
      placement: "left",
      titleKey: "guides.wikiGraph.step1.title",
      bodyKey: "guides.wikiGraph.step1.body",
      route: "/deepdive",
    },
  ],
};
```

`apps/web/content/guides/notes.ts`:

```ts
import type { GuideDefinition } from "./types";

export const notesGuide: GuideDefinition = {
  id: "notes",
  category: "deepdive",
  icon: "NotebookPen",
  titleKey: "guides.notes.title",
  summaryKey: "guides.notes.summary",
  steps: [
    {
      selector: '[data-guide="notes-panel"]',
      placement: "left",
      titleKey: "guides.notes.step1.title",
      bodyKey: "guides.notes.step1.body",
      route: "/deepdive",
    },
  ],
};
```

- [ ] **Step 2: Register**

Append to `GUIDES` array in `apps/web/content/guides/index.ts`:

```ts
import { wikiGraphGuide } from "./wiki-graph";
import { notesGuide } from "./notes";

export const GUIDES: GuideDefinition[] = [
  createNotebookGuide,
  addSourcesGuide,
  byokApiKeysGuide,
  chatWithAiGuide,
  wikiGraphGuide,
  notesGuide,
];
```

- [ ] **Step 3: Add i18n (en)**

```json
"wikiGraph": {
  "title": "Wiki knowledge graph",
  "summary": "Auto-generated wiki from your sources — entities, concepts, summaries.",
  "step1": {
    "title": "Explore the wiki",
    "body": "As sources are added, the wiki builds a graph of entities and concepts. Click a page to jump around."
  }
},
"notes": {
  "title": "Notes",
  "summary": "Personal notes attached to a notebook — search them with AI.",
  "step1": {
    "title": "Capture ideas",
    "body": "Write your own notes alongside the AI output. They stay in the notebook forever."
  }
}
```

- [ ] **Step 4: Add i18n (zh)**

```json
"wikiGraph": {
  "title": "Wiki 知识图谱",
  "summary": "基于资料自动生成的 wiki — 实体、概念、摘要。",
  "step1": {
    "title": "探索 wiki",
    "body": "随着资料加入,wiki 会自动生成实体与概念的图谱。点击页面可跳转浏览。"
  }
},
"notes": {
  "title": "笔记",
  "summary": "附在 notebook 上的个人笔记,AI 可检索。",
  "step1": {
    "title": "记录想法",
    "body": "在 AI 输出旁边写下自己的笔记,永久留在这个 notebook 里。"
  }
}
```

- [ ] **Step 5: tsc + lint + commit**

```bash
npx tsc --noEmit && npm run lint
git add apps/web/content/guides/ apps/web/messages/en.json apps/web/messages/zh.json
git commit -m "$(cat <<'EOF'
feat(web): add wiki-graph and notes guides

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: Explore guides — `conferences` + `matcher` + `wechat`

**Files:**
- Create: `apps/web/content/guides/conferences.ts`, `matcher.ts`, `wechat.ts`
- Modify: `apps/web/content/guides/index.ts`
- Modify: `apps/web/messages/en.json` + `zh.json`

- [ ] **Step 1: Write three guide files**

`conferences.ts`:

```ts
import type { GuideDefinition } from "./types";

export const conferencesGuide: GuideDefinition = {
  id: "conferences",
  category: "explore",
  icon: "CalendarDays",
  titleKey: "guides.conferences.title",
  summaryKey: "guides.conferences.summary",
  steps: [
    {
      selector: '[data-guide="conferences-nav"]',
      placement: "bottom",
      titleKey: "guides.conferences.step1.title",
      bodyKey: "guides.conferences.step1.body",
      route: "/explore/conferences",
    },
  ],
};
```

`matcher.ts`:

```ts
import type { GuideDefinition } from "./types";

export const matcherGuide: GuideDefinition = {
  id: "matcher",
  category: "explore",
  icon: "Target",
  titleKey: "guides.matcher.title",
  summaryKey: "guides.matcher.summary",
  steps: [
    {
      selector: '[data-guide="matcher-nav"]',
      placement: "bottom",
      titleKey: "guides.matcher.step1.title",
      bodyKey: "guides.matcher.step1.body",
      route: "/explore/toolbox/matcher",
    },
  ],
};
```

`wechat.ts`:

```ts
import type { GuideDefinition } from "./types";

export const wechatGuide: GuideDefinition = {
  id: "wechat",
  category: "explore",
  icon: "MessageCircle",
  titleKey: "guides.wechat.title",
  summaryKey: "guides.wechat.summary",
  steps: [
    {
      selector: '[data-guide="wechat-nav"]',
      placement: "bottom",
      titleKey: "guides.wechat.step1.title",
      bodyKey: "guides.wechat.step1.body",
      route: "/explore/social-media/wechat",
    },
  ],
};
```

- [ ] **Step 2: Register in index**

```ts
import { conferencesGuide } from "./conferences";
import { matcherGuide } from "./matcher";
import { wechatGuide } from "./wechat";

export const GUIDES: GuideDefinition[] = [
  createNotebookGuide,
  addSourcesGuide,
  byokApiKeysGuide,
  chatWithAiGuide,
  wikiGraphGuide,
  notesGuide,
  conferencesGuide,
  matcherGuide,
  wechatGuide,
];
```

- [ ] **Step 3: Add i18n (en)**

```json
"conferences": {
  "title": "Browse conferences",
  "summary": "Venues, instances, sessions, and publications — with charts.",
  "step1": {
    "title": "Open the conference browser",
    "body": "Filter by venue / year / topic. Drill into a session to see speakers, affiliations, and keywords."
  }
},
"matcher": {
  "title": "Matcher",
  "summary": "Match a query against thousands of conference sessions.",
  "step1": {
    "title": "Try the matcher",
    "body": "Paste a question or abstract; Matcher returns ranked sessions with similarity scores."
  }
},
"wechat": {
  "title": "WeChat articles",
  "summary": "Browse and search the WeChat article corpus.",
  "step1": {
    "title": "Explore articles",
    "body": "Search WeChat articles by keyword; open any article to read and see extracted images."
  }
}
```

- [ ] **Step 4: Add i18n (zh)**

```json
"conferences": {
  "title": "浏览会议",
  "summary": "会议、届次、session、publication — 带图表。",
  "step1": {
    "title": "打开会议浏览器",
    "body": "按会议/年份/主题筛选。点进 session 可看讲者、机构与关键词。"
  }
},
"matcher": {
  "title": "Matcher",
  "summary": "用 query 匹配数千个会议 session。",
  "step1": {
    "title": "试试 Matcher",
    "body": "粘贴一段提问或摘要,Matcher 返回按相似度排序的相关 session。"
  }
},
"wechat": {
  "title": "WeChat 文章",
  "summary": "浏览和检索 WeChat 文章库。",
  "step1": {
    "title": "探索文章",
    "body": "按关键词检索 WeChat 文章;打开任意文章可阅读并查看抽取出的图片。"
  }
}
```

- [ ] **Step 5: tsc + lint + commit**

```bash
npx tsc --noEmit && npm run lint
git add apps/web/content/guides/ apps/web/messages/en.json apps/web/messages/zh.json
git commit -m "$(cat <<'EOF'
feat(web): add explore guides for conferences, matcher, and wechat

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 16: Account guide — `language-theme`

(`byok-api-keys` was added in Task 13.)

**Files:**
- Create: `apps/web/content/guides/language-theme.ts`
- Modify: `apps/web/content/guides/index.ts`
- Modify: `apps/web/messages/en.json` + `zh.json`

- [ ] **Step 1: Write guide**

```ts
import type { GuideDefinition } from "./types";

export const languageThemeGuide: GuideDefinition = {
  id: "language-theme",
  category: "account",
  icon: "Languages",
  titleKey: "guides.languageTheme.title",
  summaryKey: "guides.languageTheme.summary",
  steps: [
    {
      selector: '[data-guide="language-switcher"]',
      placement: "bottom",
      titleKey: "guides.languageTheme.step1.title",
      bodyKey: "guides.languageTheme.step1.body",
    },
    {
      selector: '[data-guide="theme-toggle"]',
      placement: "bottom",
      titleKey: "guides.languageTheme.step2.title",
      bodyKey: "guides.languageTheme.step2.body",
    },
  ],
};
```

- [ ] **Step 2: Register**

```ts
import { languageThemeGuide } from "./language-theme";

export const GUIDES: GuideDefinition[] = [
  /* ...existing... */
  languageThemeGuide,
];
```

- [ ] **Step 3: i18n (en)**

```json
"languageTheme": {
  "title": "Language & theme",
  "summary": "Switch between English and Chinese, light and dark.",
  "step1": {
    "title": "Language",
    "body": "Pick English or Chinese. The whole app re-renders in the chosen locale."
  },
  "step2": {
    "title": "Theme",
    "body": "Toggle light / dark. Your preference is saved locally."
  }
}
```

- [ ] **Step 4: i18n (zh)**

```json
"languageTheme": {
  "title": "语言与主题",
  "summary": "切换中英文、明暗主题。",
  "step1": {
    "title": "语言",
    "body": "选择中文或英文,整个应用会立即按所选语言重新渲染。"
  },
  "step2": {
    "title": "主题",
    "body": "切换明暗主题。偏好会保存在本地。"
  }
}
```

- [ ] **Step 5: tsc + lint + commit**

```bash
npx tsc --noEmit && npm run lint
git add apps/web/content/guides/ apps/web/messages/en.json apps/web/messages/zh.json
git commit -m "$(cat <<'EOF'
feat(web): add language-theme guide — completes the 10-guide catalog

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 17: Read mode in the drawer (step-by-step text expansion)

The drawer currently collapses after clicking a guide's row. This task adds "Read" mode that expands the guide's steps inline as text.

**Files:**
- Modify: `apps/web/components/guides/guide-drawer.tsx`

- [ ] **Step 1: Track view mode in component**

In `guide-drawer.tsx`, extend state to remember which mode each expanded guide is in:

```tsx
const [viewMode, setViewMode] = useState<"collapsed" | "actions" | "read">("collapsed");
```

Replace the existing `expandedId` toggle logic so clicking a guide row sets `expandedId` + `viewMode = "actions"`. Clicking "Read" changes `viewMode` to `"read"`.

- [ ] **Step 2: Render read view**

When `expandedId === g.id && viewMode === "read"`, render:

```tsx
<div className="space-y-3 border-t border-border bg-muted/10 px-3 py-3">
  {g.steps.map((step, i) => (
    <div key={i}>
      <div className="mb-1 text-xs font-semibold text-muted-foreground">
        {t("drawer.step", { n: i + 1, total: g.steps.length })}
      </div>
      <div className="text-sm font-medium">{t(step.titleKey.replace(/^guides\./, ""))}</div>
      <div className="text-sm text-muted-foreground">{t(step.bodyKey.replace(/^guides\./, ""))}</div>
    </div>
  ))}
</div>
```

Add `"step": "Step {n} / {total}"` to `guides.drawer` in both locales (en + zh:`"第 {n} / {total} 步"`).

- [ ] **Step 3: tsc + lint + dev-server verify**

```bash
npx tsc --noEmit && npm run lint && npm run dev
```

Open drawer, click a guide, click Read → steps appear inline without leaving the drawer. Kill dev server.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/guides/guide-drawer.tsx apps/web/messages/
git commit -m "$(cat <<'EOF'
feat(web): add in-drawer Read mode showing guide steps as text

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5 — Polish (Tasks 18–22)

### Task 18: Keyboard shortcut (`?` then `g`) opens drawer

**Files:**
- Create: `apps/web/components/guides/use-keyboard-shortcut.ts`
- Modify: `apps/web/components/guides/floating-guide-button.tsx`

- [ ] **Step 1: Write hook**

```ts
"use client";

import { useEffect } from "react";
import { useGuides } from "./guide-provider";

export function useGuidesShortcut() {
  const { setDrawerOpen } = useGuides();

  useEffect(() => {
    let armed = false;
    let timeout = 0;

    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA"].includes(target.tagName))) return;

      if (e.key === "?" && (e.shiftKey || e.key === "?")) {
        armed = true;
        window.clearTimeout(timeout);
        timeout = window.setTimeout(() => {
          armed = false;
        }, 1500);
        return;
      }
      if (armed && (e.key === "g" || e.key === "G")) {
        armed = false;
        setDrawerOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(timeout);
    };
  }, [setDrawerOpen]);
}
```

- [ ] **Step 2: Wire it in the button**

In `floating-guide-button.tsx`, call the hook:

```tsx
import { useGuidesShortcut } from "./use-keyboard-shortcut";

export function FloatingGuideButton() {
  useGuidesShortcut();
  // ...existing code...
}
```

- [ ] **Step 3: Show the hint in drawer footer**

In `apps/web/messages/en.json` under `guides.drawer`:

```json
"shortcutHint": "Shortcut: ? then g"
```

And `apps/web/messages/zh.json`:

```json
"shortcutHint": "快捷键:? 然后 g"
```

In `guide-drawer.tsx` footer, add below the replay button:

```tsx
<div className="mt-2 text-center text-xs text-muted-foreground">{t("drawer.shortcutHint")}</div>
```

- [ ] **Step 4: tsc + lint + dev-server verify + commit**

```bash
npx tsc --noEmit && npm run lint && npm run dev
```

Press `?` then `g` (not inside an input) → drawer opens. Kill dev.

```bash
git add apps/web/components/guides/ apps/web/messages/
git commit -m "$(cat <<'EOF'
feat(web): add ?-then-g keyboard shortcut to open guides drawer

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 19: Mobile bottom-sheet fallback for Spotlight

**Files:**
- Modify: `apps/web/components/guides/spotlight.tsx`

- [ ] **Step 1: Detect small viewport**

At the top of the `Spotlight` component, add:

```tsx
const [isMobile, setIsMobile] = useState(false);
useEffect(() => {
  const mq = window.matchMedia("(max-width: 640px)");
  const handler = () => setIsMobile(mq.matches);
  handler();
  mq.addEventListener("change", handler);
  return () => mq.removeEventListener("change", handler);
}, []);
```

- [ ] **Step 2: Render bottom sheet when mobile**

When `isMobile`, render a bottom sheet instead of the spotlight hole:

```tsx
if (isMobile) {
  return createPortal(
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      className="fixed right-0 bottom-0 left-0 z-50 rounded-t-xl border-t border-border bg-background p-4 shadow-xl"
    >
      <div className="mb-1 text-xs text-muted-foreground">
        {stepIndex + 1} / {totalSteps}
      </div>
      <div className="mb-1 text-sm font-semibold">{title}</div>
      <div className="mb-3 text-sm text-muted-foreground">{body}</div>
      <div className="flex items-center justify-between">
        <button type="button" onClick={onClose} className="text-xs text-muted-foreground">{closeLabel}</button>
        <div className="flex gap-2">
          {onPrev && stepIndex > 0 ? (
            <button type="button" onClick={onPrev} className="rounded border border-border px-3 py-1 text-xs">{prevLabel}</button>
          ) : null}
          <button type="button" onClick={onNext} className="rounded bg-indigo-500 px-3 py-1 text-xs font-medium text-white">
            {isLast ? finishLabel : nextLabel}
          </button>
        </div>
      </div>
    </motion.div>,
    document.body,
  );
}
```

Place this branch before the main `return createPortal(...)` block.

- [ ] **Step 3: tsc + lint + commit**

```bash
npx tsc --noEmit && npm run lint
git add apps/web/components/guides/spotlight.tsx
git commit -m "$(cat <<'EOF'
feat(web): add mobile bottom-sheet fallback for spotlight overlay

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 20: Landing-page subset — show public guides for unauthenticated visitors

**Files:**
- Modify: `apps/web/content/guides/create-notebook.ts`, `add-sources.ts`, `chat-with-ai.ts`
- Modify: `apps/web/components/guides/guide-drawer.tsx`

- [ ] **Step 1: Flag public guides**

Add `publicOnLanding: true` to the three guides most useful to a visitor evaluating SparkFlow:
- `create-notebook`
- `add-sources`
- `chat-with-ai`

On each guide definition, insert `publicOnLanding: true,` above `steps: [`.

- [ ] **Step 2: Filter in drawer when unauthenticated**

In `guide-drawer.tsx`, replace the list base with:

```tsx
const { drawerOpen, setDrawerOpen, dismissedGuides, dismissGuide, openGuide, resetTour, isAuthenticated } = useGuides();

const source = isAuthenticated ? GUIDES : GUIDES.filter((g) => g.publicOnLanding);
const visible = useMemo(() => filterGuides(source, q, dismissedGuides), [source, q, dismissedGuides]);
```

- [ ] **Step 3: Replace FirstRunTour for guests**

In `apps/web/components/guides/first-run-tour.tsx`, gate the welcome modal behind `isAuthenticated`:

```tsx
const { isAuthenticated } = useGuides();
if (!isAuthenticated) return null;
```

Insert this near the top of the component body before any stage rendering.

- [ ] **Step 4: tsc + lint + dev verify**

```bash
npx tsc --noEmit && npm run lint && npm run dev
```

Log out. Visit `/en` landing page. Click `?` button → drawer opens showing only 3 guides under DeepDive. No welcome modal appears. Kill dev.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "$(cat <<'EOF'
feat(web): expose public guide subset on landing page for guests

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 21: Skip toast after `skip` action

**Files:**
- Modify: `apps/web/components/guides/first-run-tour.tsx`

The spec says: when user skips mid-tour, show a small toast "Reopen anytime from the ? button" (`guides.tour.skipToast`). The codebase does not yet have a toast lib in `apps/web/package.json` — use a simple one-off in-app banner instead (no new dep).

- [ ] **Step 1: Add state for skip banner**

Inside `FirstRunTour`, add:

```tsx
const [showSkipBanner, setShowSkipBanner] = useState(false);

async function handleSkip() {
  setShowSkipBanner(true);
  await tour.skip();
  window.setTimeout(() => setShowSkipBanner(false), 4000);
}
```

Replace calls to `tour.skip` with `handleSkip` inside the welcome modal's "Skip for now" button and in the `<Spotlight onClose={...} />` prop.

- [ ] **Step 2: Render banner**

Render after the stage branches (always possible):

```tsx
{showSkipBanner ? (
  <div className="fixed bottom-20 left-1/2 z-40 -translate-x-1/2 rounded-lg border border-border bg-background px-4 py-2 text-xs shadow-lg">
    {t("skipToast")}
  </div>
) : null}
```

- [ ] **Step 3: tsc + lint + dev verify + commit**

```bash
npx tsc --noEmit && npm run lint && npm run dev
```

Start tour, click Skip → banner appears for ~4s. Kill dev.

```bash
git add apps/web/components/guides/first-run-tour.tsx
git commit -m "$(cat <<'EOF'
feat(web): show brief reminder banner when user skips first-run tour

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 22: Final QA — build, bundle size, full walkthrough

**Files:** no code changes unless bugs surface.

- [ ] **Step 1: Baseline bundle size**

```bash
git stash -u -- apps/web/components/guides apps/web/content/guides apps/web/app/api/guides
npm run build 2>&1 | tee /tmp/before-build.log
git stash pop
```

Record the `First Load JS shared by all` number from the "Route (app)" table in `/tmp/before-build.log`. Example: `First Load JS shared by all: 102 kB`.

- [ ] **Step 2: Post-change bundle size**

```bash
npm run build 2>&1 | tee /tmp/after-build.log
```

Compare `First Load JS shared by all`. Target: delta **< 30 KB gzipped** (spec §10).

- [ ] **Step 3: Static rendering check**

In `/tmp/after-build.log`, confirm no "client-side rendering" warnings introduced for `[locale]/*` routes that were SSG before.

- [ ] **Step 4: Full walkthrough**

```bash
npm run dev
```

Manually validate, unchecking as you confirm:

- [ ] New user flow: signup → welcome modal → 4-step tour → finish → tour no longer re-fires on reload.
- [ ] Skip mid-tour: banner shows; reload → tour does not re-fire.
- [ ] `?` button: visible on every `[locale]/*` route except when drawer is open.
- [ ] Drawer: 3 categories, 10 guides total. Search filters by keyword. Dismiss hides from list.
- [ ] Play mode for `matcher`: navigates to `/explore/toolbox/matcher`, highlights nav anchor.
- [ ] Read mode: shows step titles + bodies without leaving drawer.
- [ ] Replay tour button: resets `tourCompletedAt` via PATCH; new user flow reproduces.
- [ ] Mobile (devtools narrow viewport 380px): spotlight degrades to bottom sheet.
- [ ] Locale switch mid-tour: labels change language, step does not reset.
- [ ] Keyboard `?` then `g`: opens drawer from anywhere (not inside input).
- [ ] Unauth landing page: drawer shows only `publicOnLanding` guides; welcome modal never appears.
- [ ] `/api/guides/state` returns 401 for anonymous, JSON for authenticated.

- [ ] **Step 5: Prisma migration status**

```bash
npx prisma migrate status
```

Expected: all migrations applied, no pending, no failed.

- [ ] **Step 6: Commit final QA notes (if any tweaks were needed)**

If any tweaks were applied during QA:

```bash
git add -A
git commit -m "$(cat <<'EOF'
fix(web): QA polish for usage guide system

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Summary**

Plan complete. Summary for PR description:
- ~22 commits across 5 phases.
- 2 Prisma fields added, 1 API route, 8 new components, 10 guide content files, i18n for en + zh.
- Zero new top-level deps.
- First-run tour for new users + persistent `?` → drawer for returning users.
- 10 guides covering all key features, with Play (spotlight) and Read (in-drawer text) modes.

---

## Self-Review

This plan was self-reviewed against the spec at `docs/superpowers/specs/2026-04-24-sparkflow-usage-guide-design.md`:

- **Spec §1 Goals** → Tasks 9, 7, 12–16 cover first-run + drawer + 10 guides.
- **Spec §2 Hybrid approach** → Task 9 (tour) + Task 7 (drawer) + Task 10 (per-guide playback) + Task 17 (Read mode).
- **Spec §3 Architecture** → Tasks 4 (Provider), 5 (Spotlight), 7 (Drawer), 8 (mount), 9 (Tour), 10 (Player).
- **Spec §4 Data model** → Task 1 adds two fields; Task 3 reads/writes via PATCH.
- **Spec §5 Content structure** → Task 2 types; Tasks 12–16 content.
- **Spec §6 Tour flow** → Tasks 9 + 10 + 21 (welcome, steps, skip toast, resume).
- **Spec §7 Drawer UX** → Tasks 7 + 17 + 18 (shell, Read mode, shortcut).
- **Spec §8 Tech choices** → verified: no new deps, Radix + Framer + lucide only.
- **Spec §9 File layout** → Tasks produce exactly the paths listed.
- **Spec §10 Success criteria** → Task 22 verifies bundle size, i18n, migration, walkthrough.
- **Spec §12 Open items** — resolved in plan:
  - Anchor component paths → Task 11 discovers and attaches via `rg` searches.
  - Feature flag for rollout → **not gated**; ship directly (low-risk additive UI).
  - Mobile `?` placement → right-5 bottom-5 + bottom-sheet fallback (Task 19).
  - GIFs in Read mode → **deferred to v2**; v1 is text only (keeps scope tight).
  - Landing visitors see guides → Task 20 adds `publicOnLanding` + 3 guides exposed.

No TBDs. Type consistency verified: every `useGuides()` caller, every guide's `titleKey`/`bodyKey`, every i18n key referenced in code matches keys added in messages/*.json under `guides.*` namespace. `GUIDES` export shape is consistent across Tasks 7, 12, 13, 14, 15, 16, 20.
