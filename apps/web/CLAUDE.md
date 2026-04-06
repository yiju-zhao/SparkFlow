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
│   ├── landing/            # Landing page components
│   ├── deepdive/           # Deepdive feature components
│   └── explore/            # Explore feature components
├── lib/                    # Utilities and clients
│   ├── auth.ts             # NextAuth configuration
│   ├── prisma.ts           # Prisma client singleton
│   └── hooks/              # Shared React hooks
└── hooks/                  # Global React hooks
```

### Next.js Conventions Used

- **Route groups `()`:** `(auth)` - groups routes without affecting URL
- **Dynamic routes `[]`:** `[id]` - URL params via `params` prop
- **Special files:** `page.tsx` (route), `layout.tsx` (wrapper), `loading.tsx` (suspense), `error.tsx` (error boundary)
- **Colocation:** Components inside route folders are safe - only `page.tsx`/`route.ts` are public

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

## Commit Messages

- Use conventional commits: `fix(scope): description` or `feat(scope): description`
- Include `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>` footer
