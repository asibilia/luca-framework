# Execution Summary: 04-signal-capture-telemetry

**Status:** All 4 waves complete (11/11 tasks). `luca checks run` (tsc) passed after every wave. Staged-only (stage-gate blocks bash-commit in EXECUTING — commits at next allowed point).

**Core approach:** capture via NEW telemetry kinds on the existing `luca telemetry emit` surface — zero new CLI verbs, zero 3-registry cost. The open `TelemetryKind` union (`kind: z.string()`) means no schema-version break.

| Wave | Tasks | Files |
|------|-------|-------|
| 1 | 1.1.1 kinds+OverrideSource enum, 1.1.2 advisory MetaSchemas | luca-core/src/telemetry/schemas.ts + index.ts |
| 2 | 1.2.1 classifier.override emit (lu Triage), 1.2.2 aggregator | lu/index.ts, luca-telemetry-report/index.ts |
| 3 | 1.3.1 satisfaction 3-path, 1.3.2 failure dumps, 1.3.3 aggregator | lu/index.ts (serial), luca-telemetry-report/index.ts |
| 4 | 1.4.1 learner clustering, 1.4.2 learn-step digest injection, 1.4.3 session-resume readback | learner.ts, lu/index.ts, session-resume/index.ts |

## Deliverables
- D1 3-path satisfaction → `signal.satisfaction` meta `{source:'gate-ask'|'oversight-pause'|'outcome', valence, step, detail}`; **outcome PRIMARY** (full-auto never signal-empty) per gate resolution.
- D2 failure dumps → `signal.failure-dump` at verify-escalate/checks-exhausted/subagent-crash; inline meta or `.luca/tmp/<kebab>.json` via `meta.dumpRef`.
- D3 synthesis clusters → learner Step 1b clusters orchestrator-injected `<signal-digest>` into a `## Signal Synthesis` learn.md section (anti-06: digest injected, learner has no MCP/Bash).
- D4 session readback → session-resume step replays run `signal.*` telemetry + prior learn.md themes.
- D5 classifier-override → `classifier.override` emit on heuristic-vs-final complexity mismatch, `meta {classifier,from,to,source}`, taxonomy cli-flag|force-complex|human-ask|heuristic-promotion (`luca classify --task "<request>" --json` full invocation).
- D6 schema substrate → 3 new kinds + OverrideSourceSchema + 3 `.passthrough()` advisory MetaSchemas (anti-04: never `.parse()`d in emit path; anti-01: no field-optionality change).

## Confidence gate
1 `ask` (per-message→per-decision+per-step-outcome reframe) → user selected per-decision + per-step-outcome, outcome PRIMARY. 2 design-choices auto-routed.

## Deviations
- Per-task commits impossible (stage-gate denies bash-commit in EXECUTING); per-task `git add` only.
