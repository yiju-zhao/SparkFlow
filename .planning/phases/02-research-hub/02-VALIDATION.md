---
phase: 2
slug: research-hub
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-11
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (frontend) + pytest (Python MCP server) |
| **Config file** | `apps/web/vitest.config.ts` + `apps/mcp-server/pytest.ini` |
| **Quick run command** | `npm run test -- --run` (frontend) / `pytest -x` (mcp-server) |
| **Full suite command** | `npm run test -- --run && cd apps/mcp-server && pytest` |
| **Estimated runtime** | ~10 seconds (unit), ~30 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `npm run test -- --run` (frontend) or `pytest -x` (mcp-server)
- **After every plan wave:** Run full suite
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | - | unit | `vitest run delete-old-files.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | GENUI-01, GENUI-04 | unit | `pytest tests/test_mcp_server.py -x` | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 1 | GENUI-02, GENUI-03, GENUI-06 | unit | `pytest tests/test_ui_templates.py -x` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 2 | GENUI-05 | unit | `vitest run mcp-middleware.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 2 | GENUI-05 | unit | `vitest run copilotkit-route.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-03 | 02 | 2 | GENUI-01 | unit | `vitest run research-assistant-panel.test.tsx` | ❌ W0 | ⬜ pending |
| 02-02-04 | 02 | 2 | GENUI-05, GENUI-06 | e2e | `playwright test ai-chat.spec.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

### Frontend (apps/web)
- [ ] `vitest.config.ts` — Vitest configuration with React Testing Library
- [ ] `apps/web/tests/setup.ts` — Test setup with jsdom environment
- [ ] `apps/web/tests/mcp-middleware.test.ts` — MCPAppsMiddleware integration tests
- [ ] `apps/web/tests/copilotkit-route.test.ts` — CopilotKit route tests
- [ ] `apps/web/tests/components/research-assistant-panel.test.tsx` — Panel component tests
- [ ] `apps/web/tests/e2e/ai-chat.spec.ts` — E2E AI chat flow tests

### Python MCP Server (apps/mcp-server)
- [ ] `apps/mcp-server/pytest.ini` — pytest configuration
- [ ] `apps/mcp-server/tests/conftest.py` — Shared fixtures (test DB, mock MCP client)
- [ ] `apps/mcp-server/tests/test_mcp_server.py` — MCP server and SQLDatabaseToolkit tests
- [ ] `apps/mcp-server/tests/test_ui_templates.py` — HTML template rendering tests
- [ ] Framework install: `pip install pytest pytest-asyncio pytest-cov` (add to requirements.txt)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| AI generates correct chart from natural language | GENUI-03 | Requires LLM + real data | Ask AI "Show me sessions by topic as a pie chart" - verify chart renders correctly |
| Table row click navigates to detail page | GENUI-06 | Requires full app context | Click row in generated table - verify navigation to session detail |
| Context-aware suggestions update on page change | GENUI-01 | Requires route changes | Navigate from hub to conference detail - verify suggestions change |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
