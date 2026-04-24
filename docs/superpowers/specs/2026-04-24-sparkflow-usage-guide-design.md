# SparkFlow Usage Guide — Design

**Date:** 2026-04-24
**Status:** Approved (brainstorming phase complete)
**Next step:** `writing-plans` to produce an implementation plan

---

## 1 · Problem & Goals

SparkFlow ships with five distinct surfaces (Landing, DeepDive, Explore, Settings, Admin) and a growing feature set (notebooks, batch source upload, RAG chat, auto-generated wiki, notes, conference discovery, matcher, WeChat articles, BYOK, theme/language switch). There is **no onboarding, tour, tooltip, or help-center component** today. New users have no guided path, and returning users have no way to re-discover features they never found the first time.

**Goals**
- Give new users a short guided path to their first successful "aha" moment.
- Let returning users find and re-learn features on demand, without leaving the product.
- Keep the system maintainable: content lives with the code, no new heavy dependencies, i18n uses the existing `next-intl` pipeline.

**Non-goals**
- A CMS or admin UI for editing guide content.
- Analytics / A/B testing on guide engagement (can be added later).
- Full help-center site with SEO pages (out of scope; out-of-product docs live elsewhere).

---

## 2 · Approach Summary

A **hybrid** of two patterns, sharing a single underlying `<Spotlight />` primitive:

- **First-run tour** — auto-fires once for every new user. A 4-step spotlight walkthrough across real UI, covering the golden path: *create notebook → add source → configure BYOK → ask a question*. Dismissible at any step; stored as `tourCompletedAt` on the `User` model.
- **Persistent Guides drawer** — a floating `?` button pinned bottom-right on every `[locale]` route. Opens a right-side drawer listing **all 10 key features**, grouped into three categories. Each guide can run in either **Play mode** (navigates to the real page and replays the spotlight) or **Read mode** (expands inline step-by-step text with optional GIFs).

Rejected alternatives and why:
- **Pure full-screen modal tour** — hides the real UI; users learn steps but not where to find them.
- **Pure Help Center page** — separates learning from doing; high content cost, low in-context value.
- **Inline empty-state tips only** — no cohesive story for new users; features stay hidden until stumbled upon.
- **Shepherd.js / Driver.js** — known React 19 compatibility friction; we already have Radix Popover + Framer Motion in the bundle, which cover the needs.

---

## 3 · Architecture

```
[locale]/layout.tsx
  └─ <GuideProvider>   (context: session, completedAt, dismissedGuides)
       ├─ <GuideDrawer>      ← mounted always; controls the floating ? button
       ├─ <FirstRunTour>     ← mounts only when tourCompletedAt === null
       └─ <Spotlight />      ← portal; used by both tour and guide Play mode
```

- `<GuideProvider>` is a client component that reads session on mount, fetches the user's `tourCompletedAt` and `dismissedGuides[]` via a single `/api/guides/state` GET, and exposes:
  - `startTour()`, `skipTour()`, `completeTour()`
  - `playGuide(id)`, `dismissGuide(id)`
  - `isTourDue()`
- `<Spotlight />` is a portal that renders four masking `<div>`s (挖洞 overlay) plus a Radix `Popover` anchored to the highlighted `data-guide="…"` element. Framer Motion handles the transition between steps.
- DOM anchoring uses explicit `data-guide="…"` attributes on business components — **not** class names or ARIA labels — so refactors don't silently break the tour.

---

## 4 · Data Model

Additive migration on the existing `User` model — no new tables.

```prisma
model User {
  // ...existing fields
  tourCompletedAt  DateTime?
  dismissedGuides  String[]  @default([])
}
```

- `tourCompletedAt = null` → user is eligible for the first-run tour.
- Setting `tourCompletedAt = now` on **either** completion **or** skip closes the auto-trigger. A skip is still tracked in telemetry via a separate column if/when we add analytics later.
- `dismissedGuides[]` stores IDs for which the user chose "don't show again" in the drawer; those guides are hidden from the list (still reachable via search).
- Unauthenticated visitors (landing page) use `localStorage` under key `sparkflow.guides.state` with the same shape. Public guides shown on landing are a whitelist subset.

---

## 5 · Content Structure

One `.ts` file per guide, all registered through a single index. Text lives in `messages/{en,zh}.json` under the `guides.*` namespace.

```ts
// apps/web/content/guides/types.ts
export type GuideCategory = "deepdive" | "explore" | "account";

export interface GuideStep {
  selector: string;                 // '[data-guide="new-notebook-button"]'
  placement: "top" | "bottom" | "left" | "right";
  titleKey: string;                 // next-intl key
  bodyKey: string;
  action?: "click" | "hover" | "none";   // optional — guides user interaction
  route?: string;                   // optional — navigate before showing step
}

export interface GuideDefinition {
  id: string;                       // stable ID — never changes
  category: GuideCategory;
  icon: string;                     // lucide icon name
  titleKey: string;
  summaryKey: string;
  publicOnLanding?: boolean;        // default false
  includeInFirstRunTour?: boolean;  // default false
  firstRunTourOrder?: number;
  steps: GuideStep[];
}
```

```ts
// apps/web/content/guides/create-notebook.ts
export const createNotebookGuide: GuideDefinition = {
  id: "create-notebook",
  category: "deepdive",
  icon: "FolderPlus",
  titleKey: "guides.createNotebook.title",
  summaryKey: "guides.createNotebook.summary",
  includeInFirstRunTour: true,
  firstRunTourOrder: 1,
  steps: [/* … */],
};
```

```ts
// apps/web/content/guides/index.ts
export const GUIDES: GuideDefinition[] = [
  createNotebookGuide,
  addSourcesGuide,
  byokGuide,
  chatWithAiGuide,
  wikiGraphGuide,
  notesGuide,
  conferencesGuide,
  matcherGuide,
  wechatGuide,
  languageThemeGuide,
];
```

**Ten guides, three categories:**

| Category | Guide IDs |
|---|---|
| `deepdive` | create-notebook, add-sources, chat-with-ai, wiki-graph, notes |
| `explore`  | conferences, matcher, wechat |
| `account`  | byok-api-keys, language-theme |

**Four guides flagged `includeInFirstRunTour`:**
1. `create-notebook`
2. `add-sources`
3. `byok-api-keys` ← placed **before** chat so non-admin users don't hit a dead chat input
4. `chat-with-ai`

---

## 6 · First-Run Tour Flow

```
User logs in (first session after signup)
  │
  ├─ Layout reads tourCompletedAt
  │
  ├─ If null ─────────────────────────────────────────────────────────┐
  │                                                                    │
  │  Welcome modal (1 screen): "5-min tour of SparkFlow?"              │
  │      [Start tour]  [Skip for now]                                  │
  │                                                                    │
  │  Step 1  →  Navigate to /[locale]/deepdive                         │
  │             Highlight "+ New Notebook" button                      │
  │             On click OR [Next] → advance                           │
  │                                                                    │
  │  Step 2  →  After notebook created, highlight "Upload" button      │
  │             "Drop files / folders / URLs here — up to 50 at once"  │
  │             [Next] without requiring actual upload                 │
  │                                                                    │
  │  Step 3  →  Navigate to /[locale]/settings                         │
  │             Highlight API Keys section                             │
  │             "Add your own key (optional) — system key works too"   │
  │             [Skip] or [Add key] → advance                          │
  │                                                                    │
  │  Step 4  →  Navigate back to notebook                              │
  │             Highlight chat input                                   │
  │             "Ask anything about your sources"                      │
  │             [Finish] → tourCompletedAt = now                       │
  │                                                                    │
  │  At any step: [✕] → tourCompletedAt = now                          │
  │               (with toast: "Reopen anytime from the ? button")     │
  │                                                                    │
  └─ If not null → skip tour, render normally                          │
                                                                       │
  Edge: refresh mid-tour                                               │
    → localStorage holds { stepIndex, path } under                     │
      `sparkflow.tour.progress`; on next mount, resume if still due    │
```

**Edge cases covered**
- Mobile / small viewport → spotlight overlay degrades to a bottom-sheet with arrow pointing to the element (if visible) or textual reference ("tap the top-right menu").
- User navigates away mid-step → `sparkflow.tour.progress` remembers step; on return, modal asks "Resume tour?".
- Locale switch mid-tour → resumed step uses new locale's messages; no state reset.
- Admin vs non-admin → same tour for everyone; BYOK step explicitly says "optional for admins".

---

## 7 · Drawer UX

Right-side drawer, ~420px wide, slide-in from the right. Built with Radix `Dialog` (modal=false so the background stays scrollable) + Framer Motion.

```
┌─ 📖 Guides ─────────────────── ✕ ─┐
│                                   │
│  🔍  Search guides…               │
│                                   │
│  ▸ DeepDive                  (5)  │
│      📘 Create a notebook         │
│      📥 Add sources               │
│      💬 Chat with AI              │
│      🕸️  Wiki knowledge graph      │
│      📝 Notes                     │
│                                   │
│  ▸ Explore                   (3)  │
│      📊 Browse conferences        │
│      🎯 Matcher tool              │
│      💬 WeChat articles           │
│                                   │
│  ▸ Account                   (2)  │
│      🔑 Setup API key (BYOK)      │
│      🌐 Language & theme          │
│                                   │
│  ─────────────────────────────    │
│  ▶ Replay first-run tour          │
│  ⌕  Keyboard shortcut: ? then g   │
└───────────────────────────────────┘
```

**Interactions**
- Click a guide → expand in place showing a header with three actions: `▶ Play`, `📖 Read`, `✕ Don't show again`.
  - **Play**: closes drawer, navigates to `steps[0].route` if set, runs `<Spotlight />` through the steps with "X / N" counter and Next / Prev / Close.
  - **Read**: expands an accordion below the header listing each step with `titleKey` as the step heading and `bodyKey` as the body — no navigation, no spotlight.
  - **Don't show again**: pushes `id` to `dismissedGuides[]`; hides from category list but still available via search.
- Floating `?` button → bottom-right, 48×48, behind all toasts/modals.
- Keyboard: `?` then `g` from anywhere opens the drawer (shortcut shown at bottom).

---

## 8 · Technology Choices

| Concern | Choice | Why |
|---|---|---|
| Spotlight highlight | Hand-rolled (4 masking divs) | React 19 compat; no Shepherd.js dependency |
| Step tooltip | Radix `Popover` | Already a dep; handles positioning + a11y |
| Drawer container | Radix `Dialog` + Framer Motion | Already deps; consistent with the rest of the app |
| Content storage | `.ts` modules + next-intl keys | Type-safe; translation pipeline already wired |
| Persistence | Prisma `User` columns + localStorage fallback | Smallest possible migration |
| Trigger detection | Client hook `useFirstRunTour()` reading session | No new API needed beyond `/api/guides/state` |
| DOM anchoring | `data-guide="…"` attributes | Decouples from className; refactor-safe |
| Analytics | None in v1 | Out of scope; add later if needed |

---

## 9 · File & Directory Layout

```
apps/web/
├── app/
│   └── api/
│       └── guides/
│           └── state/route.ts          # GET/PATCH user's tourCompletedAt + dismissedGuides
├── components/
│   └── guides/
│       ├── guide-provider.tsx          # context + hooks
│       ├── guide-drawer.tsx            # right-side drawer
│       ├── guide-list-item.tsx         # per-guide item (Play / Read / Dismiss)
│       ├── first-run-tour.tsx          # orchestrates the 4-step tour
│       ├── spotlight.tsx               # portal + overlay + Popover
│       ├── floating-guide-button.tsx   # bottom-right `?` button
│       └── use-first-run-tour.ts
├── content/
│   └── guides/
│       ├── types.ts
│       ├── index.ts                    # exports GUIDES[]
│       ├── create-notebook.ts
│       ├── add-sources.ts
│       ├── chat-with-ai.ts
│       ├── wiki-graph.ts
│       ├── notes.ts
│       ├── conferences.ts
│       ├── matcher.ts
│       ├── wechat.ts
│       ├── byok-api-keys.ts
│       └── language-theme.ts
├── messages/
│   ├── en.json                         # + `guides.*` namespace
│   └── zh.json                         # + `guides.*` namespace
└── prisma/
    └── migrations/
        └── <timestamp>_add_user_tour_state/
            └── migration.sql
```

Business components that get new `data-guide="…"` anchors (not exhaustive — pinned down during implementation):
- New-notebook button (`apps/web/components/deepdive/notebook-list` or equivalent)
- Upload button (`apps/web/components/deepdive/.../upload-*`)
- Settings API Keys section (`apps/web/app/[locale]/settings/.../api-keys-*`)
- Chat input (`apps/web/components/deepdive/chat/.../input-*`)
- Matcher CTA, conference browser entry, wiki panel, notes panel, language/theme switch

Exact component paths will be confirmed during the implementation plan step.

---

## 10 · Success Criteria

- New user can reach their first AI answer from the welcome modal in **≤ 5 minutes** without reading external docs.
- All 10 key features are reachable from the drawer with **≤ 2 clicks** after opening.
- Zero new top-level dependencies added to `apps/web/package.json`.
- Bundle cost of the new code: **< 30 KB gzipped** (target; measured with `next build` before/after).
- `tsc --noEmit` and `npm run lint` pass; Prisma migration applies cleanly.
- en + zh translations exist for every `guides.*` key used by a rendered step.

---

## 11 · Effort Estimate

| Phase | Est. | Deliverable |
|---|---|---|
| Infrastructure | ~1d | `<GuideProvider>`, `<Spotlight>`, `<GuideDrawer>`, `<FloatingGuideButton>`, Prisma migration, `GET/PATCH /api/guides/state` |
| First-run tour | ~0.5d | `<FirstRunTour>` with 4-step flow + resume logic |
| 10 guide contents + i18n (en + zh) | ~2–3d | `content/guides/*.ts` + translation entries |
| Anchor audit (add `data-guide`) | ~0.5d | Sweep through business components |
| QA, responsive, edge cases | ~0.5d | Mobile bottom-sheet fallback; refresh-mid-tour; locale switch |
| **Total** | **~1 week** | |

---

## 12 · Open Items for Implementation Plan

- Exact component paths for each `data-guide` anchor.
- Whether to gate the tour behind a feature flag during rollout.
- Placement of the `?` floating button on mobile (may conflict with keyboard).
- Whether `Read` mode should support inline GIFs in v1 or defer to v2.
- Whether landing-page visitors should see any subset of guides (`publicOnLanding` flag exists; v1 content TBD).

The writing-plans step will resolve each of these.
