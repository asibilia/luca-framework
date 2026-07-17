---
id: 01-trace-insights-p2-muninn-persistence
title: trace-insights P2 — MuninnDB persistence stage (Stage F) + analysis cursor
wave: 1
tasks: 3
---

# Plan: trace-insights P2 — MuninnDB persistence (Stage F) + analysis cursor

## Objective
Extend the `trace-insights` skill body with **Stage F — Memory persistence** and a remember-latest-wins analysis cursor, update its `description` + header doc comment, and flip/extend the body-regression tests. Pure prompt-artifact change — exactly two files.

## Context
- Authoritative inputs (read FIRST, do not contradict): `.luca/phases/01-trace-insights-p2-muninn-persistence/research.md` (line-verified scope + precedent quotes) and `context.md` (LOCKED decisions).
- Locked decisions: Stage F appended AFTER Stage E (issue feed untouched); cursor = remember-latest-wins per memory-audit precedent (fresh `muninn_remember` of `metric:trace-insights-cursor` each run; read via `muninn_recall` `mode: "recent"`, `limit: 1`; corrupt cursor → fresh state, 7d fallback, warn, do not abort); bounded cursor JSON `{ schemaVersion, lastAnalyzedUntil, seenTraceIds (overlap window only), updatedAt }`; `metric:trace-report-<date>` = compact JSON digest (never prose); `--since auto` new default (accepts `auto` | `^\d+[dh]$` | ISO); `--dry-run` = zero MuninnDB writes INCLUDING cursor (cursor READ allowed); insight dedup = recall-then-evolve, best-effort, fingerprint-derived stable concept slugs; vault routing `pitfall:trace-*`/`pattern:trace-*` → `default`, `metric:*` → repo vault (`.luca/config.json` → `muninn.vault`, fallback `"default"`); `muninn_forget`/`muninn_state`/`muninn_consolidate`, `.luca/` writes, `luca` CLI mutations, LangSmith mutations stay forbidden; one-line cursor vault-pinning note ("cursor lives in the invoking repo's vault").
- Test-contract strings that must survive verbatim in the body: `` 'Any `Write` under `.luca/`' ``, `'luca state advance'`, `'queried read-only'`, `'Dedup search — mandatory before every create'`, `'would-be issues'`.
- Precedent phrasing to mirror (quoted in research.md): memory-audit cursor schema/read/corruption/ordering; seed-memory recall-then-evolve + best-effort caveat; finalize `metric:*` write shape.

## Phases

### Phase 1: Stage F + cursor + tests

#### Wave 1: single vertical slice (body → tests → gates)

- [ ] **Task 1.1.1**: Rewrite `trace-insights/index.ts` for P2 — append `Stage F — Memory persistence` after Stage E; add a third permitted write surface (bounded MuninnDB writes per routing table) to the scope guard while keeping the forbidden list (`muninn_forget`, `muninn_state`, `muninn_consolidate`, `.luca/` writes, `luca` CLI mutations, LangSmith mutations); change `--since` default to `auto` (validation accepts `auto`) and extend the `--dry-run` row; replace the Notes P2 placeholder with cursor behavior + evolve-path re-run safety; update the header doc comment and `description` (`--since <auto|Nd/Nh|ISO>` default `auto`; MuninnDB persistence in scope). Stage F must contain the grep-able literals verified below: routing rows (`pitfall:trace-`, `pattern:trace-`, `metric:trace-report-`, `metric:trace-insights-cursor`), a memory-audit-style cursor JSON schema block (`schemaVersion`, `lastAnalyzedUntil`, `seenTraceIds`, `updatedAt`), cursor recall `mode: "recent"`, recall-then-evolve dedup (`muninn_evolve` by ULID on flat-engram concept match), the `best-effort` caveat with fingerprint-derived slugs, the dry-run phrase `no MuninnDB writes (including the cursor)`, and the vault-pinning note phrase `invoking repo`. Keep every test-contract string verbatim and keep escaping of `` \` ``/`\\` valid inside the template literal.
  - Files: packages/luca-tools/src/artifacts/skills/trace-insights/index.ts
  - Verification: ac-01, ac-02, ac-03, ac-04, ac-05, ac-06, ac-07, ac-08, ac-09, ac-10, ac-11, ac-12, ac-13, ac-14
  - Dependencies: none

- [ ] **Task 1.1.2**: Update `index.test.ts` — rewrite `it('forbids MuninnDB writes in P1')` into P2 assertions (routing table present; `muninn_forget`/`muninn_state`/`muninn_consolidate` still named forbidden; body does NOT contain `MuninnDB persistence is P2`); add assertions for cursor semantics (`metric:trace-insights-cursor`, `--since` `auto` default, 7d fallback), recall-then-evolve dedup (`muninn_recall` before write, `muninn_evolve` on match), and `--dry-run` skipping all MuninnDB writes `including the cursor`. Keep the `.luca/`-write, `luca state advance`, `queried read-only`, and `github-issue-feed` describe-block assertions unchanged.
  - Files: packages/luca-tools/src/artifacts/skills/trace-insights/index.test.ts
  - Verification: ac-15, ac-16, ac-17, ac-18
  - Dependencies: Task 1.1.1

- [ ] **Task 1.1.3**: Run the verification gates (typecheck, targeted test file, full luca-tools suite) and fix any regression, confining edits to the two in-scope files.
  - Files: none (gate execution only)
  - Verification: ac-19, ac-20, ac-21
  - Dependencies: Task 1.1.2

## Deliverables
- **D1**: Stage F — MuninnDB persistence stage (scope-guard third write surface, vault routing, recall-then-evolve dedup, `metric:trace-report-<date>` digest) → ac-01, ac-02, ac-03, ac-09, ac-10, ac-11, ac-12, ac-13, ac-14, ac-19
- **D2**: Analysis cursor (`--since auto` default, remember-latest-wins `metric:trace-insights-cursor`, bounded JSON schema, dry-run-safe) → ac-04, ac-05, ac-06, ac-07, ac-08
- **D3**: Updated body-regression tests → ac-15, ac-16, ac-17, ac-18, ac-20, ac-21

## Verification Criteria
Paths: `SKILL=packages/luca-tools/src/artifacts/skills/trace-insights/index.ts`, `TEST=packages/luca-tools/src/artifacts/skills/trace-insights/index.test.ts`. Each grep probe is pass when exit code is 0 unless stated.

- **ac-01**: `grep -q 'Stage F — Memory persistence' $SKILL` exits 0
- **ac-02**: `grep -q 'pitfall:trace-' $SKILL` exits 0 (default-vault routing row)
- **ac-03**: `grep -q 'metric:trace-report-' $SKILL` exits 0 (repo-vault routing row)
- **ac-04**: `grep -q 'metric:trace-insights-cursor' $SKILL` exits 0 (cursor concept)
- **ac-05**: `grep -q 'lastAnalyzedUntil' $SKILL` exits 0 (cursor JSON schema block)
- **ac-06**: `grep -q 'mode: "recent"' $SKILL` exits 0 (latest-wins cursor recall)
- **ac-07**: `grep -Eq '\-\-since.*auto' $SKILL` exits 0 (`auto` default in args table row)
- **ac-08**: `grep -q 'no MuninnDB writes (including the cursor)' $SKILL` exits 0 (dry-run rule)
- **ac-09**: `grep -q 'muninn_forget' $SKILL` exits 0 (still-forbidden tool named)
- **ac-10**: `grep -q 'muninn_state' $SKILL` exits 0 (still-forbidden tool named)
- **ac-11**: `grep -q 'muninn_consolidate' $SKILL` exits 0 (still-forbidden tool named)
- **ac-12**: `grep -q 'invoking repo' $SKILL` exits 0 (cursor vault-pinning note)
- **ac-13**: `grep -q 'muninn_evolve' $SKILL` exits 0 (recall-then-evolve dedup directive)
- **ac-14**: `grep -q 'best-effort' $SKILL` exits 0 (dedup overpromise caveat)
- **ac-15**: `grep -q 'metric:trace-insights-cursor' $TEST` exits 0 (cursor assertion present)
- **ac-16**: `grep -q 'pitfall:trace-' $TEST` exits 0 (routing-table assertion present)
- **ac-17**: `grep -q 'including the cursor' $TEST` exits 0 (dry-run-skips-writes assertion present)
- **ac-18**: `grep -q 'muninn_evolve' $TEST` exits 0 (dedup/evolve assertion present)
- **ac-19**: `bunx --bun tsc --noEmit` exits 0
- **ac-20**: `timeout 120 bun test packages/luca-tools/src/artifacts/skills/trace-insights/index.test.ts` exits 0
- **ac-21**: `bun test packages/luca-tools` exits 0

### Anti-criteria (regression guards)
- **anti-01**: MUST NOT — skill body retains the literal `MuninnDB persistence is P2`; probe: `grep -c 'MuninnDB persistence is P2' $SKILL` returns 0 matches (the literal may appear in $TEST only inside a `not.toContain` assertion)
- **anti-02**: MUST NOT — description retains the literal `no MuninnDB writes (P1)`; probe: `grep -q 'no MuninnDB writes (P1)' $SKILL` exits 1
- **anti-03**: MUST NOT — Stage E (GitHub issue feed) renamed or renumbered; probe: `grep -q 'Stage E — GitHub issue feed' $SKILL` exits 0
- **anti-04**: MUST NOT — edits outside the two in-scope files; probe: `git show --name-only` per phase commit lists no `packages/` path beyond $SKILL / $TEST

## Risks & Mitigations
- Test-assertion drift (HIGH): the literal test-contract strings in Context must survive verbatim — ac-20/ac-21 catch any slip; Task 1.1.1 lists them explicitly.
- Template-literal escaping (MEDIUM): backtick-heavy markdown must keep `` \` ``/`\\` escapes valid — ac-19 (tsc) catches breakage.
- Stage-letter ripple (HIGH in research): resolved by LOCKED decision 1 (Stage F appended, Stage E untouched) — anti-03 guards it.
- Dedup overpromise (MEDIUM): phrased best-effort with fingerprint-derived slugs (ac-14) per seed-memory/learner precedent.

## Decisions
- 2026-07-16 — Verification via mandated grep-able literals (Task 1.1.1 names the exact strings the probes check) instead of semantic judgment probes; keeps every ac a single binary command.
- 2026-07-16 — Single wave with intra-wave Dependencies (1.1.1 → 1.1.2 → 1.1.3): a 2-file docs-as-code change has no parallelizable slices; each task still leaves a committable state.
- 2026-07-16 — Cursor schema fixed to exactly the four locked minimum fields (`schemaVersion`, `lastAnalyzedUntil`, `seenTraceIds`, `updatedAt`); no extra fields without a new decision.
- 2026-07-16 — Branch setup skipped: phase executes on existing feature branch `dad-xstate-migration` (P1 shipped there, uncommitted); no new branch or issue created at plan time.
