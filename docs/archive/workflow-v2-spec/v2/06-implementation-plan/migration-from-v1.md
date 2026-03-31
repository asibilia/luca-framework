# Migration from v1

> v2 is additive, not destructive. v1 continues to work unchanged. v2 is opt-in.

---

## Core Migration Strategy

V2 does not replace v1. It extends the existing pipeline with optional phases (research expansion, review loops, MuninnDB graduation) that are activated by configuration. When v2 is not enabled, the system behaves identically to v1.

```
v1 pipeline (always runs):
  discuss --> plan --> execute --> verify --> learn

v2 pipeline (opt-in, extends v1):
  ideate --> [research-expand] --> [research-review-loop] --> [graduate]
         --> discuss --> [plan-review-loop] --> plan --> execute --> verify --> learn
                                                          |
                                                   [per-task recall]

Brackets = v2-only steps, skipped when workflow.version != "v2"
```

---

## Gate Mechanism

### Primary Gate: `workflow.version`

The primary gate is a new field in `.planning/config.json`:

```json
{
  "workflow": {
    "version": "v1",
    "research": true,
    "plan_check": true
  }
}
```

| Value  | Behavior                                                                                 |
| ------ | ---------------------------------------------------------------------------------------- |
| `"v1"` | Default. Existing pipeline runs unchanged.                                               |
| `"v2"` | V2 extensions activate: multi-agent research, review loops, graduation, per-task recall. |

When `workflow.version` is absent or any value other than `"v2"`, the system defaults to v1 behavior. This is fail-closed: an invalid value does not accidentally activate v2.

### Secondary Gate: `--v2` CLI Flag

For per-invocation opt-in without changing config:

```bash
/lu "Add WebSocket reconnection" --v2
```

The `--v2` flag overrides `workflow.version` for a single invocation. This allows testing v2 on a specific task without committing to it project-wide. The flag is parsed by the orchestrator's prompt logic in `lu.skill.ts` (the skill checks for `--v2` in its arguments string), not by compiled CLI argument parsing.

### Per-Step Gates

Individual v2 steps can be independently configured via the `research` config section (see [config-changes.md](config-changes.md)):

```json
{
  "research": {
    "parallelResearchers": 4,
    "reviewLoop": {
      "maxIterations": 3,
      "continueForImportant": true
    },
    "graduation": {
      "confidenceThreshold": "MEDIUM",
      "scoringThreshold": 0.55
    },
    "planReviewLoop": {
      "maxIterations": 2
    },
    "perTaskRecall": {
      "enabled": true,
      "maxEngramsPerTask": 5
    }
  }
}
```

> **Important distinction**: `workflow.research` (boolean, v1) controls whether v1's single-researcher step runs at all. `research.*` (object, v2) configures v2 research system behavior. These are orthogonal -- `workflow.research: true` enables the research step in v1, while the `research` top-level section configures HOW v2 research operates when `workflow.version: "v2"`.

This allows gradual adoption:

1. Start with `workflow.version: "v2"` with default research config to test parallel research.
2. Tune `reviewLoop.maxIterations` once parallel research is validated.
3. Adjust `graduation.scoringThreshold` once the review loop is stable.
4. Enable `perTaskRecall.enabled: true` once graduation produces reliable engrams.

---

## Backward Compatibility Guarantees

### What Does NOT Change

| System                     | v2 Impact | Detail                                                                       |
| -------------------------- | --------- | ---------------------------------------------------------------------------- |
| Existing agent definitions | None      | All v1 agents (`lu-executor`, `lu-planner`, etc.) remain unchanged           |
| Existing skill definitions | None      | All v1 skills (`phase-discuss`, `phase-plan`, etc.) remain unchanged         |
| STATE.md format            | None      | No new fields. v2 state is tracked in the typed state machine.               |
| state.json format          | None      | No schema changes.                                                           |
| `.planning/config.json`    | Additive  | New sections (`research`, `workflow.version`) are optional with v1 defaults. |
| PLAN.md format             | Additive  | New optional `research_refs` field in task frontmatter.                      |
| MuninnDB vault routing     | Additive  | New `research:*` prefix. Existing prefixes unchanged.                        |
| Harness verification       | None      | Same test/typecheck/lint/build checks.                                       |
| Complexity matrix          | Additive  | New optional fields with defaults matching v1 behavior.                      |
| Model routing table        | Additive  | New entries for new agents. Existing entries unchanged.                      |
| Git workflow               | None      | Same branch/commit/PR patterns.                                              |

### What IS New (but Optional)

| Feature              | Activated by                           | Default (v1) Behavior                           |
| -------------------- | -------------------------------------- | ----------------------------------------------- |
| Parallel researchers | `workflow.version: "v2"`               | Single `lu-phase-researcher` as today           |
| Research review loop | `workflow.version: "v2"`               | No review -- research accepted as-is            |
| MuninnDB graduation  | `workflow.version: "v2"`               | No graduation -- research lives only in files   |
| Plan review loop     | `workflow.version: "v2"`               | Single `lu-plan-checker`, max 3 iterations      |
| Per-task recall      | `research.perTaskRecall.enabled: true` | Executor receives full plan, no targeted recall |
| Research directory   | `workflow.version: "v2"`               | Single RESEARCH.md in phase directory           |

---

## Gradual Migration Path

### Stage 1: Awareness (No Code Changes)

Read this documentation. Understand the v2 pipeline. No code changes needed.

### Stage 2: Config Preparation

Add the v2 config sections to `.planning/config.json` while keeping v1 active:

```json
{
  "workflow": {
    "version": "v1",
    "research": true,
    "plan_check": true,
    "verifier": true,
    "code_review": true
  },
  "research": {
    "parallelResearchers": 4,
    "reviewLoop": {
      "maxIterations": 3,
      "continueForImportant": true
    },
    "planReviewLoop": {
      "maxIterations": 2
    },
    "graduation": {
      "confidenceThreshold": "MEDIUM",
      "scoringThreshold": 0.55,
      "autoCleanupAfterMilestone": false
    },
    "perTaskRecall": {
      "enabled": false,
      "maxEngramsPerTask": 5
    }
  }
}
```

This changes nothing about runtime behavior because `workflow.version` remains `"v1"`.

### Stage 3: Per-Invocation Testing

Use the `--v2` flag to test v2 on individual tasks:

```bash
# Test v2 research on a MODERATE task
/lu "Refactor auth middleware" --v2

# Compare quality with v1
/lu "Refactor auth middleware"
```

### Stage 4: Feature-by-Feature Tuning

Switch to v2 and tune incrementally:

```json
{
  "workflow": { "version": "v2" },
  "research": {
    "parallelResearchers": 4,
    "reviewLoop": {
      "maxIterations": 2,
      "continueForImportant": false
    },
    "graduation": {
      "scoringThreshold": 0.65
    },
    "perTaskRecall": {
      "enabled": false
    }
  }
}
```

Validate each feature before loosening thresholds or enabling more. Suggested tuning order:

1. **Parallel researchers** -- lowest risk, highest visibility (v2 enables by default)
2. **Review loop iterations** -- start conservative (2), increase to 3 once stable
3. **Graduation scoring** -- start strict (0.65), lower to 0.55 once quality is confirmed
4. **Per-task recall** -- requires graduation to be producing useful engrams
5. **Plan review iterations** -- adds plan quality gate, increase budget as needed

### Stage 5: Full v2

```json
{
  "workflow": { "version": "v2" },
  "research": {
    "parallelResearchers": 4,
    "reviewLoop": {
      "maxIterations": 3,
      "continueForImportant": true
    },
    "planReviewLoop": {
      "maxIterations": 2
    },
    "graduation": {
      "confidenceThreshold": "MEDIUM",
      "scoringThreshold": 0.55,
      "autoCleanupAfterMilestone": false
    },
    "perTaskRecall": {
      "enabled": true,
      "maxEngramsPerTask": 5
    }
  }
}
```

### Stage 6: Remove v1 Code (Future)

Once v2 is validated and stable, the v1 code paths can be removed. This is NOT part of the initial v2 implementation. V1 code remains indefinitely as fallback.

---

## What Breaks

**Nothing.** V2 is purely additive.

The only scenario where existing behavior changes is when `workflow.version` is explicitly set to `"v2"`. Even then:

- If a v2 step fails (e.g., research review loop crashes), the orchestrator falls back to v1 behavior for that step (skip the loop, proceed with unreviewed research).
- If new agents are not yet built, the orchestrator gracefully degrades to v1 agents.
- If MuninnDB graduation fails, the executor proceeds without per-task recall (same as v1).

### Error Fallback Chain

```
v2 step attempted
    |
    v
[Success?] --yes--> Continue v2 pipeline
    |
    no
    |
    v
[Fallback to v1 equivalent?] --yes--> Run v1 step, log warning, continue
    |
    no (v1 equivalent does not exist for this step)
    |
    v
[Skip step, log warning, continue pipeline]
```

---

## Data Migration

**None required.**

### MuninnDB

V2 introduces new `research:*` concept prefixes. These do not conflict with existing prefixes (`session:*`, `pattern:*`, `pitfall:*`, etc.). Existing MuninnDB data is unchanged and continues to be recalled normally.

New engrams created by v2 graduation are additive. If v2 is later disabled, the graduated engrams remain in MuninnDB but are simply not written to anymore. They can still be recalled by v1 sessions if the recall query happens to match.

### Config

New config sections are optional. Missing sections default to v1 behavior. No migration script is needed -- just add the new sections when ready.

### Research Files

V1 produces `{phase}-RESEARCH.md` in the phase directory. V2 produces multiple numbered files in `.planning/phases/NN-name/research/` (phase-scoped, per Decision 7). Both formats can coexist. The planner handles both: if a `research/` directory exists in the phase directory, it reads from there; otherwise, it falls back to the phase-level `RESEARCH.md`.

### State

No state.json schema changes. V2 state (current research phase, review iteration count, graduation status) is tracked as ephemeral context in the typed state machine and does not require schema migration.

---

## Per-Phase Coexistence

V2 can be enabled for individual phases while others use v1. The orchestrator checks `workflow.version` (and the `--v2` flag) at the phase level, not the session level. This means:

```
Phase 1: v1 (discuss --> plan --> execute)
Phase 2: v2 (research-expand --> review --> graduate --> discuss --> plan-review --> plan --> execute)
Phase 3: v1 (discuss --> plan --> execute)
```

The key enabler is that v2 produces the same downstream artifacts (RESEARCH.md, CONTEXT.md, PLAN.md) that v1 expects, just with more rigor in their creation. A v1 executor can consume a plan created by the v2 pipeline, and vice versa.

---

## Rollback

If v2 causes problems:

1. Set `workflow.version: "v1"` in config (or remove the field entirely).
2. All subsequent invocations use the v1 pipeline.
3. No cleanup needed -- v2 artifacts (research directory, graduated engrams) are inert when v2 is disabled.
4. Graduated MuninnDB engrams can be recalled by v1 sessions if relevant. They do not interfere.

---

## Related Documentation

- [config-changes.md](config-changes.md) -- Exact config schema for v2 sections
- [phased-rollout.md](phased-rollout.md) -- Implementation phases for building v2
- [new-skills-needed.md](new-skills-needed.md) -- New skills that implement v2 steps
- [new-agents-needed.md](new-agents-needed.md) -- New agents that populate v2 steps
