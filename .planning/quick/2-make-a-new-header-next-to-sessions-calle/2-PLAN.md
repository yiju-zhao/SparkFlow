---
phase: quick-2
plan: 02
type: execute
wave: 1
depends_on: []
files_modified: []
autonomous: true
requirements: []
must_haves:
  truths:
    - "User can see 'toolbox' link in the explore navigation next to sessions"
    - "User can visit /explore/toolbox to see the toolbox landing page"
    - "User can access query matcher from /explore/toolbox/matcher"
  artifacts:
    - path: "apps/web/app/explore/nav-links.tsx"
      provides: "Navigation with toolbox link"
      contains: "toolbox"
    - path: "apps/web/app/explore/toolbox/page.tsx"
      provides: "Toolbox landing page"
    - path: "apps/web/app/explore/toolbox/matcher/page.tsx"
      provides: "Query matcher page"
  key_links:
    - from: "apps/web/app/explore/nav-links.tsx"
      to: "/explore/toolbox"
      via: "Link href"
    - from: "apps/web/app/explore/toolbox/page.tsx"
      to: "/explore/toolbox/matcher"
      via: "Link href"
---

<objective>
Verify that the toolbox section, toolbox page design, and query matcher relocation have already been completed in quick task 1.

Purpose: Confirm the requested work is already done and no additional changes are needed.
Output: Verification that all requirements are met.
</objective>

<execution_context>
@/Users/eason/.claude/get-shit-done/workflows/execute-plan.md
@/Users/eason/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

## Already Completed Work

**Quick Task 1 (1-create-toolbox-section-and-move-query-ma)** completed on 2026-03-04:

1. **Toolbox header in navigation** - Added to `nav-links.tsx`:
   ```typescript
   { href: "/explore/toolbox", label: "toolbox" }
   ```

2. **Toolbox landing page** - Created at `apps/web/app/explore/toolbox/page.tsx`:
   - Breadcrumb: `~/research-hub/toolbox`
   - Title: "Toolbox"
   - Description: "Utility tools for data processing and analysis"
   - Tool cards grid with Query Matcher card

3. **Query Matcher moved** - Relocated from `/explore/matcher` to `/explore/toolbox/matcher`:
   - All 9 matcher files moved
   - Routes updated in matcher-wizard.tsx
   - Old directory removed

**Reference:** See `.planning/quick/1-create-toolbox-section-and-move-query-ma/1-SUMMARY.md`
</context>

<tasks>

<task type="auto">
  <name>Task 1: Verify all requirements are already met</name>
  <files></files>
  <action>
    Verify that the following already exist in the codebase:

    1. Check `apps/web/app/explore/nav-links.tsx` contains toolbox link:
       - Should have `{ href: "/explore/toolbox", label: "toolbox" }` after sessions

    2. Check `apps/web/app/explore/toolbox/page.tsx` exists:
       - Should render a landing page with tool cards
       - Should have Query Matcher card linking to `/explore/toolbox/matcher`

    3. Check `apps/web/app/explore/toolbox/matcher/page.tsx` exists:
       - Query matcher should be accessible at the new location

    4. Verify old `/explore/matcher` directory does NOT exist

    No code changes required - this is a verification task.
  </action>
  <verify>
    <automated>grep -q '"toolbox"' apps/web/app/explore/nav-links.tsx && test -f apps/web/app/explore/toolbox/page.tsx && test -f apps/web/app/explore/toolbox/matcher/page.tsx && ! test -d apps/web/app/explore/matcher && echo "All requirements verified"</automated>
  </verify>
  <done>All requested features (toolbox header, toolbox page, query matcher in toolbox) confirmed present</done>
</task>

</tasks>

<verification>
- Check nav-links.tsx has toolbox entry
- Check toolbox/page.tsx exists and has proper structure
- Check toolbox/matcher/page.tsx exists
- Confirm old /explore/matcher directory is removed
</verification>

<success_criteria>
- Toolbox link visible in explore navigation (DONE)
- /explore/toolbox renders landing page with tool cards (DONE)
- /explore/toolbox/matcher renders query matcher wizard (DONE)
- Old /explore/matcher directory removed (DONE)
</success_criteria>

<output>
After completion, create `.planning/quick/2-make-a-new-header-next-to-sessions-calle/2-SUMMARY.md`
</output>
