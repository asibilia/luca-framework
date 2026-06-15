---
id: 04-signal-capture-telemetry
title: Signal Capture & Classifier-Override Telemetry
waves: 4
tasks: 11
---

# Plan: Signal Capture & Classifier-Override Telemetry

## Objective
Capture satisfaction/failure signals and classifier-override telemetry by emitting NEW telemetry kinds through the existing `luca telemetry emit` surface — zero new CLI verbs, zero 3-registry cost. Add lightweight fail-safe Zod meta-validators, wire orchestrator capture points in the `lu` skill body, extend the learner to cluster signals into themes, and read signals back at session-resume. Faithfully adapts REQ-04's "per-message" framing to Luca's per-decision / per-step-outcome model (no message loop exists).

## Context
- `kind` is an OPEN union (`schemas.ts:39`, validated `z.string()` :74) — new kinds need NO schema change. `meta: Record<string,unknown>` (:81) is the payload channel.
- `luca telemetry emit` (telemetry.ts CLI) is in LUCA_TOPLEVEL_READ → always-available write surface in every phase; emit is fail-safe (never throws, `telemetry.ts:9-13`).
- Aggregator `luca-telemetry-report` known-kind list (`index.ts:39-45`) tolerates unknown kinds — adding a kind is a doc/aggregator-line addition only.
- Capture points: `lu/index.ts` Triage (:59, classifier-override), Confidence Gate ask (:121, gate-ask + human-ask), oversight pauses, verify/checks/review terminal branches (implicit outcome — the ONLY full-auto signal, so make it PRIMARY).
- REQ-05 target = the COMPLEXITY classifier (no error classifier exists). `luca classify --json` prints heuristic level, no persistence.
- Learner (`learner.ts`) has NO MCP/Bash — orchestrator injects the signal digest into its prompt. session-resume reconstructs from artifacts but does not read signals back.

## Phases

### Phase 1: Signal & override telemetry

#### Wave 1: Schema tracer (luca-core, owns telemetry/schemas.ts)
- [ ] **Task 1.1.1**: Add the 3 new kinds to the `TelemetryKind` union (additive, doc/IDE-hint only) and an `OverrideSource` enum `z.enum(['cli-flag','force-complex','human-ask','heuristic-promotion'])`.
  - Files: packages/luca-core/src/telemetry/schemas.ts
  - Verification: ac-01, ac-02, anti-04
  - Dependencies: none
- [ ] **Task 1.1.2**: Add lightweight fail-safe `SatisfactionSignalMetaSchema`, `ClassifierOverrideMetaSchema`, `FailureDumpMetaSchema` (`.passthrough()`-equivalent, never tighten `TelemetryRecord` field optionality) and export them.
  - Files: packages/luca-core/src/telemetry/schemas.ts, packages/luca-core/src/telemetry/index.ts
  - Verification: ac-03, anti-01, anti-04
  - Dependencies: 1.1.1

#### Wave 2: REQ-05 classifier-override emit (lu Triage step)
- [ ] **Task 1.2.1**: In the `lu` Triage step, after final complexity is chosen, compare it against the heuristic level from `luca classify --task "<request>" --json` (`--task` is required); on mismatch emit kind `classifier.override` with `meta {classifier:'complexity', from, to, source}` per the taxonomy.
  - Files: packages/luca-tools/src/artifacts/skills/lu/index.ts
  - Verification: ac-04, ac-05, anti-02, anti-03
  - Dependencies: 1.1.1
- [ ] **Task 1.2.2**: Add `classifier.override` to the aggregator known-kind list and a one-line summary in the report.
  - Files: packages/luca-tools/src/artifacts/skills/luca-telemetry-report/index.ts
  - Verification: ac-06
  - Dependencies: 1.1.1

#### Wave 3: REQ-04 capture (lu skill — satisfaction + failure dumps)
> File-ownership: 1.3.1 and 1.3.2 both edit `lu/index.ts` — run them SERIALLY (1.3.1 then 1.3.2), not in parallel. 1.3.3 (aggregator) is parallel-safe.
- [ ] **Task 1.3.1**: Wire the 3 satisfaction capture paths — emit `signal.satisfaction` `meta {source:'gate-ask'|'oversight-pause'|'outcome', valence, step, detail}` at gate-ask answers, oversight pauses, and verify/checks/review terminal outcomes. Make the implicit `outcome` path PRIMARY so full-auto runs are never signal-empty.
  - Files: packages/luca-tools/src/artifacts/skills/lu/index.ts
  - Verification: ac-07, ac-08, ac-09, anti-02
  - Dependencies: 1.1.2
- [ ] **Task 1.3.2**: Emit `signal.failure-dump` at verify-escalate / checks-fail-exhausted / subagent-crash branches; small dumps inline in meta, large dumps to `.luca/tmp/<kebab>.json` referenced via `meta.dumpRef`.
  - Files: packages/luca-tools/src/artifacts/skills/lu/index.ts
  - Verification: ac-10, ac-11, anti-02, anti-05
  - Dependencies: 1.1.2
- [ ] **Task 1.3.3**: Add `signal.satisfaction` and `signal.failure-dump` to the aggregator known-kind list with one-line summaries each.
  - Files: packages/luca-tools/src/artifacts/skills/luca-telemetry-report/index.ts
  - Verification: ac-12
  - Dependencies: 1.1.1

#### Wave 4: REQ-04 synthesis + readback (learner + session-resume)
> File-ownership: 1.4.1 (learner), 1.4.2 (lu/index.ts), 1.4.3 (session-resume) touch distinct files — parallel-safe.
- [ ] **Task 1.4.1**: Add a learner instruction step that reads an orchestrator-injected signal digest (run's `signal.*` + confidence journal) and clusters it into themes written to `learn.md`. State clearly the digest is orchestrator-injected (learner has no Bash/MCP).
  - Files: packages/luca-tools/src/artifacts/subagents/learner.ts
  - Verification: ac-13, anti-06
  - Dependencies: 1.3.1
- [ ] **Task 1.4.2**: In the `lu` `learn` step, gather the run's `signal.*` telemetry + confidence journal and inject the digest into the learner prompt (mirror the gate-resolution injection pattern at lu/index.ts:130).
  - Files: packages/luca-tools/src/artifacts/skills/lu/index.ts
  - Verification: ac-14
  - Dependencies: 1.4.1
- [ ] **Task 1.4.3**: Add a session-resume readback step that surfaces the run's `signal.*` telemetry and clustered learn.md themes on resume.
  - Files: packages/luca-tools/src/artifacts/skills/session-resume/index.ts
  - Verification: ac-15, anti-06
  - Dependencies: 1.3.1

## Risks & Mitigations
- **Phantom CLI capability** (3rd-occurrence theme): no new verb; every `luca …` string in instruction bodies is grep-verified against telemetry.ts CLI before write. Mitigated by anti-02.
- **Template/schema drift**: every meta JSON example in an instruction body must safeParse against its new MetaSchema. Mitigated by ac-08/ac-11 referencing concrete shapes.
- **Full-auto signal sparsity**: implicit `outcome` satisfaction is PRIMARY (ac-09).
- **Subagent no-MCP**: learner digest is orchestrator-injected, not subagent-fetched (anti-06).

## Decisions
- 2026-06-14 — Capture via new telemetry kinds on `luca telemetry emit`; NO new CLI verb (confidence: medium, design-choice).
- 2026-06-14 — Failure dumps: small inline meta, large to `.luca/tmp/<kebab>.json` via meta.dumpRef (medium).
- 2026-06-14 — REQ-04 "per-message" reframed as per-decision + per-step-outcome (low confidence → confidence-gate `ask`; the one genuine human design decision).
- 2026-06-14 — Synthesis clustering extends the learner rather than a new pipeline step (medium).
- 2026-06-14 — The new `*MetaSchema` validators are ADVISORY shape definitions (IDE-hint/doc) — NOT wired into any throwing path. The real emit fail-safety already lives in `appendTelemetry` (telemetry.ts:135-163: safeParse+drop+warn+try/catch) and the CLI `--meta` JSON-parse (telemetry.ts:56-75) which exit-1s only on malformed meta JSON (pre-existing, not the delta). Executor MUST NOT call `.parse()` on a MetaSchema in the emit hot path; `safeParse` only, if used at all. anti-04 guards this (medium, design-choice).
- Lint note: ac-08/ac-12 are SPLIT parents → `[SPLIT → …]` pointer lines, excluded from verify.json per the ID-stability rule (verify grades only the live ac-08.1/.2 and ac-12.1/.2 children, never the split parents — G-CRIT-003 confirmed). ac-09 names one grep probe (single binary, no compound).

## Plan Review Resolutions (round 1)
- **G-CRIT-001** (non-discriminating probes): ac-08.1 retargeted to `source:'gate-ask'` (NEW meta literal, not the pre-existing `[gate-ask]` annotation); ac-11 dropped the `.luca/tmp` alt (matched pre-existing handoff paths) → `dumpRef` only.
- **G-CRIT-002** (anti-04 verified pre-existing fail-safety): retargeted to forbid `MetaSchema.parse(` in the emit path (MetaSchemas are advisory); Decisions entry added.
- **G-DX-001** (ac-09 prose token): retargeted to behavioral `source:'outcome'` emit-by-construction probe.
- **G-DX-002** (ac-14 prose): pinned to runnable `<signal-digest>` grep in the learn-step injection block.
- **G-SCOPE-001** (ac-05 / Task 1.2.1 broken command): updated to full `luca classify --task "<request>" --json` (`--task` required); anti-03 synced.
- **G-CRIT-003** (split-parent grading): confirmed in Decisions/Lint note — verify grades live children only, not `[SPLIT → …]` parents.

## Deliverables
- **D1** (REQ-04 3-path satisfaction capture): per-decision/per-step satisfaction signals at gate-ask, oversight-pause, and outcome paths → ac-07, ac-08, ac-09, ac-12
- **D2** (REQ-04 failure dumps): failure-dump signal at terminal failure branches, inline + dumpRef → ac-10, ac-11
- **D3** (REQ-04 synthesis clusters): learner clusters signals into themes in learn.md → ac-13, ac-14
- **D4** (REQ-04 session readback): session-resume reads back signals + themes → ac-15
- **D5** (REQ-05 classifier-override telemetry): `classifier.override` emit with override-source taxonomy → ac-04, ac-05, ac-06
- **D6** (schema substrate): new kinds + override-source enum + fail-safe meta-validators, no field-optionality change → ac-01, ac-02, ac-03

## Verification Criteria
- **ac-01**: `grep -c "signal.satisfaction\|signal.failure-dump\|classifier.override" packages/luca-core/src/telemetry/schemas.ts` is ≥3 (the 3 new kinds present in the union; pre→post 0→≥3).
- **ac-02**: `grep -q "OverrideSource\|'cli-flag'.*'force-complex'.*'human-ask'.*'heuristic-promotion'" packages/luca-core/src/telemetry/schemas.ts` exits 0 (override-source enum present).
- **ac-03**: `grep -c "SatisfactionSignalMetaSchema\|ClassifierOverrideMetaSchema\|FailureDumpMetaSchema" packages/luca-core/src/telemetry/schemas.ts` is ≥3 (3 meta-validators defined).
- **ac-04**: `grep -q "classifier.override" packages/luca-tools/src/artifacts/skills/lu/index.ts` exits 0 (override emit wired in lu body; pre→post 0→1+).
- **ac-05**: `grep -qE "luca classify --task .* --json" packages/luca-tools/src/artifacts/skills/lu/index.ts` exits 0 (heuristic-vs-final comparison uses the FULL invocation — `--task` is a REQUIRED arg per classify.ts:30-35, so a bare `luca classify --json` would ship a broken command; pre→post 0→1).
- **ac-06**: `grep -q "classifier.override" packages/luca-tools/src/artifacts/skills/luca-telemetry-report/index.ts` exits 0 (kind added to aggregator known list).
- **ac-07**: `grep -q "signal.satisfaction" packages/luca-tools/src/artifacts/skills/lu/index.ts` exits 0 (satisfaction emit wired; pre→post 0→1+).
- **ac-08**: `grep -q "'gate-ask'\|gate-ask" packages/luca-tools/src/artifacts/skills/lu/index.ts` exits 0 AND `grep -q "'oversight-pause'\|oversight-pause" packages/luca-tools/src/artifacts/skills/lu/index.ts` exits 0 — [SPLIT → ac-08.1, ac-08.2]
- **ac-08.1**: `grep -qE "source:\s*'gate-ask'" packages/luca-tools/src/artifacts/skills/lu/index.ts` exits 0 (NEW satisfaction-signal meta literal `source:'gate-ask'` from Task 1.3.1 — distinct from the pre-existing `[gate-ask]` gate annotation, which `source:` does not match; pre→post 0→1).
- **ac-08.2**: `grep -q "oversight-pause" packages/luca-tools/src/artifacts/skills/lu/index.ts` exits 0 (oversight-pause satisfaction source present).
- **ac-09**: `grep -qE "source:\s*'outcome'" packages/luca-tools/src/artifacts/skills/lu/index.ts` exits 0 (the implicit-outcome satisfaction emit exists BY CONSTRUCTION — the full-auto sparsity guarantee for D1; behavioral probe on the emit meta literal, not the prose token "PRIMARY"; pre→post 0→1).
- **ac-10**: `grep -q "signal.failure-dump" packages/luca-tools/src/artifacts/skills/lu/index.ts` exits 0 (failure-dump emit wired).
- **ac-11**: `grep -q "dumpRef" packages/luca-tools/src/artifacts/skills/lu/index.ts` exits 0 (large-dump `meta.dumpRef` is the unique NEW token; the `.luca/tmp` alternative was dropped — it matched the pre-existing roadmap.json/checks.json handoff paths; pre→post 0→1).
- **ac-12**: `grep -q "signal.satisfaction" packages/luca-tools/src/artifacts/skills/luca-telemetry-report/index.ts` exits 0 AND `grep -q "signal.failure-dump" …` exits 0 — [SPLIT → ac-12.1, ac-12.2]
- **ac-12.1**: `grep -q "signal.satisfaction" packages/luca-tools/src/artifacts/skills/luca-telemetry-report/index.ts` exits 0.
- **ac-12.2**: `grep -q "signal.failure-dump" packages/luca-tools/src/artifacts/skills/luca-telemetry-report/index.ts` exits 0.
- **ac-13**: `grep -qi "cluster\|theme\|synthesi" packages/luca-tools/src/artifacts/subagents/learner.ts` exits 0 (signal-clustering step added to learner).
- **ac-14**: `grep -qE "<signal-digest>|signal-digest" packages/luca-tools/src/artifacts/skills/lu/index.ts` exits 0 (the learn-step digest-injection block — mirrors the `<confidence-gate-resolutions>` injection pattern at lu/index.ts:130-142 — is present; the `signal-digest` tag is a NEW token absent pre-phase; pre→post 0→1).
- **ac-15**: `grep -qi "signal" packages/luca-tools/src/artifacts/skills/session-resume/index.ts` exits 0 (readback step references signal telemetry).
- **ac-16**: `bunx --bun tsc --noEmit` exits 0 (no type errors across the schema + instruction-body deltas).

### Anti-criteria (regression guards)
- **anti-01**: MUST NOT change the required/optional status of any pre-existing `TelemetryRecord` field — `git diff packages/luca-core/src/telemetry/schemas.ts` shows no edit to the `TelemetryRecordSchema` field block (lines defining v/ts/runId/kind/phase/slug/wave/complexity/oversight/durationMs/meta).
- **anti-02**: MUST NOT register a new CLI verb/subcommand — `git diff packages/luca-cli/src/commands/telemetry.ts packages/luca-cli/src/cli.ts` is empty (no `subCommands`/`defineCommand` additions for signals/override).
- **anti-03**: MUST NOT reference any `luca` verb/flag absent from telemetry.ts/classify.ts CLI — every `luca …` string added to lu/index.ts grep-matches an existing verb (`telemetry emit`, `classify --task … --json`).
- **anti-04**: MUST NOT wire any `*MetaSchema` into a throwing emit path — the new MetaSchemas are ADVISORY shape definitions (IDE-hint/doc) only, never `.parse()`d in the emit hot path (the pre-existing `appendTelemetry` is already safeParse+drop+warn; see Decisions). `grep -rn "MetaSchema.parse(" packages/luca-core/src/telemetry packages/luca-cli/src/commands/telemetry.ts` returns 0 matches (only `safeParse`, if used at all).
- **anti-05**: MUST NOT add a new `.luca/` phase-artifact contract entry for failure dumps — `git diff packages/luca-core/src/luca-dir` is empty (dumps live in gitignored `.luca/tmp/`).
- **anti-06**: MUST NOT instruct a subagent to fetch telemetry/MuninnDB itself — learner/session-resume bodies state the digest is orchestrator-injected; `grep -q "mcp__muninn\|luca telemetry" packages/luca-tools/src/artifacts/subagents/learner.ts` finds no new such call.
- **anti-07**: MUST NOT create `.test.ts` files or invoke `bun test` — `git diff --name-only` shows no `*.test.ts` and no instruction body adds a `bun test` command.
