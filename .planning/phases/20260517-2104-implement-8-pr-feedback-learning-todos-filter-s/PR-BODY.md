## What

Addresses 8 PR-feedback learning todos + 2 review-iter-1 MUST-FIX items.

**Framework utilities** (#30, #36): `src/util/sanitize.ts` + `src/util/numeric.ts` extracted from module-private duplicates; callsites migrated.

**PR tooling** (#37): `stale-filter.ts` 4-bucket fix — `StaleReason += 'empty-diff-hunk'`, `FilterResult.unknown[]`, dispatcher routes to `unknown[]` not `actionable[]`. Resolves Copilot false-positive epidemic on PRs #234/#236/#239/#247/#248/#249/#251/#253.

**Reviewer test-quality perspective** (#44): 5th perspective block in `reviewer.ts`; `review.md` spawns 5 reviewers.

**Rename-audit skill** (#40): `skills/rename-audit/SKILL.md` — read-only stale-reference audit post-rename.

**Rule packs** (#15, #30, #36, #56): `zod-dual-layer-drift.md`, `input-hygiene.md`, `nan-safe-numbers.md`, `spawn-site-prose-rules.md`.

**Repo cleanup** (#42): `hasPlaceholderText()` exported (advisory); `.gitignore` transient-artifact globs.

**Review iter 1**: Backfilled flat `workflowStateInputSchema` regex constraints (`perspectives`/`role`/`correlationId`); rewrote drift detector with `missingRegexPatterns()` Zod v4 introspection + injected-drift smoke tests; `verdictFor()` 3-state JSDoc.

## Why

8 todos from cross-PR retro analysis. Shipping together reduces systemic review load.

## How

- Sanitize/numeric extracted from private fns, callsite syntax preserved via aliases
- `stale-filter.ts` 4-bucket backward compat (`stale` boolean unchanged)
- Zod v4 regex introspection: `node._zod.def.checks[i]._zod.def` → `{format:'regex', pattern:RegExp}`

## Test Plan

- `bun test`: 564/564 pass (was 502, net +62)
- `tsc --noEmit`: 0 errors
- 6 new/extended test files including injected-drift smoke tests

## Follow-Up

- `hasPlaceholderText()` advisory only
- `loadAlwaysApplyRules()` verbatim injection surface (low risk, no live exploit)
- 10 SHOULD-FIX from review deferred
- See SUGGESTED-RULES.md for 2 recurring pipeline pitfalls

Closes #43
