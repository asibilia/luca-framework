# Plan: Telemetry Batch 5 Quality Regressions

## Objective

Fix 5 telemetry data-quality regressions in one PR via prose hardening + minimal test additions. No breaking schema changes. All fixes prose-only or additive.

## Context

- `shared-prefix.ts`: file 2539 bytes; runtime `SUBAGENT_SHARED_PREFIX.length` guard `< 3000` (memory-tier-prefix.test.ts:105).
- `architect.md:115` + `finalize.md:56`: shorthand prose w/o field enumeration → primary `model:null`/`tokens:0` regression vector.
- `execute.md:161`: canonical example uses fabricated round numbers; `omit` directive only at line 465 (outside spawn region).
- `review.md`: spawn region uses slash-separated `inputTokens/outputTokens/model` — no `omit` prose.
- `postmortem.ts:98,415`: `vault: 'default' as const` — intentional cross-project pitfall canonical; document, don't refactor (scope decision per RESEARCH Open Q1).
- `success: z.boolean().nullable().optional()` schema correct — fix is prose semantics only.
- Aggregator skill schema-agnostic on reads — backward compat safe.

CWD for all paths: `packages/luca-mastracode/`

## Phases

### Phase 1: Prose Hardening + Test Coverage

#### Wave 1: Tracer Bullet — `shared-prefix.ts` Prose Update (atomic)

- [ ] **Task 1.1.1**: Tighten `shared-prefix.ts:35-38` usage-comment directive.
  - Files: `src/subagents/shared-prefix.ts`
  - Add directly after line 38, BEFORE closing backtick:
    - "If you cannot determine `model` or token counts, **omit** the entire `<!-- usage: ... -->` comment — never emit `null` or `0` as placeholder values."
    - "When emitting `success` on `record-subagent` complete: set `true` for any `completed*` outcome (`completed`, `completed_no_usage`, `completed_partial_parse`); set `false` for `crashed`, `killed`, `timeout`. Never emit `null` on complete events."
    - "`durationMs` on complete MUST be `Date.now() - ts` — never a rounded guess. Omit field if unable to measure."
  - **Verification (RUNTIME, not file-size)**: Task 1.3.2 assertion #4 (`SUBAGENT_SHARED_PREFIX.length < 2900`) uses standard `await import('../subagents/shared-prefix.js')` — proven pattern from `memory-tier-prefix.test.ts:102-104`. Run `bun test src/__tests__/shared-prefix-semantics.test.ts` after Wave 1 edit; assertion #4 must pass.
  - Existing `memory-tier-prefix.test.ts` size guard (< 3000) MUST still pass.

#### Wave 2: Mode-File Field-Enumeration + Example Rewrite + `omit` Prose

- [ ] **Task 1.2.1**: Replace `architect.md:115` (the `Step 2: Discussion` Subagent Telemetry blockquote — NOT the later line 358 spawn-site) shorthand telemetry block with field-enumeration form mirroring `execute.md:151`.
  - Files: `src/instructions/architect.md`
  - New prose MUST contain literal substrings: `inputTokens`, `outputTokens`, `model`, `success:`, `omit`. Reference regex `/<!--\s*usage:\s*(\{[^}]+\})\s*-->/`. Validation rule: "non-negative integers ≤ 10_000_000."
  - Verification: spawn-site region at line 115 (next 4000 chars from `Subagent Telemetry` heading or `record-subagent`) contains all 5 substrings.

- [ ] **Task 1.2.2**: Replace `finalize.md:56` shorthand similarly. Same prose template + required substrings as 1.2.1.
  - Files: `src/instructions/finalize.md`

- [ ] **Task 1.2.3**: Update `execute.md` example values + add `omit` directive to spawn-site region.
  - Files: `src/instructions/execute.md`
  - Line 161: replace `inputTokens: 12000, outputTokens: 3400, durationMs: 45000` → `inputTokens: 8743, outputTokens: 2156, durationMs: Date.now() - ts`. Replace `claude-opus-4-7` → `anthropic/claude-sonnet-4-5`.
  - Insert NEW line immediately after the "Pass `null` if absent or malformed." sentence (currently at line 151, blank line 152): "If `model` is unknown, **omit** the entire usage comment — never emit `model: null`."
  - Verification: `execute.md` spawn-site region (lines 145-170) contains `omit`; example line has no `: 12000`/`: 3400`/`: 45000` literals.

- [ ] **Task 1.2.4**: Document `postmortem.ts` intentional `'default'` vault.
  - Files: `src/analysis/postmortem.ts`
  - Above line 96 `pitfalls:` field AND above line 412 `// ── Pitfall payloads`: insert comment "Pitfalls always written to the canonical `default` vault for cross-project aggregation, regardless of per-repo `muninn.vault`. Intentional — do not thread per-repo vault here."
  - Verification: grep finds `intentional` twice in postmortem.ts.

- [ ] **Task 1.2.5**: Add `omit` directive to `review.md` spawn-site region.
  - Files: `src/instructions/review.md`
  - After existing line 61 (telemetry directive): insert "If `model` or token counts are unknown, **omit** the entire usage comment — never emit `null` or `0`."
  - Verification: `review.md` spawn-site region contains `omit`.

#### Wave 3: Cross-File Invariant Tests + Changeset

- [ ] **Task 1.3.1**: NEW `__tests__/usage-comment-completeness.test.ts`.
  - Files: `src/__tests__/usage-comment-completeness.test.ts`
  - Pattern: `describe.each(FILES)` where FILES = `['execute.md', 'architect.md', 'finalize.md', 'research.md', 'review.md']`.
  - Region helper: `extractRegion(content)` finds earliest of `indexOf('Subagent Telemetry')` / `indexOf('record-subagent')`, returns next 4000 chars (matches existing `correlationid-format-prose.test.ts` convention).
  - Per file, 4 assertions using `.toContain(literal)` substring (NOT regex):
    1. `region.toContain('inputTokens')`
    2. `region.toContain('outputTokens')`
    3. `region.toContain('model')`
    4. `region.toContain('omit')`
  - Total: 5×4 = 20 test cases.
  - Verification: all 20 pass after Waves 1+2.

- [ ] **Task 1.3.2**: NEW `__tests__/shared-prefix-semantics.test.ts`.
  - Files: `src/__tests__/shared-prefix-semantics.test.ts`
  - 5 tests on `SUBAGENT_SHARED_PREFIX` runtime string (import via `await import('../subagents/shared-prefix.js')`):
    1. `.toContain('omit')` (omit-on-unknown directive present)
    2. `.toContain('never emit')` (negative directive present)
    3. `.toContain('completed*')` (broad outcome→success rule)
    4. `.toContain('Date.now() - ts')` (durationMs computation directive)
    5. `expect(SUBAGENT_SHARED_PREFIX.length).toBeLessThan(2900)` (margin under 3000 ceiling)
  - Verification: 5/5 pass after Wave 1.

- [ ] **Task 1.3.3**: NEW `__tests__/postmortem-vault-comment.test.ts`.
  - Files: `src/__tests__/postmortem-vault-comment.test.ts`
  - 1 test: `readFileSync('src/analysis/postmortem.ts', 'utf8')` matches `/intentional/i` at least twice (line 96 area + line 412 area).
  - Verification: passes after Wave 2.

- [ ] **Task 1.3.4**: Cosmetic — clean up correlationId round-suffix test fixtures.
  - Files: `src/__tests__/workflow-state-actions.test.ts`
  - Replace `1747200000000` literal occurrences → `1747200000123` (non-round 13-digit ms). Pure readability change; no behavioral semantics. Closes #19 as canonical-form cleanup (cosmetic scope per RESEARCH).
  - Verification: existing tests still pass; no `1747200000000` literals remain.

- [ ] **Task 1.3.5**: Changeset.
  - Files: `.changeset/telemetry-batch-5-quality-regressions.md`
  - `"@alecsibilia/luca-mastracode": patch`. Body: 5-fix summary mapping todos (#19/#20/#21/#22/#24).

## Verification Criteria

1. `bun test` passes (all existing + 25 new test cases)
2. `tsc` clean
3. `SUBAGENT_SHARED_PREFIX.length < 2900` (runtime, not file size)
4. All 5 mode files' spawn-site regions enumerate `inputTokens`/`outputTokens`/`model`/`omit`
5. `execute.md` example uses `Date.now() - ts` + non-round token counts
6. `postmortem.ts` has `intentional` comment at both vault literal sites
7. Changeset present

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| `SUBAGENT_SHARED_PREFIX.length` exceeds 3000 | Wave 1 RUNTIME verify ≤2900 (margin ≥100); trim existing prose if needed |
| Test 1.3.1 false-pass via permissive matcher | Uses `.toContain(literal)`, not regex; literal substrings enumerated |
| `outcome` enum drift (new value added later breaks success rule) | Use `completed*` rule covering all `completed_*` variants |
| `postmortem.ts` doc-only fix gets bikeshed-rejected | Comment phrasing precise; cited as scope decision (RESEARCH Open Q1) |

## Architectural Quality Check

- **Depth over extraction**: No new extracted helpers. New test files have deep test surface (20+ cases / file).
- **Promotion model**: All new tests tier-1 (private to test suite, no callers).
- **Concrete first**: No abstractions. Prose changes are concrete strings.
- **Locality of change**: Each fix concentrated in single file or co-located prose block.
- **Interface-first tasks**: Each task delivers verifiable public surface (test assertion, prose substring, runtime length check).

## Closes

#19 (correlationId unit drift — cosmetic cleanup), #20 (fabricated durationMs), #21 (recall vault hardcoded — documented intentional), #22 (success:null semantics), #24 (usage-comment field-completeness drift)
