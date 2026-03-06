---
phase: 2
slug: research-hub
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-06
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (frontend) + Playwright (E2E) |
| **Config file** | `apps/web/vitest.config.ts` |
| **Quick run command** | `npm run test -- --run` |
| **Full suite command** | `npm run test -- --run && npm run test:e2e` |
| **Estimated runtime** | ~15 seconds (unit), ~60 seconds (E2E) |

---

## Sampling Rate

- **After every task commit:** Run `npm run test -- --run`
- **After every plan wave:** Run full suite
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | GENUI-01 | unit | `vitest run research-assistant.test.tsx` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | GENUI-05 | unit | `vitest run generative-components.test.tsx` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 1 | GENUI-02 | unit | `vitest run generative-table.test.tsx` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 1 | GENUI-03 | unit | `vitest run generative-chart.test.tsx` | ❌ W0 | ⬜ pending |
| 02-03-01 | 03 | 2 | GENUI-06 | e2e | `playwright test interaction.spec.ts` | ❌ W0 | ⬜ pending |
| 02-03-02 | 03 | 2 | GENUI-04 | e2e | `playwright test filtered-views.spec.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/web/__tests__/components/explore/research-assistant.test.tsx` — stubs for GENUI-01
- [ ] `apps/web/__tests__/components/explore/generative-table.test.tsx` — stubs for GENUI-02
- [ ] `apps/web/__tests__/components/explore/generative-chart.test.tsx` — stubs for GENUI-03
- [ ] `apps/web/e2e/generative-ui.spec.ts` — E2E stubs for GENUI-04/06
- [ ] `apps/web/vitest.config.ts` — ensure Vitest configured for component tests

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CopilotKit agent connection | GENUI-01 | Requires live LangGraph server | 1. Start agent server 2. Open hub 3. Ask AI question 4. Verify response streams |
| Chart visual rendering | GENUI-03 | Visual correctness hard to automate | 1. Generate chart 2. Verify colors match design system 3. Check hover interactions |
| Table navigation clicks | GENUI-06 | Navigation side effects | 1. Generate table with session data 2. Click row 3. Verify navigation to detail page |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
