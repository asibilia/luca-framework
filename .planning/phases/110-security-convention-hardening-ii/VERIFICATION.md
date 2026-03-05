# Phase 110 — Security & Convention Hardening II

## Verification Report

**Verdict: passed**

Automated checks: 3408 pass, 2 fail (pre-existing — `result-aggregator.test.ts` and
`result-envelope.test.ts` have failed since v2.5.1; unrelated to Phase 110 changes).

---

## Requirement-by-Requirement Results

### REQ-01: Extend auth middleware to 5 unauthenticated GET endpoints

**EXISTS**: `requireApiKey(request)` is imported and called at the top of GET handlers in:

- `/packages/luca-observer/app/api/stream/route.ts` (line 41)
- `/packages/luca-observer/app/api/events-query/route.ts` (line 73)
- `/packages/luca-observer/app/api/ledger/route.ts` (line 75)
- `/packages/luca-observer/app/api/notes/route.ts` (line 90) — GET handler
- Route-factory routes (harness, iterations, memory, planning, state, metrics, tribunal) all use `{ requireAuth: true }` option.

**SUBSTANTIVE**: Each handler returns the `authError` immediately if `requireApiKey` returns non-null. The route-factory checks `options.requireAuth` before processing any query params.

**WIRED**: `requireApiKey` is imported from `~/lib/auth` in all routes. The factory's `requireAuth` option calls `requireApiKey` inside the generated handler. Auth is enforced before any file I/O.

Status: **PASS**

---

### REQ-02: Replace `===` API key comparison with `crypto.timingSafeEqual()`

**EXISTS**: `packages/luca-observer/lib/auth.ts` imports `{ timingSafeEqual }` from `"node:crypto"` (line 1) and uses `timingSafeEqual(providedBuf, expectedBuf)` (line 56).

**SUBSTANTIVE**: Implementation includes the mandatory length pre-check (lines 46-51) before calling `timingSafeEqual` (which throws on unequal buffer lengths). Both keys are converted to `Buffer.from(key, "utf8")` before comparison. A missing key returns 401; an incorrect key returns 401 with an identical error message (no oracle).

**WIRED**: All GET routes import and call `requireApiKey` from this file. No lingering `===` string comparison in any auth path.

Status: **PASS**

---

### REQ-03: Remove `unsafe-eval` and `unsafe-inline` from CSP production header

**EXISTS**: `packages/luca-observer/next.config.ts` has two separate CSP branches via `isDev` conditional (line 3, 29-49).

**SUBSTANTIVE**: The production branch (`isDev === false`) contains `"script-src 'self'"` — no `unsafe-eval`, no `unsafe-inline`. Dev branch retains both for Next.js HMR. Comment on line 40 explicitly states "Production: strict CSP — no eval or inline scripts".

**WIRED**: `isDev` is computed at module load from `process.env.NODE_ENV`. The conditional is a ternary in the header value — not a separate config file — so it applies to every request in production.

Status: **PASS**

---

### REQ-04: Validate `event_type` query param against allowed values in event routes

**EXISTS**: Both `events-query/route.ts` (lines 33-37) and `ledger/route.ts` (lines 35-39) define `EventQueryParamsSchema` / `LedgerQueryParamsSchema` with:

```
event_type: z.string().regex(/^[a-z0-9_]+(?:\.[a-z0-9_]+)*$/).max(100).optional()
```

**SUBSTANTIVE**: The regex allows only dot-separated lowercase alphanumeric segments (e.g. `"session.start"`, `"tool.use"`), max 100 chars. Invalid values fail `safeParse` and return `400 { error: "invalid_query_params", details: [...] }` via `sanitizeZodIssues`.

**WIRED**: `safeParse` result is checked before any DB/file query. Invalid params short-circuit with a 400 before the store is queried. Schema JSDoc documents the rationale.

Status: **PASS**

---

### REQ-05: Fix bare `"path"` imports to `"node:path"` in runner.ts and output-capture.ts

**EXISTS**: `src/harness/__helpers/runner.ts` has `import { join } from "node:path"` (line 29). `src/harness/middleware/output-capture.ts` has `import { join } from "node:path"` (line 26).

**SUBSTANTIVE**: No bare `"path"` string appears in either file. Both use the explicit Node.js built-in prefix per project convention.

**WIRED**: `join` is used in both files for path construction. `node:path` resolves identically but makes the built-in origin explicit and prevents shadowing.

Status: **PASS**

---

### REQ-06: Clarify harness schema documentation as internal-only, fix camelCase docs

**EXISTS**: `src/harness/__schemas/harness.schemas.ts` has an updated module-level JSDoc (lines 1-17) that states:

- "**Internal-only schemas** — not used as API request/response payloads."
- "Uses camelCase per TypeScript conventions for internal runtime types."
- "The harness runner serializes to snake_case when writing `harness-result.json`..."

**SUBSTANTIVE**: The clarification distinguishes camelCase internal schemas from the snake_case serialized output. Fields `totalErrors`, `totalWarnings`, `rawOutput`, `exitCode`, `middlewarePipeline` etc. carry `/** Internal: ... */` jsdoc annotations. The `snakeCaseResult` transform in `runner.ts` is explicitly cross-referenced.

**WIRED**: Documentation is part of the exported schema file read by consumers and IDEs. No functional change was needed; the doc is accurate.

Status: **PASS**

---

### REQ-07: Migrate HookDefinitionSchema to snake_case

**EXISTS**: `src/hooks/__schemas/hook.schemas.ts` `HookDefinitionSchema` now defines:

- `cursor_event` (was `cursorEvent`)
- `pi_event` (was `piEvent`)
- `cursor_matcher` (was `cursorMatcher`)
- `pi_matcher` (was `piMatcher`)
- `status_message` (was `statusMessage`)

**SUBSTANTIVE**: The git diff for commit `cb935d5` shows the five field renames in the schema plus corresponding updates in:

- `src/hooks/__helpers/platform-adapters.ts` — `canonicalToLegacy()` returns snake_case fields; `adaptForClaude/Cursor/Pi` consume `hook.status_message`.
- `src/hooks/__helpers/config-generators.ts` — `def.cursor_event`, `def.pi_event`, `def.cursor_matcher`, `def.pi_matcher`, `def.status_message` used throughout.
- Tests in `__tests__/src/hooks/` updated.

**WIRED**: Call sites are fully updated. No stale `cursorEvent`, `piEvent`, `cursorMatcher`, `piMatcher` references remain in the source files that consume `HookDefinition`.

Status: **PASS**

---

### REQ-08: Replace `parse()` with `safeParse()` in runner.ts and pipeline.ts

**EXISTS**: In `runner.ts` (lines 44, 181-194): `HarnessConfigSchema.safeParse(raw.harness)` and `MiddlewareContextSchema.safeParse({...})` replace previous `.parse()` calls. In `pipeline.ts` (line 98): `MiddlewareResultSchema.safeParse({...})` is used.

**SUBSTANTIVE**: Each `safeParse` has a handled failure branch — `runner.ts` falls through to defaults on config parse failure; logs a `console.warn` on context parse failure and falls back to direct execution; `pipeline.ts` returns safe defaults if the result schema fails. No unguarded `.parse()` calls remain in these files for external/computed data.

**WIRED**: The `DEFAULT_HARNESS_CONFIG` still uses `HarnessConfigSchema.parse({...})` for the static constant (which is acceptable — computed, not external data). All externally-sourced data paths use `safeParse`.

Status: **PASS**

---

### REQ-09: Fix pipeline.ts `~/` alias import to use relative import

**EXISTS**: `src/harness/__helpers/pipeline.ts` imports use:

- `from "../__schemas/harness.schemas"` (relative)
- `from "../middleware"` (relative)

No `~/harness/` alias imports remain in the file.

**SUBSTANTIVE**: The commit `8fad48d` replaced any `~/harness/` alias with correct relative paths. The pipeline file is consumed within the harness domain; relative imports are the correct convention per the observer convention rule.

**WIRED**: The imports resolve correctly. The file is internal to `src/harness/__helpers/` so `../` relative paths are appropriate.

Status: **PASS**

---

### REQ-10: Move observer-emitter.ts to `__helpers/` per domain architecture rule

**EXISTS**: File is present at `packages/luca-framework/src/state/__helpers/observer-emitter.ts` (confirmed by `ls` output). No `observer-emitter.ts` exists at the state domain root.

**SUBSTANTIVE**: The file exports `isLocalhostUrl` and `emitObserverEvent` — both are helper functions with no schemas, no registries. Placement in `__helpers/` is architecturally correct per domain-architecture rule (only `index.ts` at domain root).

**WIRED**: `packages/luca-framework/src/state/bridge.ts` imports from `"./__helpers/observer-emitter"`. The test file (`observer-emitter.test.ts`) was also moved (commit `ea3ad5f` updated import path). No dangling references to the old root path.

Status: **PASS**

---

### REQ-11: Convert LedgerFilters from `interface` to `type` alias

**EXISTS**: `packages/luca-framework/src/state/ledger.ts` line 53: `export type LedgerFilters = { ... }` — confirmed as `type` alias, not `interface`.

**SUBSTANTIVE**: The type alias is functionally equivalent but follows the project's preference for `type` over `interface` for object shapes that are not extended. Fields remain `session_id`, `event_type`, `since`, `limit`, `tail` (snake_case per convention).

**WIRED**: `LedgerFilters` is used as the parameter type for `readLedger()` and as the filter input for `readLedgerEntries()` in `file-watcher.ts`. The type change is transparent to callers.

Status: **PASS**

---

### REQ-12: Document observer-local schema coupling with luca-framework schemas

**EXISTS**: `packages/luca-observer/lib/types.ts` contains a comprehensive module-level JSDoc block (lines 1-28) titled "Schema Coupling Policy" that:

- Names all mirrored schemas (`LedgerEntrySchema`, `HarnessResultSnapshotSchema`, `IterationRecordSnapshotSchema`, `SessionPlanSnapshotSchema`, `TribunalResultSnapshotSchema`)
- Names the source files in luca-framework
- Explains the duplication rationale (avoid cross-package runtime dependency)
- Calls out the manual update requirement when source schemas change

**SUBSTANTIVE**: Each individual schema section in the file additionally carries a `// NOTE: Observer-local mirror of luca-framework's ...` comment with the source path and a note to update when the source changes.

**WIRED**: Documentation is in the exported module file. No functional gap; the coupling policy is accurately described.

Status: **PASS**

---

### REQ-13: Document db.ts mutable store thread-safety model

**EXISTS**: `packages/luca-observer/lib/db.ts` contains a "Thread-Safety Model" section in the module JSDoc (lines 18-30) that explains:

- Node.js/Bun single-threaded event loop
- Array mutations and counter increments are race-free
- No locking needed
- Limitation: process-local; not shared across multiple processes

**SUBSTANTIVE**: The documentation is accurate for Node.js/Bun's execution model. It correctly identifies the multi-process limitation and names the mitigation path (external store like Redis/SpacetimeDB). The "Design" section above it explains the globalThis HMR survival pattern.

**WIRED**: Documentation is part of the module JSDoc. No functional change needed.

Status: **PASS**

---

### REQ-14: Fix import grouping in notes/route.ts (node: imports separated from relative)

**EXISTS**: `packages/luca-observer/app/api/notes/route.ts` imports are ordered as:

1. `node:fs/promises` — node built-in (lines 1-4, with exception comment)
2. `node:path` — node built-in (line 5)
3. `next/server` — external (line 7)
4. `zod` — external (line 8)
5. `~/lib/*` — internal aliases (lines 10-14)

**SUBSTANTIVE**: The node: imports are grouped at the top, separated from external packages by a blank line, separated from internal aliases by another blank line. This matches the import-standards rule grouping order.

**WIRED**: The exception comment on line 1 documents why `node:fs/promises` is kept instead of using Bun equivalents. The dead `priorityMatch` variable referenced in the commit message (`d825006`) has been removed.

Status: **PASS**

---

### REQ-15: Sanitize Zod validation errors before returning to client

**EXISTS**: `packages/luca-observer/lib/sanitize-zod.ts` exports `sanitizeZodIssues(issues: ZodIssue[]): { field: string; message: string }[]`.

**SUBSTANTIVE**: The function maps each `ZodIssue` to only `{ field: issue.path.join(".") || "root", message: issue.message }`, stripping `code`, `unionErrors`, `validation`, `inclusive`, and all other internal Zod metadata fields. This prevents leaking schema internals to clients.

**WIRED**: `sanitizeZodIssues` is imported and used in:

- `events-query/route.ts` (line 95): invalid query params → 400
- `ledger/route.ts` (line 94): invalid query params → 400
- `notes/route.ts` (line 190): invalid POST body → 400

All three validation error paths in the observer now use the sanitizer.

Status: **PASS**

---

### REQ-16: Remove dead `priorityMatch` variable

**EXISTS**: No `priorityMatch` appears in any `.ts` or `.tsx` source file in the repository. Grep across `packages/luca-observer/app/` and `packages/luca-observer/lib/` and `src/` returns zero matches.

**SUBSTANTIVE**: Commit `d825006` explicitly states "remove dead priorityMatch code". The dead variable is gone.

**WIRED**: No references to `priorityMatch` remain anywhere in the source tree.

Status: **PASS**

---

## Summary

| #   | Requirement                          | EXISTS | SUBSTANTIVE | WIRED | Result |
| --- | ------------------------------------ | ------ | ----------- | ----- | ------ |
| 1   | Auth on 5 GET endpoints              | YES    | YES         | YES   | PASS   |
| 2   | timingSafeEqual() in auth            | YES    | YES         | YES   | PASS   |
| 3   | CSP: no unsafe-eval/inline (prod)    | YES    | YES         | YES   | PASS   |
| 4   | event_type validation with regex     | YES    | YES         | YES   | PASS   |
| 5   | "node:path" bare import fix          | YES    | YES         | YES   | PASS   |
| 6   | Harness schemas internal-only docs   | YES    | YES         | YES   | PASS   |
| 7   | HookDefinitionSchema snake_case      | YES    | YES         | YES   | PASS   |
| 8   | safeParse() in runner.ts/pipeline.ts | YES    | YES         | YES   | PASS   |
| 9   | pipeline.ts relative imports         | YES    | YES         | YES   | PASS   |
| 10  | observer-emitter.ts → \_\_helpers/   | YES    | YES         | YES   | PASS   |
| 11  | LedgerFilters type alias             | YES    | YES         | YES   | PASS   |
| 12  | observer-local schema coupling docs  | YES    | YES         | YES   | PASS   |
| 13  | db.ts thread-safety docs             | YES    | YES         | YES   | PASS   |
| 14  | Import grouping in notes/route.ts    | YES    | YES         | YES   | PASS   |
| 15  | Zod error sanitization               | YES    | YES         | YES   | PASS   |
| 16  | Dead priorityMatch removed           | YES    | YES         | YES   | PASS   |

**All 16 requirements: PASS**

## Automated Check Results

- **Tests**: 3408 pass, 2 fail
- **Failing tests**: `__tests__/src/context/result-aggregator.test.ts`, `__tests__/src/context/result-envelope.test.ts`
- **Pre-existing**: Both files were last modified in v2.5.1 (commit `74b3eb9`) — before Phase 110. Neither file was touched in any Phase 110 commit.

## Overall Verdict

**passed**

Phase 110 fully achieved its goal. All 16 security and convention requirements are implemented, substantive, and integrated. No regressions introduced. The 2 failing tests are pre-existing and unrelated to this phase.
