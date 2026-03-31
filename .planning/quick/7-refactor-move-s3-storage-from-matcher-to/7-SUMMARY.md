---
phase: quick-7
plan: 1
subsystem: matcher, web-api
tags: [refactor, s3, cleanup]
dependency_graph:
  requires: []
  provides: [centralized-s3-storage]
  affects: [matcher-service, nextjs-api-routes]
tech_stack:
  removed: [boto3]
  patterns: [s3-centralized-in-nextjs, in-memory-result-bytes]
key_files:
  modified:
    - apps/matcher/services/excel_processor.py
    - apps/matcher/services/job_runner.py
    - apps/matcher/tools/job_store.py
    - apps/matcher/api/routes/jobs.py
    - apps/matcher/requirements.txt
    - apps/matcher/.env.example
    - apps/web/app/api/matcher/jobs/[jobId]/route.ts
    - apps/web/app/api/matcher/jobs/[jobId]/download/route.ts
  deleted:
    - apps/web/app/api/matcher/parse/route.ts
decisions:
  - Matcher stores Excel bytes in-memory; Next.js fetches and persists to S3
  - Reuse sparkflow-images bucket with match-results/ prefix
  - DELETE handler uses shared s3StorageClient instead of inline S3Client
metrics:
  duration: 6min
  completed: "2026-03-08"
  tasks_completed: 2
  tasks_total: 2
---

# Quick Task 7: Move S3 Storage from Matcher to Next.js Summary

Removed all S3/boto3 dependencies from matcher service; ExcelProcessor returns bytes, Next.js handles S3 upload on job completion and serves downloads directly from S3.

## What Was Done

### Task 1: Strip S3 from matcher service (Python side)
**Commit:** c9d2ea7

- **ExcelProcessor**: Removed boto3/botocore imports, `__init__`, `_create_s3_client()`, `_ensure_bucket_exists()`, `parse_queries()`, `get_result_file_stream()`, `import uuid`. Changed `create_result_excel()` to return `bytes` via `output.getvalue()`.
- **JobRunner**: Stores `result_data=result_bytes` instead of `result_file_key=result_file_key`.
- **JobStore**: Added `result_data: None` field to job dict, added `get_result_data(job_id)` method.
- **Routes**: Removed `get_excel_processor()` dependency, removed `ExcelProcessor` from `create_job` Depends (instantiated inline for JobRunner). Download endpoint serves bytes from `job_store.get_result_data()` using `Response` instead of `StreamingResponse`.
- **requirements.txt**: Removed `boto3>=1.34.0`.
- **.env.example**: Removed S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET.

### Task 2: Update Next.js routes to own S3 storage + cleanup
**Commit:** d6ab1b4

- **GET sync route**: On COMPLETED status with no `resultFileKey`, fetches Excel bytes from matcher `/download`, uploads to S3 as `match-results/{jobId}.xlsx`, saves key to Prisma. Wrapped in try/catch so S3 failure doesn't break the sync response.
- **DELETE handler**: Replaced inline `S3Client` construction with `s3StorageClient.deleteImage()`.
- **Download route**: Serves file directly from S3 via `s3StorageClient.getImageStream()` with Node.js Readable-to-web ReadableStream conversion. No longer proxies to matcher.
- **Parse route**: Deleted `apps/web/app/api/matcher/parse/route.ts` and its empty directory.

## Deviations from Plan

None - plan executed exactly as written.

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| In-memory bytes in JobStore | Simple, no extra infra; Next.js fetches promptly on completion |
| sparkflow-images bucket with match-results/ prefix | Reuses existing bucket; prefix provides logical separation |
| s3StorageClient for DELETE | Consistent with upload/download routes; removes duplicate S3Client code |

## Verification Results

- No boto3/botocore references in matcher service
- No S3 env vars in matcher .env.example
- Parse route deleted
- Upload route unchanged, uses s3StorageClient
- ExcelProcessor returns bytes
- No TypeScript errors in matcher-related files

## Self-Check: PASSED
