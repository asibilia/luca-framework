# Canonical Decisions

Resolutions for open questions raised during Phase 10 (v6 Runtime Foundation & Adapter Layer) design and research. Each decision records the question, resolution, rationale, and originating phase.

---

## Q5: Research Files vs MuninnDB for Research Context

**Question:** Should research context be stored as files (RESEARCH.md) or in MuninnDB, and how should executors access it?

**Resolution:** Phase-dependent fallback chain.

1. **During research phase**: Findings stored as numbered files in `{phase_dir}/research/` and graduated to MuninnDB engrams via `phase-graduate`.
2. **During planning phase**: Planner reads `GRADUATION-REPORT.md` and includes graduated engram labels as `research_refs` in task specifications.
3. **During execution phase**: Executor's orchestrator (phase-execute) parses `**Research refs:**` from plan content, recalls matching engrams from MuninnDB repo vault, and injects them into executor context.
4. **Fallback**: If no `research_refs` exist in a plan, the executor receives no research context (v1 behavior, backward compatible).

**Rationale:** Files are the authoring medium (human-readable, diffable, reviewable). MuninnDB is the runtime medium (semantic recall, cross-session persistence). The graduation step bridges them. This avoids coupling executors to file paths while preserving the file-based research workflow.

**Phase:** 10
**Date:** 2026-03-24

---

## Q6: Cross-Phase Research Reuse

**Question:** Can research from Phase N be reused in Phase N+M, and how should staleness be handled?

**Resolution:** Recall with staleness awareness via timestamps.

1. Graduated engrams include a `phase` tag and timestamp in their MuninnDB metadata.
2. When recalling research refs, the recall context includes the current phase number.
3. MuninnDB's relevance scoring naturally deprioritizes older engrams.
4. No hard expiry -- engrams from earlier phases remain available but rank lower unless explicitly referenced by a plan's `research_refs`.

**Rationale:** Hard expiry would lose valuable cross-cutting research (e.g., "Bun's WebSocket API patterns" discovered in Phase 5 is still relevant in Phase 15). Timestamp-based scoring provides soft decay without data loss. Explicit `research_refs` in plans override the decay when a planner knows an older engram is still relevant.

**Phase:** 10
**Date:** 2026-03-24

---

## Q8: Reviewer Freshness Across Iterations

**Question:** Should each review iteration spawn fresh reviewer agents, or should the same agent continue with accumulated context?

**Resolution:** Same agent identity with delta context plus prior summary.

1. Each iteration spawns the same reviewer agent type (cold isolation maintained).
2. Iteration 2+ receives: original corpus + prior iteration's gap list as `{prior_gaps}`.
3. Reviewers do NOT receive session context, MuninnDB state, or other reviewers' outputs (cold isolation).
4. The convergence loop in the orchestrator tracks cross-iteration progress.

**Rationale:** Cold isolation prevents reviewers from anchoring on prior conclusions. Providing only the prior gap list (not the full prior review) ensures reviewers re-evaluate independently while being aware of known issues. This matches the "delta + prior summary" pattern used in code review iterations.

**Phase:** 10
**Date:** 2026-03-24

---

## Q9: Review Scope on Re-Expansion

**Question:** When research expands to address review gaps, should reviewers re-review the entire corpus or only the delta?

**Resolution:** Delta review with integration check.

1. Reviewers receive the full corpus but are instructed to focus on new/modified files.
2. An integration check verifies that new content doesn't contradict existing findings.
3. Gap IDs from prior iterations are carried forward -- reviewers can mark them as RESOLVED or PERSISTENT.

**Rationale:** Full-corpus re-review is wasteful when only 1-2 files changed. Delta focus reduces reviewer token cost while the integration check catches contradictions. Gap ID continuity enables convergence tracking across iterations.

**Phase:** 10
**Date:** 2026-03-24

---

## Q11: UX During Research Phase

**Question:** How should the research phase interact with the user -- should it pause for confirmation, run autonomously, or adapt based on settings?

**Resolution:** Respect existing oversight levels.

1. Research respects the `lu.oversight` config setting (full-auto, milestone, phase, task).
2. At `full-auto`: Research runs without pausing. Graduation is automatic.
3. At `milestone` or `phase`: Research runs autonomously within the phase but pauses at phase boundaries.
4. At `task`: Research pauses at each significant decision point (expand vs graduate).
5. No new UX modes are introduced -- the existing oversight framework handles research.

**Rationale:** Adding research-specific oversight levels would increase configuration surface area and create confusion about which setting takes precedence. The existing oversight levels already encode the user's desired interaction frequency.

**Phase:** 10
**Date:** 2026-03-24

---

## Q15: Synthesizer Isolation Level

**Question:** Should the research synthesizer (graduation) agent have access to MuninnDB, session context, or just file paths?

**Resolution:** File paths only (cold isolation).

1. The synthesizer receives only file paths to research files and the phase context file.
2. It does NOT receive MuninnDB context, session state, or prior synthesizer outputs.
3. Output is a structured GRADUATION-REPORT.md with engram candidates and their metadata.
4. The orchestrator (phase-graduate skill) handles the actual MuninnDB writes.

**Rationale:** Cold isolation prevents the synthesizer from being influenced by stale memory or session drift. The synthesizer's job is to evaluate research quality objectively, not to integrate it with prior knowledge. MuninnDB writes are an orchestrator responsibility (consistent with the gate enforcement rule).

**Phase:** 10
**Date:** 2026-03-24

---

## Q16: Researcher Error Handling

**Question:** How should researcher agents handle errors (API failures, file read errors, timeout)?

**Resolution:** Graceful degradation with structured error reporting.

1. Researcher agents catch errors and continue with reduced scope rather than failing entirely.
2. Errors are reported in the research output as `[ERROR]` entries with context.
3. The review loop treats error entries as gaps (severity depends on impact).
4. If a researcher fails completely (returns no output), the orchestrator logs the failure and continues with remaining reviewers' output.
5. No automatic retry -- the convergence loop handles the gap naturally in the next iteration.

**Rationale:** Hard failures in research block the entire workflow. Graceful degradation ensures progress continues even with partial data. The convergence loop is designed to handle incomplete information -- missing research is surfaced as gaps, not as workflow-blocking errors.

**Phase:** 10
**Date:** 2026-03-24
