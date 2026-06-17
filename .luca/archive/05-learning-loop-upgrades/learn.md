# Learnings — 05-learning-loop-upgrades

Phase 5/7, MODERATE · milestone v13.0.0-pai-learnings (#295) · verify PASS · review APPROVE (cycle 2).
Shipped REQ-06 (learner C/R/L restructure) + REQ-07 (`gotchas` field on all 20 artifacts).

---

## 1. Pitfall — authored meta-documentation drifts exactly like the code it documents

**Type:** pitfall · **Concept:** `pitfall:meta-doc-asserting-system-mechanic-drifts` · **Confidence:** HIGH

**Content:** When an authored artifact ASSERTS a system mechanic — a CLI verb, a stage-gate
rule, a schema field, a step-artifact legality — that assertion is exactly as drift-prone as
instruction-body code that *invokes* the system. This phase is the proof-by-irony: the
`gotchas` field (REQ-07) whose ENTIRE PURPOSE is to surface accurate footguns itself shipped
two factually-wrong gotchas, each a MUST-FIX from a different reviewer:
- `finalize.ts` gotcha named a nonexistent `luca todo move-batch`/`move` verb. Verified
  source-of-truth: `packages/luca-cli/src/commands/write-surface/todo.ts` exposes only
  `add | list | update`; status transition is `todo update --status done
  --verification-criterion <ac-id>`. finalize is a mode-agent WITH Bash → would error at
  milestone close.
- `researcher.ts` gotcha falsely claimed "research.md is illegal at the plan step." Wrong
  twice: the researcher runs at the `research` step, and `STEP_ARTIFACTS.research = ['research']`
  (`packages/luca-core/src/state/configs/step-artifacts.ts:43`) makes research.md LEGAL there.
  The real reason the researcher can't write it is role-based (no Write tool), not step-legality.

**Root cause:** the gotchas were authored from the orchestrator's/agent's MENTAL MODEL of Luca
mechanics — itself drifted — the very drift the gotcha was meant to warn against. The researcher
gotcha's false claim was SEEDED by the orchestrator's own research-prompt phrasing ("research.md
is illegal at the plan step") echoed across phases: a wrong mental model propagated
orchestrator-prompt → authored artifact.

**Prevention:** any authored content that ASSERTS a Luca mechanic must be grep-verified against
the source-of-truth (CLI command defs, `STEP_ARTIFACTS`, Zod schemas) AT AUTHORING TIME.
Token/content greps will NOT catch this — both wrong gotchas were well-formed strings and PASSED
the verifier's greps; only review caught the factual error. This is the content-accuracy variant
of `pitfall:token-grep-criteria-miss-cli-runnability`, and the 5th occurrence of the
phantom-capability / field-drift class (link `pitfall:phantom-cli-capability-in-instruction-bodies`),
here in a novel self-referential form: meta-documentation about the system.

**Context:** any "documentation/warning about the system" artifact (gotchas, prelude prose,
onboarding bodies). Treat factual claims about CLI verbs / stage-gate rules / schema fields /
step legality as CODE — verify, don't recall.

---

## 2. Pattern — optional-field + parity-audit satisfies a "mandatory every-X-has-Y" requirement

**Type:** pattern · **Concept:** `pattern:optional-field-plus-parity-audit-for-mandatory` · **Confidence:** HIGH

**Content:** REQ-07 demanded gotchas be "mandatory" on every artifact. The naive read — a
required Zod field (`.min(1)` / non-optional) — throws at MODULE LOAD if any one artifact omits
it, breaking the entire ARTIFACTS barrel mid-wave (a flag-day across independently-loaded
modules). Instead: declare the field OPTIONAL with a safe default
(`gotchas: z.array(z.string()).default([])`), then enforce "mandatory" via a static parity audit
in the acceptance criteria: `grep -rL "gotchas:" $(grep -rl "defineAgent(" <dir>)` → must be 0
files. "Every X must have Y" becomes a grep that returns empty, not a constructor that throws.

**Context:** any "every module of class X must declare field Y" requirement where the X are
independently imported (a barrel of agents, a registry of handlers). Optional+audit decouples the
enforcement from module-load so a single omission is a failing CI grep, not a hard import crash.

---

## 3. Pattern — content-carry: enrich an existing free-form field to add structure with zero contract change

**Type:** pattern · **Concept:** `pattern:content-carry-enrich-freeform-field` · **Confidence:** HIGH

**Content:** REQ-06 added Deutsch C/R/L structure (CONJECTURED / REFUTED_BY / LEARNED /
CRITERION_NOW) to learner output. Rather than add a new top-level field to the TO_PERSIST block —
which would change the orchestrator/MuninnDB persistence contract — the structure was carried
INSIDE the existing free-form `content:` value of each TO_PERSIST entry. The consumer
(orchestrator) reads only coarse keys (vault/concept/content/tags), so enriching the payload
within an existing free-form value adds structure with ZERO downstream contract change. Verified:
`learner.ts` now contains the C/R/L tokens inside its content template; the block keys are
unchanged.

**Context:** when you need richer structure but the consumer only reads coarse keys, push the new
structure INTO an existing free-form value instead of adding a new field. Avoids a schema/contract
migration on the consumer side.

---

## 4. Decision — REQ-06 in-place C/R/L + content-carry; REQ-07 optional gotchas + parity audit

**Type:** decision · **Concept:** `decision:learning-loop-req06-req07-gate-resolutions` · **Confidence:** HIGH

**Content:** Two gate-resolved decisions for milestone v13.0.0-pai-learnings:
- **REQ-06:** restructure the learner IN-PLACE to Deutsch C/R/L, carried inside the existing
  TO_PERSIST `content:` field. Rejected alternative: a new top-level structured field (would
  force an orchestrator/MuninnDB contract change). Single TO_PERSIST block, keys unchanged.
- **REQ-07:** `gotchas` is OPTIONAL with `.default([])` + a parity audit (`grep -rL` → 0),
  NOT a required `.min(1)` Zod field. Rejected alternative: required field (throws at module load,
  breaks the ARTIFACTS barrel mid-wave). `renderGotchasPrelude` was authored as an idempotent
  mirror of `renderGuidancePrelude` (in `render-body.ts`), wired through BodyRenderInput + both
  emitters; non-empty stage/agent-specific gotchas authored on all 20 artifacts.
- **Deliberate non-extraction:** `renderGotchasPrelude` / `renderGuidancePrelude` near-duplication
  was NOT DRY-extracted — shared skeleton is ~1 line, item construction differs fundamentally, and
  the parity-audit fingerprint justifies the mirror. Extends the phase-02 finding that inline
  duplication can be load-bearing; here the justification is render-fn parity, not subagent
  isolation.

**Context:** repo-specific record of why these two requirements were satisfied the way they were —
reference before changing the gotchas field semantics or the learner output structure.

---

## 5. Project finding — pre-existing phantom verbs in finalize/execute mode bodies

**Type:** pitfall (project-scoped finding) · **Concept:** `decision:finalize-execute-phantom-verb-bug-todo` · **Confidence:** HIGH

**Content:** The finalize.ts MODE BODY (not just its gotcha) still instructs the phantom verbs
`luca todo move` / `luca todo move-batch` (verified present at finalize.ts:470, 474, 476) plus
`luca retro postmortem gate` — none of which exist (real verbs: `todo add|list|update`). execute.ts
carries the same phantom `todo move`/`move-batch`. These are mode-agents WITH Bash, so the
milestone's own finalize step has a latent phantom-capability bug that would error at milestone
close. Pre-existing (predates phase-05), filed as todo
`phantom-cli-verbs-finalize-execute-todo-move-move-batch` for phase-06 governance-audits. Note:
the phase-05 gotcha at finalize.ts:492 was corrected to state the truth, but the surrounding body
prose was left untouched (out of phase scope) — so the body and its own gotcha now disagree.

**Context:** phase-06 governance-audits should sweep ALL mode bodies for phantom CLI verbs against
the actual write-surface command registry, not just the gotchas added this phase.
