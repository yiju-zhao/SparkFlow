---
phase: quick-1
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/app/explore/nav-links.tsx
  - apps/web/app/explore/toolbox/page.tsx
  - apps/web/app/explore/toolbox/matcher/page.tsx
  - apps/web/app/explore/toolbox/matcher/components/matcher-wizard.tsx
  - apps/web/app/explore/toolbox/matcher/components/file-dropzone.tsx
  - apps/web/app/explore/toolbox/matcher/components/query-preview-table.tsx
  - apps/web/app/explore/toolbox/matcher/components/steps/upload-step.tsx
  - apps/web/app/explore/toolbox/matcher/components/steps/config-step.tsx
  - apps/web/app/explore/toolbox/matcher/components/steps/preview-step.tsx
  - apps/web/app/explore/toolbox/matcher/components/steps/running-step.tsx
  - apps/web/app/explore/toolbox/matcher/components/steps/results-step.tsx
  - apps/web/app/explore/page.tsx
autonomous: true
requirements: []
must_haves:
  truths:
    - "User can see 'toolbox' link in the explore navigation next to sessions"
    - "User can visit /explore/toolbox to see the toolbox landing page"
    - "User can access query matcher from /explore/toolbox/matcher"
    - "Query matcher works exactly as before after the move"
  artifacts:
    - path: "apps/web/app/explore/nav-links.tsx"
      provides: "Navigation with toolbox link"
      contains: "toolbox"
    - path: "apps/web/app/explore/toolbox/page.tsx"
      provides: "Toolbox landing page"
      min_lines: 30
    - path: "apps/web/app/explore/toolbox/matcher/page.tsx"
      provides: "Query matcher page at new location"
  key_links:
    - from: "apps/web/app/explore/nav-links.tsx"
      to: "/explore/toolbox"
      via: "Link href"
    - from: "apps/web/app/explore/toolbox/page.tsx"
      to: "/explore/toolbox/matcher"
      via: "Link href"
---

<objective>
Create a new "toolbox" section in the explore area and relocate the query matcher tool from `/explore/matcher` to `/explore/toolbox/matcher`.

Purpose: Organize tools under a dedicated section for better navigation structure.
Output: Toolbox landing page, relocated query matcher, updated navigation.
</objective>

<execution_context>
@/Users/eason/.claude/get-shit-done/workflows/execute-plan.md
@/Users/eason/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

## Current Structure

**Navigation (apps/web/app/explore/nav-links.tsx):**
- conferences
- publications
- sessions

**Current matcher location:** `/explore/matcher`
**Target location:** `/explore/toolbox/matcher`

**Matcher files to relocate:**
- `apps/web/app/explore/matcher/page.tsx`
- `apps/web/app/explore/matcher/components/matcher-wizard.tsx`
- `apps/web/app/explore/matcher/components/file-dropzone.tsx`
- `apps/web/app/explore/matcher/components/query-preview-table.tsx`
- `apps/web/app/explore/matcher/components/steps/upload-step.tsx`
- `apps/web/app/explore/matcher/components/steps/config-step.tsx`
- `apps/web/app/explore/matcher/components/steps/preview-step.tsx`
- `apps/web/app/explore/matcher/components/steps/running-step.tsx`
- `apps/web/app/explore/matcher/components/steps/results-step.tsx`
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add toolbox to navigation and create toolbox landing page</name>
  <files>apps/web/app/explore/nav-links.tsx, apps/web/app/explore/toolbox/page.tsx</files>
  <action>
    1. Update `apps/web/app/explore/nav-links.tsx`:
       - Add new entry: `{ href: "/explore/toolbox", label: "toolbox" }`
       - Place it after sessions in the navLinks array

    2. Create `apps/web/app/explore/toolbox/page.tsx`:
       - Follow the existing design patterns from other explore pages
       - Include breadcrumb: `~/research-hub/toolbox`
       - Add title: "Toolbox"
       - Add description: "Utility tools for data processing and analysis"
       - Create a grid of tool cards (similar to the "Quick Tools" section currently on explore page)
       - Include one card for "Query Matcher" linking to `/explore/toolbox/matcher`
         - Use `FileSearch` icon from lucide-react
         - Title: "Query Matcher"
         - Description: "Match queries against conference sessions or publications using semantic search"
       - Use the same card styling as the current tools section on the explore page (border, hover effects, etc.)
  </action>
  <verify>
    <automated>npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 | head -20</automated>
  </verify>
  <done>Navigation shows toolbox link, /explore/toolbox renders a landing page with Query Matcher card</done>
</task>

<task type="auto">
  <name>Task 2: Move query matcher to toolbox directory</name>
  <files>
    apps/web/app/explore/toolbox/matcher/page.tsx,
    apps/web/app/explore/toolbox/matcher/components/matcher-wizard.tsx,
    apps/web/app/explore/toolbox/matcher/components/file-dropzone.tsx,
    apps/web/app/explore/toolbox/matcher/components/query-preview-table.tsx,
    apps/web/app/explore/toolbox/matcher/components/steps/upload-step.tsx,
    apps/web/app/explore/toolbox/matcher/components/steps/config-step.tsx,
    apps/web/app/explore/toolbox/matcher/components/steps/preview-step.tsx,
    apps/web/app/explore/toolbox/matcher/components/steps/running-step.tsx,
    apps/web/app/explore/toolbox/matcher/components/steps/results-step.tsx
  </files>
  <action>
    1. Create the new directory structure and move all files:
       - Move `apps/web/app/explore/matcher/page.tsx` to `apps/web/app/explore/toolbox/matcher/page.tsx`
       - Move `apps/web/app/explore/matcher/components/*.tsx` to `apps/web/app/explore/toolbox/matcher/components/`
       - Move `apps/web/app/explore/matcher/components/steps/*.tsx` to `apps/web/app/explore/toolbox/matcher/components/steps/`

    2. Update `matcher-wizard.tsx`:
       - Change cancel/redirect route from `/explore` to `/explore/toolbox`

    3. After verifying the move is complete, remove the old `apps/web/app/explore/matcher/` directory
  </action>
  <verify>
    <automated>ls -la apps/web/app/explore/toolbox/matcher/ && ls apps/web/app/explore/matcher/ 2>&1 || echo "Old directory removed successfully"</automated>
  </verify>
  <done>Query matcher accessible at /explore/toolbox/matcher, old /explore/matcher directory removed</done>
</task>

<task type="auto">
  <name>Task 3: Update explore page to link to toolbox section</name>
  <files>apps/web/app/explore/page.tsx</files>
  <action>
    Update `apps/web/app/explore/page.tsx`:
    - Remove the entire "Quick Tools" section (lines 58-79) since the toolbox now has its own dedicated page
    - The Query Matcher tool is now accessible via the navigation link to /explore/toolbox
    - This simplifies the explore overview page to focus on stats, analytics, and recent conferences
  </action>
  <verify>
    <automated>npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 | head -20</automated>
  </verify>
  <done>Explore page no longer has Quick Tools section, users access tools via navigation</done>
</task>

</tasks>

<verification>
- Navigate to /explore/toolbox - should show landing page with Query Matcher card
- Navigate to /explore/toolbox/matcher - should show the query matcher wizard
- Check navigation - toolbox link should appear after sessions
- Old /explore/matcher route should return 404
</verification>

<success_criteria>
- Toolbox link visible in explore navigation
- /explore/toolbox renders landing page with tool cards
- /explore/toolbox/matcher renders query matcher wizard
- Query matcher functions identically to before
- Old /explore/matcher directory removed
- Explore overview page simplified (no Quick Tools section)
</success_criteria>

<output>
After completion, create `.planning/quick/1-create-toolbox-section-and-move-query-ma/1-SUMMARY.md`
</output>
