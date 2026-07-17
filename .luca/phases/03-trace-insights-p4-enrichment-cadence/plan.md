---
id: trace-insights-p4-enrichment-cadence
title: Trace-insights P4 — capture-side metadata enrichment + weekly cadence
trace_id: TI-P4
complexity: MODERATE
waves:
  - wave: 1
    tasks: [t1, t2]
  - wave: 2
    tasks: [t3]
  - wave: 3
    tasks: [t4]
---

# Trace-insights P4 — Enrichment + Cadence

## Objective

`luca init` enriches target repo's `.claude/settings.local.json` with merged `CC_LANGSMITH_METADATA` (repo + luca_version), gated on TRACE_TO_LANGSMITH. Weekly `/trace-insights` cadence documented as operator runbook. Code + tests + docs only — actual `/schedule` creation is post-merge operator step (repo pipeline cannot verify a live routine).

## Context

- Init flow: `packages/luca-cli/src/commands/init.ts` — 5 steps; Step 5 (per-project) already writes project `.claude/` via `installHooks`. New step slots there.
- Helper conventions: `packages/luca-cli/src/init/helpers/*.ts`, pure merge fn exported for tests (see `install-statusline.ts` `mergeStatuslineRegistration`, `install-hooks.ts` settings merge). Barrel: `src/init/index.ts`. Tests sibling `.test.ts`.
- Plugin config verified live: `~/.claude/settings.json` `env` block holds `TRACE_TO_LANGSMITH: "true"` + `CC_LANGSMITH_METADATA` (JSON string). Plugin spreads user env metadata LAST downstream — user keys win.
- Version precedent: `utils/version-check.ts` resolves package.json relative to module (dist/ + src/ dual path). Repo-name precedent: `basename(cwd)` in `utils/vault-setup.ts`.
- Skill Stage A already prefers `extra.metadata.repo` — NO trace-insights skill change needed.

## Design decisions (binding)

- **New helper** `packages/luca-cli/src/init/helpers/enrich-trace-metadata.ts`: `enrichTraceMetadata({ cwd, claudeHome?, lucaVersion?, repoName?, log? })` (IO wrapper) + pure `mergeTraceMetadata(existingMetadataJson, { repo, lucaVersion })` exported for tests. Called from `commands/init.ts` Step 5, next to `installHooks`. Export via `src/init/index.ts`.
- **Gate**: read global `<claudeHome>/settings.json` `env.TRACE_TO_LANGSMITH === 'true'` (fallback `process.env.TRACE_TO_LANGSMITH`). Not configured → return silently, zero writes to settings.local.json.
- **Merge ownership** (load-bearing): luca-owned keys `repo`, `luca_version` always refreshed; defaults `environment: "production"`, `ls_message_format: "anthropic"` fill only when absent; every other pre-existing user key preserved verbatim (user wins on collision). Pre-existing metadata source = target repo's `.claude/settings.local.json` `env.CC_LANGSMITH_METADATA`.
- **Schema-first**: Zod `safeParse` for settings.local.json object AND nested CC_LANGSMITH_METADATA JSON string. Malformed → warn + skip (never crash init, never rewrite unparseable file — `install-statusline.ts` fail-open precedent). Non-metadata keys in settings.local.json (permissions, hooks, other env) pass through untouched.
- **Inputs**: repoName = basename of `git rev-parse --show-toplevel`, fallback `basename(cwd)`; lucaVersion from installed package's package.json (version-check.ts resolution pattern), fallback `"unknown"`.
- **Runbook**: `docs/guides/trace-insights-cadence.md` — NOT skill body Notes (keeps anti-01 simple; confidence entry runbook-location).

## Phases

### Phase 1: Enrichment + cadence

#### Wave 1: Helper tracer (testable interface)
- [ ] **Task t1 (1.1.1)** [AFK]: Create `enrich-trace-metadata.ts` — pure `mergeTraceMetadata` + `enrichTraceMetadata` IO wrapper with TRACE_TO_LANGSMITH gate, Zod safeParse schemas, JSDoc per mandatory-documentation.
  - Files: packages/luca-cli/src/init/helpers/enrich-trace-metadata.ts
  - Verification: ac-01, ac-05, ac-11
- [ ] **Task t2 (1.1.2)** [AFK]: Create sibling test file — merge collision (custom user key survives), luca-owned refresh (repo + luca_version present after re-run), no-op when TRACE_TO_LANGSMITH unset, malformed-JSON skip, unrelated settings keys untouched.
  - Files: packages/luca-cli/src/init/helpers/enrich-trace-metadata.test.ts
  - Verification: ac-02, ac-03, ac-04, ac-10
  - Dependencies: t1

#### Wave 2: Wiring
- [ ] **Task t3 (1.2.1)** [AFK]: Export helper from `src/init/index.ts`; call `enrichTraceMetadata` in `commands/init.ts` Step 5 after `installHooks`; run gates.
  - Files: packages/luca-cli/src/init/index.ts, packages/luca-cli/src/commands/init.ts
  - Verification: ac-01, ac-06, ac-09
  - Dependencies: t1

#### Wave 3: Runbook docs
- [ ] **Task t4 (1.3.1)** [AFK]: Write `docs/guides/trace-insights-cadence.md` — weekly `/schedule` routine setup (documented post-merge operator step), inspect/disable runbook, guardrails: weekly < ~14d shortlived retention; per-run cost (Stage A–B free, Stage C ≈ 8 subagents, low single-digit dollars).
  - Files: docs/guides/trace-insights-cadence.md
  - Verification: ac-07, ac-08
  - Dependencies: none

## Deliverables

- **D1**: init metadata enrichment — merged (not clobbered) CC_LANGSMITH_METADATA with repo + luca_version → ac-02, ac-03, ac-05, ac-06, ac-10, ac-11
- **D2**: silent skip when TRACE_TO_LANGSMITH not configured → ac-04
- **D3**: weekly cadence runbook + guardrails (operational /schedule creation documented as post-merge operator step, not executed in-repo) → ac-07, ac-08
- **D4**: quality gates green (tsc + init tests + package suite) → ac-01, ac-02, ac-09

## Verification Criteria

- **ac-01**: `bunx --bun tsc --noEmit` exits 0.
- **ac-02**: `timeout 120 bun test packages/luca-cli/src/init` exits 0.
- **ac-03**: `grep -q "custom" packages/luca-cli/src/init/helpers/enrich-trace-metadata.test.ts` exits 0 (collision test: pre-existing user CC_LANGSMITH_METADATA custom key survives merge).
- **ac-04**: `grep -q "TRACE_TO_LANGSMITH" packages/luca-cli/src/init/helpers/enrich-trace-metadata.test.ts` exits 0 (unconfigured → no settings.local.json write test present).
- **ac-05**: `grep -q "enrich-trace-metadata" packages/luca-cli/src/init/index.ts` exits 0 (barrel export wired).
- **ac-06**: `grep -q "enrichTraceMetadata" packages/luca-cli/src/commands/init.ts` exits 0 (Step 5 call wired).
- **ac-07**: `test -f docs/guides/trace-insights-cadence.md` exits 0.
- **ac-08**: `grep -qi "disable" docs/guides/trace-insights-cadence.md` exits 0 (inspect/disable runbook present).
- **ac-09**: `timeout 120 bun test packages/luca-cli` exits 0.
- **ac-10**: `grep -q "luca_version" packages/luca-cli/src/init/helpers/enrich-trace-metadata.test.ts` exits 0 (merged output asserts repo + luca_version).
- **ac-11**: `grep -q "safeParse" packages/luca-cli/src/init/helpers/enrich-trace-metadata.ts` exits 0 (Zod schema-first parsing).

### Anti-criteria (regression guards)
- **anti-01**: MUST NOT — modify any file under `packages/luca-tools/src/artifacts/skills/trace-insights/`; probe: `git diff --name-only main... | grep -q "artifacts/skills/trace-insights/"` exits non-zero.
- **anti-02**: MUST NOT — clobber pre-existing user keys inside CC_LANGSMITH_METADATA or unrelated settings.local.json sections; probe: collision + passthrough test cases in enrich-trace-metadata.test.ts pass (`timeout 120 bun test packages/luca-cli/src/init/helpers/enrich-trace-metadata.test.ts` exits 0).

## Risks & Mitigations

- Malformed user settings.local.json → fail-open skip with warn (statusline precedent); tested.
- Plugin moves TRACE_TO_LANGSMITH location → detection isolated in one helper; confidence entry trace-config-detection flags it.
- Re-init drift → ownership merge keeps runs idempotent; luca-owned keys refresh, user keys stable.

## Decisions

- 2026-07-16 — Runbook in docs/guides/, not skill body Notes; keeps anti-01 a simple no-touch guard.
- 2026-07-16 — /schedule creation scoped OUT of in-repo deliverables (operational, unverifiable by pipeline); documented as operator step in D3 runbook.
- 2026-07-16 — Merge ownership: repo/luca_version luca-owned (refresh), env defaults fill-if-absent, user keys win otherwise.
