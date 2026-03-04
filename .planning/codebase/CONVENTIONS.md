# Coding Conventions

**Analysis Date:** 2026-03-03

## Naming Patterns

**Files:**
- PascalCase for components and pages: `ChatMessages.tsx`, `DeepdivePage.tsx`
- kebab-case for routes and API endpoints: `/api/chat/messages`, `/deepdive/[id]`
- camelCase for utility functions: `cn()`, `injectSourcesContext()`
- snake_case for Python files and variables: `rag_agent.py`, `query_optimizer.py`
- UPPER_SNAKE_CASE for constants: `RAG_AGENT_CONFIG`, `DATABASE_URL`

**Functions:**
- camelCase for TypeScript functions: `getUserNotebooks()`, `handleChatSession()`
- snake_case for Python functions: `explore()`, `optimize_query()`
- Async functions prefixed with `async`: `async function getData()`
- Event handlers prefixed with `on`: `handleSubmit()`, `onChange()`

**Variables:**
- camelCase for TypeScript: `userId`, `chatSession`, `notebookId`
- snake_case for Python: `user_id`, `chat_session`, `notebook_id`
- Descriptive names: `lastMessage` not `lm`
- Constants in UPPER_SNAKE_CASE: `API_BASE_URL`, `MAX_RETRIES`

**Types:**
- PascalCase for TypeScript interfaces/types: `ChatMessage`, `Notebook`, `User`
- Interface names prefixed with `I` (optional): `IChatSession`
- Generic type parameters: `T`, `K`, `V`

## Code Style

**Formatting:**
- Prettier with default configuration
- 2-space indentation
- Semicolons: Always include
- Quotes: Use double quotes (`"`)
- Trailing commas: Only in multi-line structures

**Linting:**
- ESLint with Next.js configuration
- TypeScript strict mode enabled
- React hooks rules enforced
- No unused variables or imports

**TypeScript Configuration:**
- Target: ES2017
- Module: esnext
- Strict mode: true
- Path aliases: `@/*` maps to root
- JSX: react-jsx

## Import Organization

**Order:**
1. Third-party imports (external libraries)
2. Internal imports (relative paths)
3. Type imports (at the end)

**Example:**
```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import type { ChatMessage } from "@/types/database";
```

**Path Aliases:**
- `@/` - Root directory
- `@/lib/` - Utility libraries
- `@/components/` - React components
- `@/app/` - Next.js app directory

## Error Handling

**API Routes:**
```typescript
try {
  // Operation
} catch (error) {
  console.error("Operation error:", error);
  return new Response("Internal server error", { status: 500 });
}
```

**Database Operations:**
```typescript
try {
  const result = await prisma.model.create({ data });
  return NextResponse.json(result);
} catch (error) {
  console.error("Database error:", error);
  return NextResponse.json({ error: "Failed to create" }, { status: 500 });
}
```

**Validation:**
```typescript
if (!name?.trim()) {
  return NextResponse.json({ error: "Name is required" }, { status: 400 });
}
```

## Logging

**Framework:** Console logging
**Patterns:**
- Error logging: `console.error("Context:", error)`
- Info logging: `console.log("Processing:", id)`
- Debug logging: Minimal, removed in production
- Structured logging with context when helpful

## Comments

**When to Comment:**
- Complex business logic
- Unusual implementation decisions
- TODO items for future improvements
- Public API documentation

**JSDoc/TSDoc:**
```typescript
/**
 * Creates a new chat session for a notebook
 * @param notebookId - The notebook ID
 * @param userId - The user ID
 * @returns The created chat session
 */
async function createChatSession(notebookId: string, userId: string) {
  // Implementation
}
```

## Function Design

**Size:**
- Keep functions under 50 lines
- Single responsibility per function
- Break down complex logic into smaller functions

**Parameters:**
- Limit to 3-5 parameters
- Use objects for multiple related parameters
- Optional parameters at the end

**Return Values:**
- Always return consistent types
- Use `void` for functions that don't return
- Prefer throwing errors over returning null

## Module Design

**Exports:**
- Named exports for utilities
- Default exports for components and pages
- Barrel files for clean imports

**Example:**
```typescript
// lib/utils.ts
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString();
}
```

**Database Schema:**
- Model names PascalCase: `ChatSession`, `Notebook`
- Field names camelCase: `messageOrder`, `lastActivity`
- Relations clearly defined with comments

---

*Convention analysis: 2026-03-03*