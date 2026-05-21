# Plan: /memory-audit skill

## Objective
Build paginated LLM-judged retro-pass skill over MuninnDB vault. Resumable cursor. Trust-tier corrections via `muninn_trust`. Per-run audit reports. Whitelist update so `repo-cleanup` doesn't flag the new dir.

## Context
See `CONTEXT.md` (D1–D18). Critical risks: LLM false-verified promotion (mitigated via dry-run default + citation rule + per-memory confirm); scope creep to mutating tools (mitigated via hard-prohibition block + regex test); cursor split-brain (mitigated via trust-then-advance ordering).

## Phases

### Phase 1: /memory-audit skill

#### Wave 1: Skill + slash command (vertical tracer)

- [ ] **Task 1.1.1** — Create `packages/luca-mastracode/skills/memory-audit/SKILL.md`
  - Full YAML frontmatter (name, multi-line description with trigger phrases).
  - Canonical headings (T3 will assert full text): `## Step 1 — Resolve vault and load state`, `## Step 2 — Paginate vault (hybrid cursor + semantic)`, `## Step 3 — LLM-judge batch against tier rule`, `## Step 4 — Apply trust corrections (gated)`, `## Step 5 — Persist cursor and write report`, `## Step 6 — Resume / completion`.
  - Hard-prohibition block delimited by `<!-- forbidden-tools-list-start -->` ... `<!-- forbidden-tools-list-end -->` fences listing forbidden tools (muninn_remember, muninn_remember_batch, muninn_forget, muninn_consolidate, muninn_evolve). Forbidden-tool regex test scans content OUTSIDE these fences (G-DX-001).
  - Citation-presence rule for `verified` (file path / PR id / URL / quoted source required).
  - Per-memory confirm gate prose (non-full-auto path).
  - `--dry-run` default ON; `--apply` required to mutate.
  - Tier-rule reference inline (verified/inferred/external/untrusted definitions).
  - Explicit prose line: "This skill never assigns `untrusted` or modifies `external` tier memories." (G-SCOPE-001).
  - Step 5 includes one-line rationale: "writePlanningFileTool is non-atomic; idempotent re-trust on resume makes this safe." (G-ARCH-001).
  - State.json schema documented.
  - Failure-modes table at bottom.
  - Files: `packages/luca-mastracode/skills/memory-audit/SKILL.md` (NEW)
  - Verification: file exists; markdown parses; sections present; forbidden-tool regex absent (outside prohibition fences); tier-rule prose present.

- [ ] **Task 1.1.2** — Create `packages/luca-mastracode/commands/memory-audit.md`
  - Mirror `commands/luca-init.md` (270-byte template).
  - Frontmatter `name: memory-audit`, one-line description.
  - Body: "Activate the `memory-audit` skill. Optional args (`--dry-run`, `--apply`, `--vault <name>`, `--resume`, `--limit <n>`):" + `$ARGUMENTS`.
  - Files: `packages/luca-mastracode/commands/memory-audit.md` (NEW)
  - Verification: file exists; activates skill name; `$ARGUMENTS` token present.

#### Wave 2: Whitelist update (one-line infra)

- [ ] **Task 1.2.1** — Add `'audits'` to `ROOT_WHITELIST_DIRS` in `packages/luca-mastracode/src/tools/repo-cleanup.ts` (lines 90-95).
  - Files: `packages/luca-mastracode/src/tools/repo-cleanup.ts` (MOD)
  - Verification: `ROOT_WHITELIST_DIRS.has('audits')` is true; no test breakage; `bun run check` clean.

#### Wave 3: Tests

- [ ] **Task 1.3.1** — Create `packages/luca-mastracode/src/__tests__/memory-audit.test.ts`
  - Test 1: skill SKILL.md exists at expected path + non-empty.
  - Test 2: slash-command shim exists + has `$ARGUMENTS` + activates `memory-audit`.
  - Test 3: SKILL.md contains full canonical heading lines verbatim (e.g., `## Step 1 — Resolve vault and load state`) not just `## Step N` prefix (G-DX-003).
  - Test 4: SKILL.md prohibition block fenced by `<!-- forbidden-tools-list-start -->` / `<!-- forbidden-tools-list-end -->` markers; regex-scans content OUTSIDE fences for absence of forbidden tool names (`muninn_forget`, `muninn_consolidate`, `muninn_evolve`, `muninn_remember_batch`, bare `muninn_remember\b`). Inside fences allowed (the prohibition list mentions them by name).
  - Test 5: SKILL.md contains `--dry-run` default-ON prose.
  - Test 6: SKILL.md contains citation-presence rule for `verified`.
  - Test 7: `ROOT_WHITELIST_DIRS` contains `'audits'` (regression guard).
  - Files: `packages/luca-mastracode/src/__tests__/memory-audit.test.ts` (NEW)
  - Verification: all 7 tests pass; total suite green.

## Verification Criteria

1. New SKILL.md present at `packages/luca-mastracode/skills/memory-audit/SKILL.md`.
2. New shim present at `packages/luca-mastracode/commands/memory-audit.md`.
3. `ROOT_WHITELIST_DIRS` includes `'audits'`.
4. All new tests pass; no regression in existing suite.
5. `bun run check` clean (tsc + eslint).
6. `memory-tier-callsite.test.ts` passes (skill has no untagged `muninn_remember` since D8 forbids any).
7. `no-luca-leak.test.ts` passes (no luca-framework scope leakage).
8. Manual smoke: `/memory-audit --dry-run` instructions are clear and complete on read.

## Risks & Mitigations

- **R1 (CRITICAL)**: LLM false-verified promotion → dry-run default + citation rule + per-memory confirm + skill emits only verified/inferred.
- **R2 (HIGH)**: Scope creep to mutating tools → hard-prohibition block + regex test (T4).
- **R3 (HIGH)**: Cursor split-brain → trust-calls-first-then-advance ordering documented in SKILL.md.
- **R4 (HIGH)**: Whitelist gap → Wave 2 adds `'audits'` to `ROOT_WHITELIST_DIRS`.
- **R5–R10**: Vault pinning, idempotency, drift logging, batch sizing — all addressed in SKILL.md prose.

## Architectural Quality Check

- **D1 (Depth)**: Skill is one cohesive markdown module — single deep interface (the skill activation), not a shallow wrapper over multiple files.
- **D2 (Promotion)**: Test file is single-caller (the test runner). Stays at tier 1 (private to test runner). No premature shared-utility extraction.
- **D3 (Concrete first)**: No abstract types/interfaces. Direct prose + concrete one-line whitelist edit + concrete tests.
- **D4 (Locality)**: All skill behavior in one SKILL.md. State schema + report format + tier rule in one place.
- **D5 (Interface-first task boundaries)**: Each task delivers a testable surface — Task 1.1.1 = SKILL.md content tests; 1.1.2 = command shim activation; 1.2.1 = whitelist regression; 1.3.1 = the verifying surface.
