# Learnings — DAD-P1b (swap `luca state advance` write-path onto the XState machine)

> Phase `03-dad-p1b-swap-write-path` · repo `luca-framework` · phase 3 of the "Deterministic Agentic Development" migration.
> What shipped: the live state-mutation gate in `luca-state-advance.ts` was repointed from a direct `isLegalTransition` table lookup to `machineVerdict` (the XState statechart adapter), via a pure exported `decideAdvance` seam with structured reason codes. The advisory PreToolUse hook was intentionally LEFT on the legacy message-rich `checkPipelineGuard`. Counters preserved with no increment (P1c boundary).

---

## pitfall:luca-pipeline-guard-scans-full-command-string

- **Type:** pitfall · **Confidence:** HIGH
- **Conjectured:** The Luca pipeline-guard PreToolUse hook gates only actual `luca state advance <step>` invocations, so writing the phrase into unrelated text (a commit message) is inert.
- **Refuted by:** A `git commit -m` whose message contained the literal string `luca state advance through the pipeline machine` was BLOCKED — the hook regex-scans the WHOLE Bash command string, matched `luca state advance through`, parsed `through` as the requested pipelineStep, found it invalid, and rejected the commit (signal-digest GOTCHA). Had to reword the commit subject.
- **Learned:** The hook does substring matching over the entire command text, not a parse of the argv[0] program. Any Bash argument — `git commit -m "..."`, `echo`, PR-body heredocs — containing the pattern `luca state advance <token>` with a non-pipelineStep token gets blocked. The literal phrase is a footgun anywhere in a shell command, not just at a real call site.
- **Criterion now:** Never write the literal phrase `luca state advance <word>` inside commit messages, PR bodies, or any Bash argument. Reword to break the pattern (e.g. "machine-drive the state-advance write path", "repoint the state advance gate"). If a commit is mysteriously blocked by the pipeline guard, scan the message text for the `luca state advance <token>` substring first.

---

## pattern:gate-swap-via-pure-decide-seam-with-equivalence-test

- **Type:** pattern · **Confidence:** HIGH
- **Conjectured:** Repointing a LIVE decision/gate onto a new implementation is inherently risky because you can't prove the new path preserves behavior without shipping it.
- **Refuted by:** The swap landed with 0 must-fix and behavior verified structurally (verify.json: 13/13 ac, 6/6 anti) by extracting a pure exported `decideAdvance(s, to)` seam (`luca-state-advance.ts:121`) that delegates to `machineVerdict`, then proving drop-in with a table-driven equivalence test (test:251-285) asserting `decideAdvance` ⇔ `machineVerdict` over 6 representative input classes (legal forward / loop-back / self-loop, illegal cross-step, same-step no-op, unknown requested).
- **Learned:** To swap a live gate safely: (1) extract a thin PURE `decide` function that returns only the decision (here a `PipelineStep`, no state mutation); (2) route the new impl through it; (3) add an equivalence test asserting new-seam ⇔ oracle over representative input CLASSES (not exhaustive cases). The purity keeps the caller's field-preservation (`{...s, pipelineStep: decideAdvance(...)}`) obviously correct — 11 counter/cap fields stayed byte-identical because the seam can't touch them.
- **Criterion now:** When migrating a live gate, require a pure exported decision seam plus an equivalence/parity test against the incumbent (or a shared oracle) before the swap is considered drop-in. If the two can disagree on any reachable input, it's not a drop-in.

---

## pattern:split-authority-persisted-gate-vs-advisory-message-source

- **Type:** pattern · **Confidence:** HIGH
- **Conjectured:** When a new implementation supersedes an old one, the old one should be fully removed to avoid duplicate logic.
- **Refuted by:** The legacy `checkPipelineGuard` was DELIBERATELY kept as the PreToolUse hook's message source (anti-01/anti-02 forbid touching it) while the new `machineVerdict` took over the persisted write gate — because the machine deliberately returns NO `message` field (`machineVerdict` returns reason CODES), and the hook needs the legacy guard's rich human messages. Parity tests guarantee the two never disagree on the accept/reject decision.
- **Learned:** SPLIT AUTHORITY is the right call when the old impl carries something the new one intentionally omits. Here: the machine owns the authoritative persisted gate (fail-closed on the write); the fail-open advisory hook stays on the message-rich legacy guard. A parity/equivalence guarantee is what makes two decision sources safe to run side-by-side — they can differ in OUTPUT SHAPE (codes vs prose) but must agree on the DECISION.
- **Criterion now:** Before deleting a superseded implementation, ask what it carries that the replacement omits (rich messages, side-channels, formatting). If something, keep it on a scoped-down responsibility and add a parity test binding the two; don't force a single owner.

---

## pitfall:exported-seam-must-guard-inputs-unreachable-only-in-live-path

- **Type:** pitfall · **Confidence:** HIGH
- **Conjectured:** `PIPELINE_TRANSITIONS[from].join(', ')` in the rejection-message builder is safe because a persisted `from` is always Zod-validated at read time, so it's always a valid table key.
- **Refuted by:** The code-review SHOULD-FIX flagged that once `decideAdvance` is EXPORTED and directly tested, a caller can pass an unknown `from` (which `machineVerdict` legitimately models as reason `unknown-current-step`); `PIPELINE_TRANSITIONS[from]` is then `undefined` and `.join` throws `TypeError`, turning the machine's graceful rejection into a crash. "Unreachable via the live Zod-validated read" is not "unreachable" for a public symbol. Fixed with `(PIPELINE_TRANSITIONS[from] ?? []).join(', ')` (`luca-state-advance.ts:134`) plus a dedicated test; converged.
- **Learned:** Exporting a decision function widens its input domain beyond the live validated path. It must defensively handle every input the new public seam can receive — especially inputs its own delegate (the machine) explicitly models as a valid outcome. The safety argument "the upstream validator rejects this first" evaporates the moment the function is reachable through the export.
- **Criterion now:** When promoting an internal function to an exported seam, re-audit every lookup/index/assumption that relied on upstream validation. Guard total-ness against the full domain the delegate can produce (here: the complete reason-code set), not just the live-path subset. A directly-tested seam should be total for its delegate's declared outputs.

---

## Signal Synthesis

Source: orchestrator-injected `<signal-digest>`.

- **Satisfaction valence — uniformly positive, converging.** `satisfaction:outcome` fired positive x2 at both checks (tsc 0; luca-core 975/0 parity untouched; handler 18→19/0) and x2 at verify (behavior preserved; 13/13 ac, 6/6 anti). Review moved neutral→positive: APPROVE with 0 must-fix, 1 should-fix (the unguarded `PIPELINE_TRANSITIONS[from].join` on the exported seam), which was applied (`?? []` guard + dedicated test) and converged. No negative-valence step this run — a clean, well-scoped phase.
- **Recurring failure themes — none.** Zero failure signals. The single friction point was the should-fix export-hardening, resolved in-phase (handler test count ticked 18→19 for the added guard test).
- **Cross-cutting patterns.** Two systemic wins promoted to learnings: (1) the pure-decide-seam + equivalence-test recipe for live-gate swaps, and (2) split-authority (machine owns persisted gate, hook stays message source). One systemic footgun promoted: the pipeline-guard hook scanning the full Bash command string (the commit-message block).
- **Noted, not promoted.** One confidence entry (executor design-choice: rejection-message wording — "illegal transition:" → "rejected transition [<reason>]:", an accepted deviation that de-mislabels same-step no-ops while keeping the `illegal` substring via the reason code). One pre-existing finding: `bun test packages/luca-cli` exits 1 with 0 failures (a `luca telemetry pr-outcome` subprocess leaks a nonzero exit) — already captured as `todo:luca-cli-test-suite-leaks-nonzero-exit`, not re-persisted here.
