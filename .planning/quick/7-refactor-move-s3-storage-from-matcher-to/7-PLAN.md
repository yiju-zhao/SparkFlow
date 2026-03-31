---
phase: quick-7
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/matcher/services/excel_processor.py
  - apps/matcher/services/job_runner.py
  - apps/matcher/tools/job_store.py
  - apps/matcher/api/routes/jobs.py
  - apps/matcher/requirements.txt
  - apps/matcher/.env.example
  - apps/web/app/api/matcher/jobs/[jobId]/route.ts
  - apps/web/app/api/matcher/jobs/[jobId]/download/route.ts
  - apps/web/app/api/matcher/parse/route.ts
autonomous: true
requirements: [REFACTOR-S3]
must_haves:
  truths:
    - "Matcher service has zero S3 dependencies (no boto3, no S3 env vars)"
    - "Completed match jobs produce Excel bytes stored in-memory in JobStore"
    - "Next.js GET sync route downloads bytes from matcher and uploads to S3 on COMPLETED"
    - "Next.js download route serves Excel directly from S3 (no matcher proxy)"
    - "Dead parse route is removed"
  artifacts:
    - path: "apps/matcher/services/excel_processor.py"
      provides: "Excel creation returning bytes, no S3"
      contains: "return output.getvalue()"
    - path: "apps/matcher/tools/job_store.py"
      provides: "In-memory result_data storage"
      contains: "result_data"
    - path: "apps/web/app/api/matcher/jobs/[jobId]/route.ts"
      provides: "S3 upload on job completion sync"
      contains: "s3StorageClient"
    - path: "apps/web/app/api/matcher/jobs/[jobId]/download/route.ts"
      provides: "Direct S3 download"
      contains: "s3StorageClient"
  key_links:
    - from: "apps/matcher/services/job_runner.py"
      to: "apps/matcher/tools/job_store.py"
      via: "store result bytes via update_job(result_data=...)"
      pattern: "result_data"
    - from: "apps/matcher/api/routes/jobs.py download"
      to: "apps/matcher/tools/job_store.py"
      via: "serve bytes from job_store.get_job result_data"
      pattern: "result_data"
    - from: "apps/web/app/api/matcher/jobs/[jobId]/route.ts"
      to: "apps/matcher/api/routes/jobs.py download"
      via: "fetch bytes on COMPLETED, then upload to S3"
      pattern: "fetch.*download"
---

<objective>
Remove all S3/storage concerns from the matcher service and centralize file storage in Next.js.

Purpose: Matcher should be a pure matching engine. All persistence (S3, database) belongs in Next.js.
Output: Matcher returns Excel bytes in-memory; Next.js handles S3 upload/download; dead code removed.
</objective>

<context>
@tasks/todo.md
@apps/matcher/services/excel_processor.py
@apps/matcher/services/job_runner.py
@apps/matcher/tools/job_store.py
@apps/matcher/api/routes/jobs.py
@apps/matcher/requirements.txt
@apps/matcher/.env.example
@apps/web/app/api/matcher/jobs/[jobId]/route.ts
@apps/web/app/api/matcher/jobs/[jobId]/download/route.ts
@apps/web/app/api/matcher/parse/route.ts
@apps/web/lib/s3-client.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Strip S3 from matcher service (Python side)</name>
  <files>
    apps/matcher/services/excel_processor.py
    apps/matcher/services/job_runner.py
    apps/matcher/tools/job_store.py
    apps/matcher/api/routes/jobs.py
    apps/matcher/requirements.txt
    apps/matcher/.env.example
  </files>
  <action>
    **ExcelProcessor** (`apps/matcher/services/excel_processor.py`):
    - Remove `import boto3` and `from botocore.exceptions import ClientError`
    - Remove `__init__` method (no more S3 client, bucket, _ensure_bucket_exists)
    - Remove `_create_s3_client()` method
    - Remove `_ensure_bucket_exists()` method
    - Remove `parse_queries()` method entirely (dead code -- queries come from frontend)
    - Remove `get_result_file_stream()` method entirely (Next.js will serve from S3)
    - Change `create_result_excel()` to return `bytes` instead of uploading to S3:
      - Remove the S3 upload block (lines ~165-174)
      - Instead: `return output.getvalue()` (returns bytes)
    - Keep `_translate_to_english()`, `_sanitize_sheet_name()`, `_safe_str()` unchanged
    - Remove `import uuid` (no longer needed for S3 key generation)
    - Remove `import os` if only used by S3 methods (still needed by _translate_to_english, so keep it)

    **JobRunner** (`apps/matcher/services/job_runner.py`):
    - Line ~180: `result_file_key = self.excel_processor.create_result_excel(...)` now returns bytes
    - Rename variable: `result_bytes = self.excel_processor.create_result_excel(...)`
    - Line ~186-193: Update `update_job` call to store `result_data=result_bytes` instead of `result_file_key=result_file_key`

    **JobStore** (`apps/matcher/tools/job_store.py`):
    - In `create_job`, add `"result_data": None` to the job dict (alongside existing `result_file_key`)
    - Add method `get_result_data(job_id) -> Optional[bytes]` that returns `job.get("result_data")` under lock

    **Matcher routes** (`apps/matcher/api/routes/jobs.py`):
    - Remove `from services.excel_processor import ExcelProcessor` import
    - Remove `get_excel_processor()` dependency function
    - Remove `excel_processor` parameter from `create_job` endpoint. The JobRunner still needs ExcelProcessor, so instantiate it inline: `job_runner = JobRunner(matcher=..., excel_processor=ExcelProcessor(), job_store=...)`
    - Update `download_results` endpoint:
      - Remove `excel_processor` dependency parameter
      - Instead of streaming from S3 via excel_processor, get bytes from JobStore: `result_data = job_store.get_result_data(job_id)` (use the new method -- but since update_job already stores it, can also just use `job.get("result_data")`)
      - If `result_data` is None, return 404 "Result data not available (may have been cleared)"
      - Return `Response(content=result_data, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": ...})`
      - Import `Response` from `fastapi` (not StreamingResponse for bytes)
      - Remove the check for `result_file_key` -- check for `result_data` instead
    - In `_job_to_response`, keep `result_file_key` field but it will be None (don't expose `result_data` bytes in the JSON response)

    **requirements.txt** (`apps/matcher/requirements.txt`):
    - Remove the `boto3>=1.34.0` line and its `# S3 storage` comment

    **.env.example** (`apps/matcher/.env.example`):
    - Remove the `# S3/MinIO Storage` section (S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET lines)
  </action>
  <verify>
    cd apps/matcher && python -c "from services.excel_processor import ExcelProcessor; print('OK: ExcelProcessor imports without boto3')" && python -c "from api.routes.jobs import router; print('OK: routes import clean')" && ! grep -q boto3 requirements.txt && echo "OK: boto3 removed from requirements" && ! grep -q S3_ENDPOINT .env.example && echo "OK: S3 vars removed from .env.example"
  </verify>
  <done>
    - ExcelProcessor has no S3 code, create_result_excel returns bytes
    - JobRunner stores result bytes in JobStore via result_data field
    - JobStore has result_data field and get_result_data method
    - Download route serves bytes from memory, no ExcelProcessor dependency
    - boto3 removed from requirements.txt
    - S3 env vars removed from .env.example
  </done>
</task>

<task type="auto">
  <name>Task 2: Update Next.js routes to own S3 storage + cleanup</name>
  <files>
    apps/web/app/api/matcher/jobs/[jobId]/route.ts
    apps/web/app/api/matcher/jobs/[jobId]/download/route.ts
    apps/web/app/api/matcher/parse/route.ts
  </files>
  <action>
    **GET sync route** (`apps/web/app/api/matcher/jobs/[jobId]/route.ts`):
    - Add import: `import { s3StorageClient } from "@/lib/s3-client";`
    - After the progress sync updates the job to COMPLETED (line ~64, where `progressData.status === "COMPLETED"`), add logic to download and persist the Excel file:
      - Check if `job.resultFileKey` is already set (or if `updatedJob.resultFileKey` exists). If NOT set yet:
        1. Fetch Excel bytes from matcher: `const dlRes = await fetch(\`\${MATCHER_API_URL}/api/jobs/\${jobId}/download\`)`
        2. If dlRes.ok, get the bytes: `const buffer = Buffer.from(await dlRes.arrayBuffer())`
        3. Upload to S3: `const fileKey = \`match-results/\${jobId}.xlsx\``
        4. `await s3StorageClient.uploadImage(fileKey, buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")`
        5. Update the DB record: `await prisma.matchJob.update({ where: { id: jobId }, data: { resultFileKey: fileKey } })`
        6. Set `updatedJob.resultFileKey = fileKey` so the response includes it
      - Wrap in try/catch -- if download/upload fails, log error but don't fail the response (job is still COMPLETED, file can be retried)
    - In the DELETE handler: Replace the inline S3Client creation (lines 117-127) with `s3StorageClient` from `@/lib/s3-client`. Use `s3StorageClient.deleteImage(key)` for each key. This uses the same `sparkflow-images` bucket which is where we now store results. Remove the `@aws-sdk/client-s3` dynamic import.

    **Download route** (`apps/web/app/api/matcher/jobs/[jobId]/download/route.ts`):
    - Replace the matcher proxy approach entirely
    - Add import: `import { s3StorageClient } from "@/lib/s3-client";`
    - After verifying ownership and COMPLETED status, check `job.resultFileKey`
    - If no resultFileKey, return 404 "Result file not available yet"
    - Get stream from S3: `const { stream, contentType } = await s3StorageClient.getImageStream(job.resultFileKey)`
    - Return the stream as a Response with proper Content-Disposition header
    - Remove the `MATCHER_API_URL` constant (no longer proxying to matcher)

    **Delete dead parse route:**
    - Delete the file `apps/web/app/api/matcher/parse/route.ts` entirely
  </action>
  <verify>
    cd apps/web && npx tsc --noEmit 2>&1 | head -20 && test ! -f app/api/matcher/parse/route.ts && echo "OK: parse route deleted"
  </verify>
  <done>
    - GET sync route downloads Excel from matcher on COMPLETED and uploads to S3
    - GET sync route DELETE handler uses s3StorageClient (no inline S3Client)
    - Download route serves from S3 directly (no matcher proxy)
    - Dead parse route is deleted
    - TypeScript compiles without errors
  </done>
</task>

</tasks>

<verification>
1. Matcher has no boto3 dependency: `cd apps/matcher && ! grep -rq "boto3\|botocore" services/ api/ tools/`
2. Matcher has no S3 env vars: `! grep -q "S3_" apps/matcher/.env.example`
3. Next.js compiles: `cd apps/web && npx tsc --noEmit`
4. Dead parse route gone: `test ! -f apps/web/app/api/matcher/parse/route.ts`
5. Upload route unchanged and uses s3StorageClient: `grep -q "s3StorageClient" apps/web/app/api/matcher/upload/route.ts`
</verification>

<success_criteria>
- Matcher service has zero S3/boto3 references
- ExcelProcessor.create_result_excel returns bytes
- Matcher download endpoint serves from in-memory JobStore
- Next.js GET sync auto-persists Excel to S3 on job completion
- Next.js download serves directly from S3
- Next.js DELETE uses s3StorageClient (no inline S3Client)
- Dead parse route deleted
- Both apps compile/import cleanly
</success_criteria>

<output>
Update tasks/todo.md with completion status after all tasks done.
</output>
