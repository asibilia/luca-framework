# Phase C — Dropped-Actions Audit

> Produced 2026-05-22 as part of the Phase C remaining work — see
> `docs/repo-restructure-plan.md` §5.3 ("Partially ported — actions dropped")
> and §10 progress.

## 1. Scope

For each mastracode tool the v13 migration "partially ported", enumerate the
tool's actions, map each to its current `luca` write-surface counterpart, and
classify the disposition. Six tools are in scope:

`workflow-state`, `manage-roadmap`, `verification-result`,
`confidence-journal`, `ensure-feature-branch`, `repo-cleanup`.

### Disposition vocabulary

| Disposition | Meaning |
|---|---|
| **PORTED** | The action has an equivalent v13 `luca` surface (possibly renamed). |
| **SUPERSEDED** | The action is covered by another v13 mechanism (native Write tool, `luca state advance`, `luca telemetry emit`, etc.). |
| **DROPPED — dead on arrival** | The action only makes sense inside the Mastra harness; v13 does not need it. |
| **DROPPED — by contract** | Plan §5.5 dropped the underlying artifact (e.g. cross-run `*-history.jsonl`). |
| **DIVERGENT** | A v13 surface exists but its schema/semantics differ from the mastracode tool — likely a v13 design decision, not an oversight, but worth flagging. |
| **MISSING** | No v13 equivalent; closing the gap is straightforward port work. |

## 2. workflow-state (mastracode `tools/workflow-state.ts`)

13 discriminated actions; the dominant tool in mastracode. v13 surfaces:
`luca state` (read / advance), `luca workflow reset`, `luca phase current`,
plus the freeform phase artifact writes via the native Write tool.

| # | Action | Disposition | v13 surface / rationale |
|---|---|---|---|
| 1 | `write` | **SUPERSEDED** | Freeform `.luca/` artifact writes use the native Write tool (stage-gate hook validates the path-for-phase). |
| 2 | `switch-mode` | **SUPERSEDED** | `luca state advance --to-step <step>` (state machine validates legal transitions). Explicitly listed in §5.3. |
| 3 | `start-phase` | **SUPERSEDED** | `luca state advance` into PLANNING + native Write of the phase artifacts. |
| 4 | `complete-phase` | **SUPERSEDED** | `luca state advance` into the next coarse phase. |
| 5 | `save-triage-results` | **SUPERSEDED** | `luca state advance` writes complexity to state; downstream artifacts via native Write. |
| 6 | `save-plan-artifacts` | **SUPERSEDED** | Native Write to `phases/<slug>/plan.md` / `plan-review.md`. |
| 7 | `save-review-results` | **SUPERSEDED** | Native Write to `phases/<slug>/audits/<reviewer>.md` + `luca state advance`. |
| 8 | `justify-empty-phase` | **MISSING (verify)** | Emits a `phase-empty-justification` ledger event the postmortem looks for. Pending verification: does `luca state advance` already emit it as a side effect? If not, add a dedicated surface — without it, the empty-phase guard cannot be satisfied. |
| 9 | `re-enter-pipeline` | **MISSING (verify)** | Re-entry transitions. Likely covered by `luca state advance` with the right `to-step`; verify the legal-transition table includes the re-entry edges. |
| 10 | `archive-loose` | **SUPERSEDED** | `luca repo cleanup-apply` (shadow-scan remediation). Same action also appears on `repo-cleanup` — duplicate in mastracode. |
| 11 | `record-subagent` | **SUPERSEDED** | `luca telemetry emit --kind=subagent.invoke ...` (this session). Explicitly listed in §5.3 as a dropped telemetry action. |
| 12 | `cancel-subagent` | **SUPERSEDED** | `luca telemetry emit --kind=subagent.cancelled ...`. |
| 13 | `record-recall` | **SUPERSEDED** | `luca telemetry emit --kind=recall.hit` / `recall.miss ...`. |

**Net:** 11 of 13 actions are cleanly superseded or dropped. 2 (`justify-empty-phase`, `re-enter-pipeline`) need verification against the v13 `luca state advance` implementation; either they emit the required side effects already, or a small surface needs to be added.

## 3. manage-roadmap (mastracode `tools/manage-roadmap.ts`)

4 actions. v13 surface: `luca roadmap` (read / create).

| # | Action | Disposition | v13 surface |
|---|---|---|---|
| 1 | `create` | **PORTED** | `luca roadmap create --file <phases.json>` |
| 2 | `read` | **PORTED** | `luca roadmap read` |
| 3 | `update-status` | **MISSING (verify)** | Update one phase's `status` (pending → in-progress → complete). Probably emitted as a side effect of `luca state advance` for the active phase; verify or add a dedicated surface. |
| 4 | `compute-order` | **DROPPED — dead on arrival** | Pure dependency-ordering utility; not externally consumed once a roadmap is authored. Consumers compute order inline if needed. |

## 4. verification-result (mastracode `tools/verification-result.ts`)

4 actions. v13 surface: `luca phase write-verify` (write) handler; nothing for the read side.

| # | Action | Disposition | v13 surface |
|---|---|---|---|
| 1 | `write` | **PORTED** | `luca-phase-write-verify` write-surface handler writes `.luca/phases/<slug>/verify.json`. |
| 2 | `read` | **MISSING** | No `luca` surface to read the active phase's `verify.json`. luca-core exports `readVerificationResult({cwd, slug, currentRunId?})` — wiring a `luca verification read` is a thin wrapper. |
| 3 | `read-history` | **DROPPED — by contract** | `verification-history.jsonl` has no `.luca/` home (plan §5.5); cross-run verification events flow through the session ledger. |
| 4 | `aggregate` | **MISSING** | Milestone-time aggregation across all phase `verify.json` files. luca-core exports `aggregateVerificationResults(results)` — a `luca verification aggregate` surface would walk `.luca/phases/*/verify.json`, feed the array in. Useful at finalize. |

## 5. confidence-journal (mastracode `tools/confidence-journal.ts`)

4 actions. v13 surface: `luca confidence log` (write only).

| # | Action | Disposition | v13 surface / finding |
|---|---|---|---|
| 1 | `log` | **DIVERGENT — schema** | `luca confidence log` writes `{ timestamp, stage, score (0..1), rationale, metadata? }`. The mastracode tool — and the **luca-core `ConfidenceEntrySchema` ported in Phase B** — writes the richer `{ timestamp, phase, wave, task, confidence (high/medium/low), category, decision, alternatives, reasoning, risk, files, reviewHint? }`. Round-tripping the v13 handler's output through `luca-core readConfidenceJournal` would **reject every entry** as schema-invalid. See §7 finding F1. |
| 2 | `read` | **MISSING** | luca-core exports `readConfidenceJournal({cwd, slug})` — wire `luca confidence read [--slug=<slug>]`. |
| 3 | `summary` | **MISSING** | luca-core exports `getConfidenceSummary(entries)` — wire `luca confidence summary`. |
| 4 | `render` | **MISSING** | luca-core exports `renderConfidenceJournalMarkdown(entries)` — wire `luca confidence render`. (Render returns the markdown string; no file write — see Phase B notes on rendered-markdown not having a `.luca/` slot.) |

## 6. ensure-feature-branch (mastracode `tools/ensure-feature-branch.ts`)

7 actions. v13 surface: `luca branch guard` (one action — the assert).

| # | Action | Disposition | v13 surface / rationale |
|---|---|---|---|
| 1 | `status` | **MISSING (small)** | Inspect the current branch + match against branching preferences. Cheap if `luca-core/preferences` is wired (it is). |
| 2 | `create` | **MISSING — design call** | Direct `git checkout -b` mutation. v13 may intend skills to run git directly. If we keep `luca branch` thin, drop. If we want the framework to own branch creation (so preferences are enforced), port. |
| 3 | `rename` | **MISSING — design call** | Same disposition as `create`. |
| 4 | `assert-not-default` | **PORTED** | `luca branch guard --default-branch <name>` exits 1 on the default branch. |
| 5 | `consult` | **MISSING (small)** | Return merged branching preferences. Trivial — `extractPreferences(config).branching`. |
| 6 | `resolve` | **MISSING — design call** | Compute a branch plan from preferences. Pure, but the consumer of the plan (`apply`) is the design-call piece. |
| 7 | `apply` | **MISSING — design call** | Execute a resolve result (git mutation + state persistence). Same design call as `create`. |

**Net:** 1 ported. 2 trivially-portable (`status`, `consult`). 4 (`create`, `rename`, `resolve`, `apply`) hinge on whether the framework should own git mutation or leave it to skills. v12 mastracode owned it; v13 has not. **This is a deliberate v13 simplification, not an oversight** — flag for sign-off if reconsidering.

## 7. repo-cleanup (mastracode `tools/repo-cleanup.ts`)

6 actions. v13 surface: `luca repo cleanup-apply` (one action).

| # | Action | Disposition | v13 surface / rationale |
|---|---|---|---|
| 1 | `scan` | **SUPERSEDED** | Invoking the shadow-scanner subagent is a Mastra-harness concern; the v13 model has skills invoke it directly. |
| 2 | `parse-report` | **MISSING — small** | Pure shadow-scan-output parser. luca-core has a `shadow-scan` domain (`shadow-scan/schemas.ts`); a thin parser surface is feasible. |
| 3 | `apply-fix` | **PORTED** | `luca repo cleanup-apply --file <finding.json>` applies a single ShadowScanFinding. |
| 4 | `summary` | **MISSING (small)** | Aggregate a parsed report — counts by recommended-action. Pure transformation. |
| 5 | `cleanup-artifacts` | **MISSING — design call** | Mass-cleanup of pipeline-leftover artifacts. Risky enough to want an explicit user-facing flag rather than an agent action. |
| 6 | `archive-loose` | **MISSING (small)** | Move "loose" `.luca/` root files to the archive. May overlap with `apply-fix` of the `move` finding kind — verify. |

## 8. Findings & recommended follow-ups

Ordered by value-to-cost:

**F1. Realign `luca confidence log` to the luca-core `ConfidenceEntrySchema`.** The v13 handler writes a different shape than luca-core's reader expects (§5). Round-tripping is currently broken: any reader using `luca-core readConfidenceJournal` will discard every v13-written entry as schema-invalid. **Fix:** change `luca-confidence-log` handler args + entry shape to match `ConfidenceEntrySchema` (phase / wave / task / confidence (high|medium|low) / category / decision / alternatives / reasoning / risk / files / reviewHint?). Update callers (skills). Breaking, but small. *(Design call deferred — see §9.)*

**F2. Wire the four trivial missing reads:** `luca confidence read | summary | render` and `luca verification read | aggregate`. All five are thin wrappers over luca-core functions already exported in Phase B (`readConfidenceJournal`, `getConfidenceSummary`, `renderConfidenceJournalMarkdown`, `readVerificationResult`, `aggregateVerificationResults`). ~20 lines each. Close clean read-side gaps.

**F3. Verify `luca state advance` side effects** for the two workflow-state actions flagged "MISSING (verify)": `justify-empty-phase` (emits a `phase-empty-justification` ledger event the postmortem requires) and `re-enter-pipeline` (re-entry transitions in the legal-transition table). If the side effect is missing, add the surface; if present, document it.

**F4. Decide the `luca branch` scope** (§6 design call). v12 owned git mutation (`create` / `rename` / `resolve` / `apply`); v13 has not. Either port these four actions back, or document the deliberate v13 simplification ("skills run git directly; `luca branch` only guards"). Two trivial reads (`status`, `consult`) are worth adding either way.

**F5. Decide the `luca repo` scope** (§7 design call). Add the small `parse-report` / `summary` / `archive-loose` surfaces; sign off on whether `cleanup-artifacts` belongs in the framework at all.

## 9. Out of scope for this audit

Items that surfaced during the audit but belong to other phases / tickets:

- **luca-tools compiler (Phase D)** — the audit confirms the surfaces in Phase D's purview (subagents, modes) are correctly excluded from this audit.
- **pipeline-lock** (§5.3 "DROPPED — no v13 handler") — not surfaced because it was never ported to luca-core in Phase B. Phase G parity will determine whether to add it.
- **Schema realignment for confidence (F1)** — fixing the schema is mechanically small but breaking; the call to break a v13 surface lands with the user, not this audit.
