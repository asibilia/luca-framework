# Decision: Confidence-Gated `/lu` Pipeline

**Date:** 2026-06-05
**Status:** Implemented (v13 alpha)
**Phases:** 01–04 of the `refactor/drop-autopilot-remove-luca-studio` branch

---

## Problem

The original "full-auto" Luca mode meant the orchestrator ran the entire pipeline without pausing for human input. This led to silent, unchecked decisions: whenever the executor encountered an ambiguity (design choice, requirement gap, convention unclear) it picked an option and moved on — with no signal that it had done so. Reviewers would find the issue after the fact, when fixing it required re-running the full execute→review loop.

---

## Decision: Full-auto redefined as confidence-gated

"Full-auto" is redefined from "never pauses" to **"pauses only on gate `ask` items and CRITICAL safety."** All other steps still run autonomously, but low-confidence decisions are surfaced to the user at the planning boundary (after plan-review, before execute) rather than buried in the diff.

---

## The Confidence Signal (planning-time)

During execution of any phase, agents (executor, planner, verifier) emit structured entries to `.luca/phases/<slug>/confidence.jsonl` via `luca confidence log`. Each entry carries:

| Field | Description |
|---|---|
| `confidence` | `high \| medium \| low` — how certain the agent was |
| `category` | closed-set ambiguity classification (`plan-gap`, `design-choice`, `convention-unclear`, `requirement-ambiguous`, `dependency-unknown`, `scope-creep`) |
| `decision` | what the agent actually did |
| `alternatives` | other options considered |
| `reasoning` | why this choice was made |
| `risk` | what could go wrong |
| `researchable?` | planning-time hint: `true` if the ambiguity is factual and resolvable by automated research; `false`/absent if it requires human judgment |
| `resolution?` | explicit gate-routing override: `auto \| research \| ask` — set by the architect to pre-route an entry regardless of confidence level |

---

## Deterministic Gate Bucketing (`luca confidence gate`)

`luca confidence gate --slug <slug>` reads the journal and emits `{ auto, research, ask, counts }`:

| Rule | Bucket |
|---|---|
| Explicit `resolution` field set | Honour it (override wins) |
| `high` or `medium` confidence | `auto` (proceed silently) |
| `low` + `researchable: true` | `research` (spawn researcher agent) |
| `low` + no `researchable` / false | `ask` (surface to user via AskUserQuestion) |

**Fail-toward-human:** when in doubt, route to `ask` rather than silently proceeding.

**Medium → auto:** medium-confidence entries proceed automatically; the executor's reasoning is recorded in the journal for reviewer inspection but does not pause the pipeline.

**Explicit resolution overrides:** the architect (or plan-review step) can pre-set `resolution` on any entry to force a specific bucket regardless of confidence, enabling deterministic routing for known patterns.

---

## Gate Placement

The gate runs **between `plan-review` and `execute`**, after the plan-reviewer returns `APPROVED`:

1. `luca confidence gate --slug <slug>` — bucket all entries
2. `auto` entries — proceed silently
3. `research` entries — spawn researcher agent per entry (with a concrete prompt: decision + category + reasoning + alternatives → RECOMMENDATION + RATIONALE)
4. `ask` entries — use **AskUserQuestion** per entry (decision as question, alternatives as options); block until user answers
5. Append `## Confidence Gate Resolutions` to `plan-review.md` via `Edit` (legal at `plan-review` pipelineStep per `STEP_ARTIFACTS`); guard against double-append (idempotency)
6. Inject resolutions into the executor's prompt as a `<confidence-gate-resolutions>` block

Resolutions persist to `plan-review.md` (not `context.md`, which is blocked at this step), and are injected into the executor's prompt so the implementer acts on them without re-asking the user.

**Resume safety:** a resuming orchestrator checks `plan-review.md` for an existing resolutions section and re-uses it rather than re-running the gate.

**All-auto case:** if `counts.research === 0` and `counts.ask === 0`, the gate exits immediately without appending or blocking.

---

## Phases Delivered

### Phase 01 — Planning-time confidence emission (`luca confidence log`)

- Added `luca confidence log` CLI command and write-surface handler.
- Full canonical `ConfidenceEntrySchema` (replacing the v13 narrow `{score, stage, rationale}` shape).
- Fields: `phase`, `wave`, `task`, `confidence`, `category`, `decision`, `alternatives`, `reasoning`, `risk`, `files`, `reviewHint?`, `researchable?`, `resolution?`.

### Phase 02 — Planning-time confidence emission, Part 2 (reader + gate)

- Added `luca confidence read`, `summary`, `render`, and `gate` sub-commands.
- `selectConfidenceGateActions` in `luca-core`: deterministic bucketing logic (explicit resolution → confidence → researchable flag).
- `ConfidenceCategorySchema`, `ConfidenceLevelSchema`, `appendConfidenceEntry`, `readConfidenceJournal`, `getConfidenceSummary`, `renderConfidenceJournalMarkdown` all in `luca-core`.

### Phase 03 — Gate controller in `/lu` (skill + command)

- Wired the gate into both the `lu` skill (`packages/luca-tools/src/artifacts/skills/lu/index.ts`) and the `/lu` command (`packages/luca-tools/src/artifacts/commands/lu.ts`).
- `full-auto` redefined across 4 surfaces (skill, command, oversight description).
- Gate runs after `plan-review → APPROVED`, before advancing to `execute`.
- Resolutions persist to `plan-review.md`, injected into executor prompt.

### Phase 04 — Gate-controller hardening + docs (this phase)

- **M1:** moved orphaned `finalize` step row back into the contiguous step table (after `learn`); deleted the orphaned copy below the gate sections.
- **M2:** specified **AskUserQuestion** tool explicitly in both skill and command `ask` handlers; added "block until answered" directive.
- **S1:** idempotency guard — checks for existing `## Confidence Gate Resolutions` section before appending.
- **S2:** resume note on `plan-review` row — resuming orchestrator re-uses existing resolutions.
- **S3:** all-auto fast-path — if all counts are 0, proceed directly to execute.
- **S4:** concrete researcher prompt template for `research`-bucket entries.
- **S5:** command parity — `luca phase current` + "use `Edit` not `Write`" added to `/lu` command gate section.
- Phase-2 cleanups: `--resolution` error message cites `luca confidence log --help`; `lucaConfidenceLogTool.description` now lists `researchable?` and `resolution?`.
- This decision document written.

---

## Follow-ups

The following items were not implemented in this feature set and are tracked as backlog:

### (1) `luca confidence resolve` — mark journal entries as resolved

Implement a `luca confidence resolve --slug <slug> --task <task-id> --resolution <auto|research|ask> --answer <text>` command that:
- Marks a specific journal entry as resolved
- Writes the resolution back to `confidence.jsonl` (or a parallel `confidence-resolutions.jsonl`)
- Enables a true re-emit/re-gate loop: executor emits → gate → resolve → re-gate (checking only unresolved entries)

Without this, the gate reads all entries on every run and has no memory of which entries were already resolved. The current workaround (appending resolutions to `plan-review.md`) is durable but not machine-readable for re-gating.

### (2) Fix the v13 `review → execute` transition gap

The v13 pipeline transition table allows only `review → learn`, but the `lu` skill instructs "on must-fix, loop back to execute." This is a contradiction: must-fix review findings have no legal in-phase re-entry to execute (and the stage-gate blocks code edits in REVIEWING).

Options:
- Add a `review → execute` transition to the state machine (cleanest, enables direct re-entry)
- Route must-fix via a legal path: `review → learn → plan` recycle (re-plans the fix as a new phase — correct but heavyweight)
- Fold must-fix finds into the next phase's execute step (current workaround — loses in-phase atomicity)

The real fix requires a state-machine change in `luca-core`; deferred to a dedicated phase.
