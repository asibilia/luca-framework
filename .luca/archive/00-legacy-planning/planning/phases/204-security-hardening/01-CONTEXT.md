# Phase 204: Security Hardening — Context

## Decision Summary

All decisions resolved from v8.1.0 milestone audit findings. No gray areas — each fix has explicit instructions.

---

## 1. Git Revert Path Allowlist

**Decision:** Add `STUDIO_PATH_PREFIXES` check to revert route, mirroring publish route's existing pattern. [audit-resolved]

- Validate `file_path` starts with one of: `src/agents/`, `src/skills/`, `src/rules/`, `.planning/config.json`
- Normalize path to prevent traversal: verify resolved path stays within project root
- Return 403 for non-Studio paths

## 2. commit_sha Hex Validation

**Decision:** Replace `z.string().min(4)` with `z.string().regex(/^[0-9a-f]{4,40}$/i)` in revert route schema. [audit-resolved]

- Prevents revspec expressions (HEAD~1, main, branch names)
- Only allows valid hex commit SHAs

## 3. ETag Leak Removal

**Decision:** Remove `currentEtag` from 409 response body in config-section-handler.ts. [audit-resolved]

- Client should re-fetch to get new ETag, not receive it in error response
- Return only error message string

## 4. Localhost Guard

**Decision:** Add hostname check on mutating git API routes. [audit-resolved]

- Check `request.headers.get("host")` starts with `localhost` or `127.0.0.1`
- Return 403 for non-localhost requests
- Apply to POST /api/git/publish and POST /api/git/revert

## 5. Git Log SHA Validation

**Decision:** Add hex SHA regex check before `git diff-tree` call in history route. [audit-resolved]

- Skip entries where parsed SHA doesn't match `/^[0-9a-f]{40}$/i`
- Prevents misaligned parsing from corrupting downstream git commands

## 6. Publish 409 File Path Redaction

**Decision:** Return only count of non-Studio files in 409 response, not the file paths. [audit-resolved]

- Replace `files: nonStudioFiles` with `count: nonStudioFiles.length`
- Prevents leaking project file tree structure
