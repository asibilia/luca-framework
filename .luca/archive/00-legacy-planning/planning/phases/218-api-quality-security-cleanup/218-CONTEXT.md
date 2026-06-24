# Phase 218 Context — API Quality & Security Cleanup

## Decisions

### Localhost Guard DRY (REQ-07)

- Extract `isLocalhostRequest(request: Request): boolean` into `~/lib/request-guards.ts`
- Replace inline guard blocks in all routes with the shared helper
- Move SIDECAR_URL to `~/lib/constants.ts`
- Files: lib/request-guards.ts (new), lib/constants.ts, all routes with localhost guard

### Phase 208 Review Findings (REQ-08)

- Import grouping in compile/route.ts — merge zod and next/server into same external group
- ShikiCodeBlock barrel export — add to ~/components/shared/index.ts
- entityType-to-domainPlural duplication — extract to single const
- new Date().toISOString() repeated 5x — hoist to single const in compile/route.ts
- node:fs in entity-route-helpers.ts — migrate to Bun.file() API (note: this file runs in sidecar/Bun context, not Next.js)

---

_Context created: 2026-03-27 — Phase 218 (SIMPLE complexity)_
