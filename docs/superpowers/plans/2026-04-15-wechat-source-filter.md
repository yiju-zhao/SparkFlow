# WeChat Source Filter Setting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Settings page option to exclude specific WeChat public account sources from the Add Source modal's WeChat article search.

**Architecture:** Store an array of excluded WeChat source IDs in `UserSettings` (Prisma). The Settings page fetches available sources from `/api/wechat/sources` and renders a checklist (all checked by default). When the Add Source modal searches WeChat articles, the search API reads the user's excluded list and adds a `NOT IN` SQL filter. Empty list = search all sources.

**Tech Stack:** Prisma (schema + migration), Next.js API routes, React (settings form), PostgreSQL (raw SQL in wechat-client)

---

### Task 1: Add `wechatExcludedSourceIds` to Prisma schema

**Files:**
- Modify: `apps/web/prisma/schema.prisma:70` (inside `UserSettings` model)

- [ ] **Step 1: Add the field to UserSettings**

In `apps/web/prisma/schema.prisma`, add a new field after the `apiKeys` line (line 70):

```prisma
  // WeChat — excluded source IDs for Add Source search (empty = all)
  wechatExcludedSourceIds Int[]   @default([])
```

- [ ] **Step 2: Generate Prisma client**

Run: `cd apps/web && npx prisma generate`
Expected: "Generated Prisma Client" success message.

- [ ] **Step 3: Push schema to dev database**

Run: `cd apps/web && npx prisma db push`
Expected: "Your database is now in sync with your Prisma schema." (adds column with empty array default — no data migration needed).

- [ ] **Step 4: Commit**

```bash
git add apps/web/prisma/schema.prisma
git commit -m "feat(settings): add wechatExcludedSourceIds field to UserSettings"
```

---

### Task 2: Update Settings API to handle `wechatExcludedSourceIds`

**Files:**
- Modify: `apps/web/app/api/settings/route.ts`

- [ ] **Step 1: Add field to GET response**

In the `GET` handler, add `wechatExcludedSourceIds` to the `select` object (after `apiKeys: true`):

```typescript
    select: {
      modelProvider: true,
      modelName: true,
      wikiModelProvider: true,
      wikiModelName: true,
      searchModelProvider: true,
      searchModelName: true,
      matcherModelProvider: true,
      matcherModelName: true,
      apiKeys: true,
      wechatExcludedSourceIds: true,
    },
```

And add it to the response JSON (after `apiKeyStatus`):

```typescript
    wechatExcludedSourceIds: settings?.wechatExcludedSourceIds || [],
```

- [ ] **Step 2: Handle field in POST handler**

In the `POST` handler, destructure the new field from the request body (add after `apiKeys: apiKeysUpdate`):

```typescript
    wechatExcludedSourceIds,
```

Add this block after the `updateData` assignments for model fields and before the API keys block:

```typescript
  if (wechatExcludedSourceIds !== undefined) {
    (updateData as any).wechatExcludedSourceIds = wechatExcludedSourceIds;
  }
```

Note: `updateData` is typed as `Record<string, string | null>` but Prisma accepts `Int[]` for this field. The cast is needed because the existing type is narrow. Alternatively, widen the type to `Record<string, unknown>` — follow whichever feels cleaner to you, but the cast works fine here since `upsert` accepts it.

Also add it to the `create` object in the `upsert` call:

```typescript
    create: {
      userId: session.user.id,
      modelProvider: modelProvider || defaults.provider,
      modelName: modelName || defaults.chatModel,
      wikiModelProvider: wikiModelProvider || defaults.provider,
      wikiModelName: wikiModelName || defaults.wikiModel,
      searchModelProvider: searchModelProvider || defaults.provider,
      searchModelName: searchModelName || defaults.searchModel,
      matcherModelProvider: matcherModelProvider || defaults.provider,
      matcherModelName: matcherModelName || defaults.matcherModel,
      ...(updateData.apiKeys ? { apiKeys: updateData.apiKeys as string } : {}),
      ...(wechatExcludedSourceIds ? { wechatExcludedSourceIds } : {}),
    },
```

And add the field to the POST response JSON:

```typescript
    wechatExcludedSourceIds: settings.wechatExcludedSourceIds,
```

- [ ] **Step 3: Verify the API works**

Run the dev server (`npm run dev` in `apps/web`), then test:

```bash
# GET should return wechatExcludedSourceIds: []
curl -s http://localhost:3001/api/settings -H "Cookie: <session>" | jq .wechatExcludedSourceIds

# POST should accept and persist the array
curl -s -X POST http://localhost:3001/api/settings \
  -H "Content-Type: application/json" \
  -H "Cookie: <session>" \
  -d '{"wechatExcludedSourceIds": [1, 3]}' | jq .wechatExcludedSourceIds
```

Expected: `[]` for GET, `[1, 3]` for POST.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/settings/route.ts
git commit -m "feat(settings): expose wechatExcludedSourceIds in settings API"
```

---

### Task 3: Add `excludedSourceIds` parameter to `searchWechatArticles`

**Files:**
- Modify: `apps/web/lib/services/wechat-client.ts`

- [ ] **Step 1: Add optional parameter and SQL filter**

Update the `searchWechatArticles` function signature and query:

```typescript
export async function searchWechatArticles(
  query: string,
  limit = 10,
  excludedSourceIds: number[] = [],
): Promise<WechatArticle[]> {
  if (!wechatPool) return [];

  const conditions = ["(a.title ILIKE $1 OR a.content_text ILIKE $1)"];
  const params: (string | number | number[])[] = [`%${query}%`];
  let paramIndex = 2;

  if (excludedSourceIds.length > 0) {
    conditions.push(`a.source_id != ALL($${paramIndex})`);
    params.push(excludedSourceIds);
    paramIndex++;
  }

  params.push(limit);

  const result = await wechatPool!.query<WechatArticle>(
    `SELECT a.id, a.title, a.author, a.publish_time, a.original_url,
            a.cover_url, a.content_html, a.content_text, s.name as source_name
     FROM wechat_articles.articles a
     JOIN wechat_articles.sources s ON a.source_id = s.id
     WHERE ${conditions.join(" AND ")}
     ORDER BY a.publish_time DESC NULLS LAST
     LIMIT $${paramIndex}`,
    params,
  );
  return result.rows;
}
```

The key SQL addition: `a.source_id != ALL($N)` with a PostgreSQL array parameter — this excludes rows whose `source_id` is in the provided array. When `excludedSourceIds` is empty, the condition is not added at all (search all).

- [ ] **Step 2: Commit**

```bash
git add apps/web/lib/services/wechat-client.ts
git commit -m "feat(wechat): add excludedSourceIds filter to searchWechatArticles"
```

---

### Task 4: Wire up the search route to read user's excluded sources

**Files:**
- Modify: `apps/web/app/api/notebooks/[id]/sources/search/route.ts`

- [ ] **Step 1: Read excluded source IDs from user settings**

In the `POST` handler, the code already fetches `userSettings` for search model preferences (around line 42). Expand the `select` to include `wechatExcludedSourceIds`:

```typescript
  const userSettings = await prisma.userSettings.findUnique({
    where: { userId: session.user.id },
    select: {
      searchModelProvider: true,
      searchModelName: true,
      wechatExcludedSourceIds: true,
    },
  });
```

- [ ] **Step 2: Pass excluded IDs to `performSearch`**

Update the `performSearch` call to pass the excluded IDs:

```typescript
  const wechatExcludedSourceIds = userSettings?.wechatExcludedSourceIds || [];

  performSearch(taskId, query, sourceType, domains, searchModelProvider, searchModelName, wechatExcludedSourceIds).catch((err) => {
```

Update the `performSearch` function signature:

```typescript
async function performSearch(
  taskId: string,
  query: string,
  sourceType: string,
  domains?: string[],
  modelProvider?: string,
  modelName?: string,
  wechatExcludedSourceIds: number[] = [],
) {
```

- [ ] **Step 3: Pass to `searchWechatArticles`**

In the `else if (sourceType === "wechat")` branch (around line 162), pass the excluded IDs:

```typescript
    } else if (sourceType === "wechat") {
      const articles = await searchWechatArticles(query, 10, wechatExcludedSourceIds);
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/notebooks/[id]/sources/search/route.ts
git commit -m "feat(search): filter WeChat results by user's excluded source IDs"
```

---

### Task 5: Add WeChat Sources checklist to Settings form

**Files:**
- Modify: `apps/web/components/settings/settings-form.tsx`
- Modify: `apps/web/messages/en.json`
- Modify: `apps/web/messages/zh.json`

- [ ] **Step 1: Add i18n strings**

In `apps/web/messages/en.json`, add inside the `"settings"` object (after `"aiModels"` block):

```json
    "wechatSources": {
      "title": "WeChat Sources",
      "subtitle": "Select which public accounts to include when searching for WeChat article sources",
      "selectAll": "Select All",
      "deselectAll": "Deselect All",
      "loading": "Loading sources...",
      "noSources": "No WeChat sources available",
      "saved": "WeChat source preferences saved"
    }
```

In `apps/web/messages/zh.json`, add the same key:

```json
    "wechatSources": {
      "title": "微信公众号来源",
      "subtitle": "选择搜索微信文章时要包含的公众号来源",
      "selectAll": "全选",
      "deselectAll": "取消全选",
      "loading": "加载来源中...",
      "noSources": "暂无可用的微信来源",
      "saved": "微信来源偏好已保存"
    }
```

- [ ] **Step 2: Add state and fetch logic to SettingsForm**

In `apps/web/components/settings/settings-form.tsx`, add a new interface for WeChat source:

```typescript
interface WechatSource {
  id: number;
  slug: string;
  name: string;
  description: string;
}
```

Add new state variables (after the API Keys state block around line 86):

```typescript
  // WeChat source filter
  const [wechatSources, setWechatSources] = useState<WechatSource[]>([]);
  const [wechatExcluded, setWechatExcluded] = useState<Set<number>>(new Set());
  const [wechatLoading, setWechatLoading] = useState(true);
  const [wechatSaving, setWechatSaving] = useState(false);
  const [wechatSaved, setWechatSaved] = useState(false);
```

In the existing `useEffect` `init` function, add fetches for WeChat sources and the user's excluded list. After `setApiKeyStatus(data.apiKeyStatus || {})`, add:

```typescript
          if (data.wechatExcludedSourceIds?.length) {
            setWechatExcluded(new Set(data.wechatExcludedSourceIds));
          }
```

Add a separate fetch for available WeChat sources (inside `init`, after the existing Promise.all):

```typescript
        // Fetch available WeChat sources
        try {
          const wechatRes = await fetch("/api/wechat/sources");
          if (wechatRes.ok) {
            const sources: WechatSource[] = await wechatRes.json();
            setWechatSources(sources);
          }
        } catch {
          // WeChat DB may not be configured
        } finally {
          setWechatLoading(false);
        }
```

- [ ] **Step 3: Add toggle and save handlers**

```typescript
  const handleToggleWechatSource = (sourceId: number) => {
    setWechatExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(sourceId)) {
        next.delete(sourceId);
      } else {
        next.add(sourceId);
      }
      return next;
    });
  };

  const handleSelectAllWechat = () => setWechatExcluded(new Set());
  const handleDeselectAllWechat = () =>
    setWechatExcluded(new Set(wechatSources.map((s) => s.id)));

  const handleSaveWechat = async () => {
    setWechatSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wechatExcludedSourceIds: Array.from(wechatExcluded),
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setWechatSaved(true);
      setTimeout(() => setWechatSaved(false), 2000);
    } catch (error) {
      console.error("Failed to save WeChat source preferences:", error);
    } finally {
      setWechatSaving(false);
    }
  };
```

- [ ] **Step 4: Add the WeChat Sources section UI**

Insert this JSX block between the "Save Settings" button `</div>` and the `{/* --- API Keys Section --- */}` comment. Only render if `wechatSources.length > 0` or still loading:

```tsx
      {/* --- WeChat Sources Section --- */}
      {(wechatLoading || wechatSources.length > 0) && (
        <div className="space-y-4">
          <div className="border-b pb-2">
            <h3 className="text-base font-semibold">WeChat Sources</h3>
            <p className="text-xs text-muted-foreground">
              Select which public accounts to include when searching for WeChat article sources
            </p>
          </div>

          {wechatLoading ? (
            <div className="flex items-center gap-2 py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Loading sources...</span>
            </div>
          ) : (
            <>
              {/* Select All / Deselect All */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={handleSelectAllWechat}
                >
                  Select All
                </button>
                <span className="text-xs text-muted-foreground">/</span>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={handleDeselectAllWechat}
                >
                  Deselect All
                </button>
              </div>

              {/* Source checklist */}
              <div className="space-y-1">
                {wechatSources.map((source) => {
                  const isIncluded = !wechatExcluded.has(source.id);
                  return (
                    <label
                      key={source.id}
                      className="flex items-center gap-3 py-2 px-1 rounded-lg hover:bg-accent/30 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={isIncluded}
                        onChange={() => handleToggleWechatSource(source.id)}
                        className="h-4 w-4 rounded border-muted-foreground/30"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium">{source.name}</span>
                        {source.description && (
                          <span className="text-xs text-muted-foreground ml-2">
                            {source.description}
                          </span>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>

              {/* Save button */}
              <div className="flex items-center gap-3 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSaveWechat}
                  disabled={wechatSaving}
                >
                  {wechatSaving ? (
                    <>
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      Saving...
                    </>
                  ) : wechatSaved ? (
                    <>
                      <Check className="mr-2 h-3.5 w-3.5" />
                      Saved
                    </>
                  ) : (
                    "Save Preferences"
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/settings/settings-form.tsx apps/web/messages/en.json apps/web/messages/zh.json
git commit -m "feat(settings): add WeChat source filter checklist to settings page"
```

---

### Task 6: Manual end-to-end verification

- [ ] **Step 1: Verify Settings page**

1. Open `http://localhost:3001/en/settings`
2. Scroll to the "WeChat Sources" section
3. Confirm all sources are listed and checked by default
4. Uncheck one source, click "Save Preferences", confirm "Saved" feedback appears
5. Refresh the page — the unchecked source should remain unchecked

- [ ] **Step 2: Verify search filtering**

1. Open a notebook's Add Source dialog
2. Switch to "WeChat Article" search type
3. Search for a term that has results from the excluded source
4. Confirm results from the excluded source do NOT appear
5. Go back to Settings, re-check the source, save
6. Repeat the search — results from that source should now appear

- [ ] **Step 3: Verify empty selection = all**

1. In Settings, click "Deselect All", save
2. Search in Add Source modal — should return nothing (all excluded)
3. Click "Select All", save — should return results from all sources
4. Alternatively: remove the setting row entirely from DB — should return all results (default behavior)

- [ ] **Step 4: Type check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors.
