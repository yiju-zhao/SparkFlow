# Codebase Concerns

**Analysis Date:** 2026-03-03

## Tech Debt

**Missing Test Suite:**
- Issue: No test files found in the entire codebase
- Files: No *.test.*, *.spec.* files present
- Impact: No safety net for refactoring, high risk of introducing bugs
- Fix approach: Implement Jest/React Testing Library for frontend, pytest for backend, start with critical path tests

**Hardcoded Environment Fallbacks:**
- Issue: Default values for critical services could mask configuration issues
- Files: `apps/web/lib/ragflow-client.ts`, `apps/web/lib/s3-client.ts`, `apps/agent/tools/ragflow.py`
- Impact: May hide missing environment variables, potentially using development values in production
- Fix approach: Validate environment variables on app startup, throw clear errors if required vars are missing

**Console.error Usage in Production:**
- Issue: Heavy reliance on console.error throughout the codebase
- Files: 42+ files with console.error calls
- Impact: Poor error handling in production, no centralized logging
- Fix approach: Implement proper error logging service, replace console.error with structured logging

## Known Bugs

**Memory Leaks from Event Listeners:**
- Issue: Multiple components with useEffect that add event listeners but may not clean up properly
- Files: `apps/web/hooks/use-echarts.ts`, `apps/web/components/explore/conferences/charts/collaboration-network.tsx`
- Symptoms: Potential memory leaks, performance degradation over time
- Trigger: Component unmount without proper cleanup
- Workaround: Audit all useEffect hooks for proper cleanup functions

**Timer Leaks:**
- Issue: setTimeout/setInterval not properly cleaned up in component unmount
- Files: `apps/web/components/explore/conferences/charts/collaboration-network.tsx`, `apps/web/components/deepdive/sources/sources-panel.tsx`
- Symptoms: Memory leaks, callbacks executing on unmounted components
- Workaround: Use AbortController or cleanup in useEffect return

**Missing Type Definitions:**
- Issue: Custom type definition files suggest incomplete TypeScript coverage
- Files: `apps/web/types/idle-callback.d.ts`
- Symptoms: Type safety gaps for browser APIs
- Trigger: Using browser APIs without proper typing
- Workaround: Implement comprehensive type definitions or use existing libraries

## Security Considerations

**Hardcoded Credentials in Docker Compose:**
- Risk: Default credentials exposed in configuration
- Files: `apps/web/docker-compose.yml`
- Current mitigation: Uses environment variable substitution
- Recommendations: Move secrets to proper secret management, rotate default credentials

**Password Hashing:**
- Risk: bcryptjs usage is good, but need to verify salt rounds
- Files: `apps/web/prisma/schema.prisma`
- Current mitigation: Using bcryptjs for password hashing
- Recommendations: Verify salt rounds are adequate (≥12 rounds), implement rate limiting on auth endpoints

**Environment Variable Exposure:**
- Risk: Some environment variables are exposed to client (NEXT_PUBLIC_)
- Files: `apps/web/.env.example`
- Current mitigation: Using NEXT_PUBLIC_ prefix for client-side vars
- Recommendations: Audit all NEXT_PUBLIC_ vars, ensure no sensitive data is client-accessible

## Performance Bottlenecks

**Large Component Files:**
- Problem: Very large React components
- Files: `apps/web/components/deepdive/sources/sources-panel.tsx` (1,179 lines)
- Cause: Mixed concerns, poor component separation
- Improvement path: Split into smaller focused components, extract custom hooks

**Excessive Promise.all Usage:**
- Problem: Multiple parallel API calls without error handling
- Files: `apps/web/app/explore/page.tsx`, `apps/web/app/deepdive/[id]/page.tsx`
- Cause: Loading all data simultaneously without proper error boundaries
- Improvement path: Implement proper loading states, error boundaries, and sequential loading for critical path

**Query Client Configuration:**
- Problem: No visible QueryClient configuration for caching or stale data
- Files: No central QueryClient setup found
- Cause: Using default TanStack Query configuration
- Improvement path: Implement proper caching strategies, staleTime, and refetchOnFocus policies

## Fragile Areas

**RAGFlow Dependency:**
- Files: `apps/web/lib/ragflow-client.ts`, `apps/agent/tools/ragflow.py`
- Why fragile: Single point of failure, external service dependency
- Safe modification: Add retry logic, circuit breakers, fallback to local processing
- Test coverage: No error simulation testing for RAGFlow failures

**File Processing Pipeline:**
- Files: `apps/web/lib/services/source-processors/*.ts`
- Why fragile: Multiple external services (Crawl4AI, MineRU, RagFlow)
- Safe modification: Implement proper error handling at each stage, add processing status tracking
- Test coverage: No integration tests for file processing workflows

**Database Schema:**
- Files: `apps/web/prisma/schema.prisma`
- Why fragile: CASCADE deletes on user data could lead to accidental data loss
- Safe modification: Add soft delete pattern for important data, implement backup procedures
- Test coverage: No schema migration tests

## Scaling Limits

**Memory Usage:**
- Current capacity: Large components (1,179 lines) suggest high memory usage
- Limit: React component size and bundle size
- Scaling path: Component splitting, code splitting, lazy loading

**Database Connections:**
- Current capacity: Single PostgreSQL instance
- Limit: Connection pool limits, query performance
- Scaling path: Implement read replicas, connection pooling optimization

## Dependencies at Risk

**NextAuth Beta Version:**
- Risk: Using beta version of NextAuth
- Impact: Potential breaking changes, security vulnerabilities
- Migration plan: Upgrade to stable version when available

**Python SDK Version:**
- Risk: ragflow-sdk may have outdated dependencies
- Impact: Compatibility issues, security vulnerabilities
- Migration plan: Monitor for updates, consider alternative RAG providers

## Missing Critical Features

**Circuit Breaker Pattern:**
- Problem: No protection against external service failures
- Blocks: Resilience when RAGFlow or other services are down
- Priority: High

**Monitoring and Observability:**
- Problem: No centralized logging or monitoring
- Blocks: Debugging production issues, performance optimization
- Priority: High

**Rate Limiting:**
- Problem: No visible rate limiting on API endpoints
- Blocks: Protection against abuse, API quota management
- Priority: Medium

## Test Coverage Gaps

**Unit Tests:**
- What's not tested: Business logic, utility functions
- Files: `apps/web/lib/actions/*`, `apps/web/lib/services/*`
- Risk: Refactoring could break core functionality
- Priority: High

**Integration Tests:**
- What's not tested: API routes, database operations
- Files: `apps/web/app/api/*`
- Risk: End-to-end workflows may fail unnoticed
- Priority: High

**E2E Tests:**
- What's not tested: User workflows, authentication flows
- Files: No Playwright/Cypress tests found
- Risk: Critical user journeys may have bugs
- Priority: Medium

---

*Concerns audit: 2026-03-03*