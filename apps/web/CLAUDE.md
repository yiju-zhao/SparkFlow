# Frontend Conventions (apps/web)

## Project Structure

Follows Next.js 16 App Router conventions with colocation strategy:

```
apps/web/
├── app/                    # App Router - routes map to URL segments
│   ├── (auth)/             # Route group - auth pages share layout, not in URL
│   ├── admin/              # /admin/* - admin panel routes
│   ├── api/                # /api/* - API route handlers
│   ├── deepdive/           # /deepdive/* - notebook routes
│   │   └── [id]/           # Dynamic route: /deepdive/:id
│   ├── explore/            # /explore/* - main feature routes
│   │   ├── publications/   # Static + dynamic routes
│   │   │   └── [id]/       # /explore/publications/:id
│   │   └── sessions/
│   │       └── [id]/
│   ├── layout.tsx          # Root layout (wraps all routes)
│   ├── providers.tsx       # Global providers (theme, session)
│   ├── error.tsx           # Root error boundary
│   └── globals.css         # Global styles
├── components/             # Shared UI components (not routable)
│   ├── ui/                 # shadcn/ui primitives
│   ├── providers/          # Global context providers (theme, auth, CopilotKit)
│   ├── landing/            # Landing page components
│   ├── settings/           # Settings form (model selection, API key management)
│   ├── deepdive/           # Deepdive feature components
│   │   ├── chat/           # Chat panel (CopilotKit integration)
│   │   ├── studio/         # Studio/canvas panel
│   │   ├── wiki/           # Wiki panel, graph-view (force-directed), health-check
│   │   └── sources/        # Source upload and management
│   └── explore/            # Explore feature components
│       ├── toolbox/matcher/ # Query matching UI
│       └── shared/         # Pagination, filters, stats
├── lib/                    # Utilities and clients
│   ├── auth.ts             # NextAuth configuration
│   ├── prisma.ts           # Prisma client singleton
│   ├── crypto.ts           # BYOK key encryption/decryption
│   ├── types/providers.ts  # LLM provider definitions
│   ├── services/           # Backend services
│   │   ├── api-key-resolver.ts  # BYOK key resolution (user → admin fallback)
│   │   ├── wiki-ingest.ts       # Wiki knowledge graph extraction pipeline
│   │   ├── graph-service.ts     # Graph operations + Louvain clustering
│   │   └── wiki-health.ts       # Wiki health monitoring
│   └── hooks/              # Shared React hooks
└── hooks/                  # Global React hooks
```

### Next.js Conventions Used

- **Route groups `()`:** `(auth)` - groups routes without affecting URL
- **Dynamic routes `[]`:** `[id]` - URL params via `params` prop
- **Special files:** `page.tsx` (route), `layout.tsx` (wrapper), `loading.tsx` (suspense), `error.tsx` (error boundary)
- **Colocation:** Components inside route folders are safe - only `page.tsx`/`route.ts` are public

### Deepdive Notebook Layout

The deepdive workspace (`/deepdive/[id]`) is a multi-panel layout:
- **Left**: Sources panel (upload, manage documents)
- **Center**: Chat panel (CopilotKit with LangGraph RAG agent)
- **Right**: Tabbed panel with Wiki (knowledge graph + pages) and Notes

### When to Use Private Folders

Prefix with underscore `_components` or `_lib` inside `app/` for:
- Route-specific utilities that shouldn't be routable
- Avoiding naming conflicts with Next.js special files

## Commands

```bash
npm run dev              # Start dev server on port 3001
npm run build            # Production build
npx prisma generate      # After schema changes
npx prisma db push       # Sync schema to DB (dev)
```

## CopilotKit

- Use `useCopilotChatInternal()` hook for chat state with non-deprecated APIs
- Import `Message` type from `@copilotkit/shared` for type safety
- Create messages with `{ id: uuidv4(), role: "user", content: "..." } as Message` format
- Example:
  ```typescript
  import { useCopilotChatInternal } from "@copilotkit/react-core";
  import type { Message } from "@copilotkit/shared";

  const { messages, sendMessage, reset, isLoading } = useCopilotChatInternal();

  await sendMessage({ id: uuidv4(), role: "user", content: "Hello" } as Message);
  ```

## React Patterns

- Avoid `setState` inside `useEffect` - causes cascading render warnings
- Move state updates to event handlers instead (e.g., `handleClose` function)
- Reset CopilotKit state on panel close: call `reset()`, then `setThreadId(uuidv4())`

## UUID Generation

- Use `import { v4 as uuidv4 } from "uuid"` - NOT `crypto.randomUUID()`
- `crypto.randomUUID()` requires secure context (HTTPS/localhost) and isn't supported in all browsers

## Tailwind 4

- Use standard spacing classes instead of arbitrary pixel values
- Conversion: `px * 0.25 = Tailwind units` (e.g., `max-w-[280px]` → `max-w-70`)
- Common conversions:
  - `w-[180px]` → `w-45`
  - `h-[300px]` → `h-75`
  - `max-h-[420px]` → `max-h-105`
  - `min-h-[300px]` → `min-h-75`

## Wiki Components

- `wiki-panel.tsx` — Main wiki viewer, renders page list + single page content
- `graph-view.tsx` — Force-directed graph using `react-force-graph-2d` + `graphology`; responds to panel resize via ResizeObserver
- `health-check.tsx` — Displays orphan/missing/stale entity counts
- Wiki pages support `[[wiki-links]]` syntax — rendered as clickable links in chat responses

## Commit Messages

- Use conventional commits: `fix(scope): description` or `feat(scope): description`
- Include `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>` footer
