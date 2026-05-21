# Phase 212: Integration & Security Hardening — Context

## Phase Goal

Close the DiffPreview integration gap and harden API routes against security findings from the v8.3.0 audit.

## Complexity

MODERATE — 5 targeted fixes to existing files, no new infrastructure.

## Source

All decisions derived from `.planning/v8.3.0-MILESTONE-AUDIT.md` (integration check + security auditor + code architect findings).

## Decisions

### 1. DiffPreview Wiring [audit-derived]

**Decision:** Wire `DiffPreview` into the entity save flow by modifying `use-entity-save.ts` to parse the 409 response body, extract `current_content`, and surface the DiffPreview dialog instead of throwing a plain error.

**Approach:** The save hook should catch 409, parse `{ error, current_etag, current_content }` from the response, and store it in a conflict state atom. The entity page or a wrapper component reads this atom and renders `<DiffPreview>` when conflict state is set. "Keep My Changes" retries with the new ETag (force overwrite). "Accept Server Version" reloads the entity.

### 2. Localhost Guard Extraction [audit-derived]

**Decision:** Extract `isLocalhostRequest(request: Request): boolean` into `~/lib/request-guards.ts`. Apply to all 4+ API routes that currently inline the check, plus add it to the compile route which is missing the guard entirely.

### 3. Metadata Schema Hardening [audit-derived]

**Decision:** Replace `.passthrough()` with `.strict()` on the metadata sub-object in `EntityPutBodySchema` (`entity-route-helpers.ts`). Enumerate all `EntityMetadata` fields explicitly.

### 4. Commit Message Sanitization [audit-derived]

**Decision:** Sanitize the commit summary in `git/publish/route.ts` to printable ASCII subset. Add max-length guard on the commit message.

### 5. Error Message Masking [audit-derived]

**Decision:** In `compile/route.ts`, replace raw `error.message` forwarding with a generic "Unexpected proxy error" message in production. Keep detailed errors in development mode only.

## Appetite

Medium (100K tokens, 50% context) — targeted fixes, well-scoped.
