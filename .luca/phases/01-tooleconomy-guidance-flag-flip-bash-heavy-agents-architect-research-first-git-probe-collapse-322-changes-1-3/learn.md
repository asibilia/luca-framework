# Learnings — #322 toolEconomy guidance flag (Changes 1–3)

Phase: `01-tooleconomy-guidance-flag-flip-...-322-changes-1-3`
Verification: PASS — 10 ac + 5 anti met, all with direct rendered-artifact evidence.

---

## pattern: declarative-guidance-flag DRY rendering

- **Type:** pattern · **Concept:** `pattern:declarative-guidance-flag-dry-render` · **Confidence:** HIGH
- **Conjectured:** Adding a new cross-agent instruction bullet means editing each agent's body prose — N copies of the same text to keep in sync.
- **Refuted by:** The existing `SubagentGuidanceSchema` already models `verticalSlice`/`tdd`/`selfVerify`/`antiSycophancy` as booleans rendered once in `renderGuidancePrelude`. `toolEconomy` slotted in identically: one `z.boolean().default(false)` field (`subagent.ts:118`), one `if (guidance.toolEconomy) items.push(...)` branch (`render-body.ts:124-136`), and N call-site flips. The compiler stays the single source of the prose. `define/agent.ts:114` reuses the same schema object, so the field auto-reaches mode-agents with no second schema edit.
- **Learned:** For cross-cutting agent guidance, add a boolean flag + one compiler branch + per-agent flips, NOT per-body prose. `default(false)` (plus the schema's `.prefault({})`) makes it purely additive — every agent that omits the flag renders byte-identical, so compile-smoke goldens survive untouched. Ordering of the render branch must match schema declaration order for deterministic bullet order.
- **Criterion now:** New guidance = one schema field + one render branch + flips; verify at the RENDERED artifact (compile the real manifest → grep the emitted body), not just at the source flag — a source `toolEconomy: true` proves nothing until the rendered `.md` actually carries the bullet, and the negative (a no-flag agent like learner) must be confirmed clean too.

---

## pitfall: additive guidance can contradict the guidance the agent already carries

- **Type:** pitfall · **Concept:** `pitfall:additive-guidance-coherence` · **Confidence:** HIGH
- **Conjectured:** A new instruction bullet is self-contained; flip it on and you are done.
- **Refuted by:** The new "Tool economy — don't re-derive facts a prior Read/Grep established" bullet latently conflicts with `selfVerify`'s "re-read files before editing" on every edit-capable agent that carries both. Worse, the architect body being shipped in the SAME change called `luca branch guard` twice in consecutive steps (`architect.ts:82-91`) — literally re-deriving a fact, contradicting the very bullet it was gaining. The code reviewer flagged both.
- **Learned:** Cross-cutting guidance must be checked for coherence against the FULL existing guidance set on each agent that receives it, and against the agent's own body steps. A carve-out resolved the abstract tension ("this never overrides the Self-verification pre-edit re-read"); the double-invocation was collapsed to one call whose result both steps reuse.
- **Criterion now:** When adding an agent guidance bullet, enumerate every agent that will carry it, diff the new bullet against their other active bullets for direct contradiction, and grep the same agents' bodies for behavior the new bullet forbids (here: repeated identical read commands).

---

## pitfall: grep-AC probe literal must be pinned verbatim + one anti-criterion per removed token

- **Type:** pitfall · **Concept:** `pitfall:grep-ac-probe-literal-pinning` · **Confidence:** HIGH
- **Conjectured:** A grep-based acceptance criterion can loosely describe the expected text; the executor will produce something matching.
- **Refuted by:** Plan-review caught that ac-09's probe token was brittle and mismatched the task wording. Fix: the plan pinned ONE exact literal (`research.md and context.md first`) used verbatim in BOTH the architect body directive and the ac probe, giving a deterministic anchor. Separately, anti-02 only guarded ONE of the two raw git commands being collapsed; the "remove BOTH `git branch --show-current` AND `git rev-parse --abbrev-ref HEAD`" edit needed anti-05 added so each removed token had its own guard.
- **Learned:** A grep AC is only as reliable as the coupling between its probe literal and the instruction wording — pin a single exact string used in both places. A "remove both X and Y" collapse needs one anti-criterion per removed token; one guard covering half lets the other survive silently.
- **Criterion now:** For any grep/rendered AC, the probe string is a verbatim literal that also appears in the task body. For any multi-token removal, count the tokens and assert one MUST-NOT anti-criterion per token.

---

## procedure: rendered-artifact verification runs at the checks step, not REVIEWING

- **Type:** procedure · **Concept:** `procedure:rendered-artifact-verify-at-checks-step` · **Confidence:** HIGH
- **Trigger:** An acceptance criterion asserts on a COMPILED/rendered artifact (e.g. `compile.ts --out <dir>` then grep the emitted body) and you are in the REVIEWING pipelineStep.
- **Refuted by:** `compile --out` writes files → it is stage-gate bash-mutate, which the hook BLOCKS in REVIEWING. verify.json notes the render probes were executed via a scratchpad wrapper (compile the real manifest to an OS tmpdir + fs asserts) run at the checks pipelineStep (EXECUTING) instead.
- **Steps:**
  1. Do the mutating render (`compile --out <tmpdir>`) + grep at the **checks step (EXECUTING)**, before the REVIEWING gate closes writes.
  2. Or wrap it so the compile happens inside a child process / OS tmpdir the stage-gate does not treat as a tracked artifact write.
  3. In REVIEWING, restrict yourself to non-mutating reads (source greps, reading already-rendered outputs) and cite the checks-step render as evidence.
- **Learned:** Rendered-artifact evidence is strongest but its production is a mutation — schedule it in a step where mutation is legal, not at the read-only review gate.
- **Criterion now:** Before planning a rendered-artifact AC, confirm the compile/render side-effect runs at EXECUTING (checks) or in a child-process wrapper; never assume a `--out` compile is runnable during REVIEWING.

---

## Signal Synthesis

Source: orchestrator-injected `<signal-digest>`.

- **Recurring failure themes:** None. Zero failure dumps, zero negative valence signals this run. No clustered errors to report.
- **Satisfaction valence trends:** 6 positive signals, 0 negative — spread across checks (3), verify (2), review (1). Every measured step trended positive; the verify and checks steps (where the rendered-artifact probes ran) were friction-free hotspots of positive valence.
- **Confidence journal:** Plan-time gate was all-auto — 2 auto entries (learner picked as the no-flag absence probe; schema-field-isolated-to-wave-1 low-risk design), 0 research, 0 ask. Low-uncertainty phase; the design was well-understood up front.
- **Cross-cutting patterns (promoted above):** (1) plan-review pre-empted 2 real verification weaknesses (brittle probe literal → pinned exact literal; half-guarded git collapse → added anti-05) — feeds `pitfall:grep-ac-probe-literal-pinning`. (2) The architect re-invoking `luca branch guard` twice contradicted the toolEconomy bullet being shipped — feeds `pitfall:additive-guidance-coherence`. (3) verify's render probe being stage-gate-blocked in REVIEWING, relocated to checks — feeds `procedure:rendered-artifact-verify-at-checks-step`.
