/**
 * quick skill — Register a small ad-hoc task as a real phase and hand the
 * pipeline to `/lu`.
 *
 * REWRITTEN (Luca retro). The ported v12 body was broken in five
 * independent ways and one of them hard-failed in the user's face:
 *
 *   1. It ran `idle → learn → finalize → idle`. From `idle` the only legal
 *      successor is `triage` (`pipeline-transitions.ts`), and unlike the
 *      `phase-execute` sites this one carried no `|| true`, so the FIRST
 *      advance exited non-zero every single time the skill was used.
 *   2. It `mkdir -p`-ed a top-level `quick/` directory inside `.luca/`,
 *      which `LUCA_DIR_CONTRACT` does not list (`is-valid-luca-path`
 *      rejects it as an unknown top-level directory).
 *   3. It slugified the user's prose with a `sed` pipeline; phase slugs are
 *      derived from roadmap ORDER and are never LLM-named.
 *   4. It numbered directories with three digits; `PHASE_SLUG_RE` requires
 *      exactly two.
 *   5. It told subagents to write `plan.md` and the execute summary, both
 *      stage-gated to steps this skill never entered.
 *
 * The rewrite takes the "thin router" option: `quick` now does exactly the
 * deterministic half of triage (one phase, registered through
 * `luca roadmap add-phase`, which owns numbering, slugification, validation
 * and directory creation), walks the two LEGAL advances into the pipeline,
 * and hands off to `/lu`. It writes no artifacts, creates no directories,
 * picks no paths, and issues no commits.
 *
 * Guarded by `index.test.ts`, which asserts against the bytes `emitSkill`
 * writes — including a fold of every emitted `--to-step` through
 * `isLegalTransition` starting at `idle`.
 */
import { defineSkill } from '../../../define/skill.ts'

const BODY = `<main>
# Luca Quick

Register a small, well-understood task as a real roadmap phase and hand it straight to the pipeline — without the roadmap-decomposition conversation \`/lu\` normally opens with.

**Arguments:** \`[task-description]\` (optional — you'll be asked if omitted)

**Use when:** you know exactly what to do, it is one deliverable, and you don't want to be interviewed about milestone structure first.

## What quick is, and what it is not

Quick is a **router**, not a shortcut around the state machine. It does the deterministic half of triage (one phase, one complexity call) and then delegates.

- It does **not** skip the researcher, plan-reviewer, or verifier. The pipeline is a fixed transition table (\`PIPELINE_TRANSITIONS\`) and there is no step-skipping edge in it. Depth is tuned by *complexity*, not by omitting steps. Anything claiming otherwise is stale documentation.
- It writes **no** phase artifacts. Every artifact is stage-gated to the step that owns it, and quick is never in those steps — the downstream \`/lu\` steps own them.
- It creates **no** directories and picks **no** paths. \`luca roadmap add-phase\` owns numbering, slugification, validation, and directory creation, and prints the path back.
- It does **not** commit. Commits happen only in the finalizing flow.

## Process

### Step 1: Pre-flight

\`\`\`bash
luca state read
\`\`\`

- If the command fails because there is no \`.luca/\`, stop and tell the user to run \`luca init\` first. Do **not** auto-run it — it is an interactive installer.
- Read \`pipelineStep\` and \`currentPhase\` from the output.

**Gate on \`pipelineStep\`.** Quick is only legal from \`idle\`:

- \`pipelineStep\` is \`idle\` → continue.
- \`pipelineStep\` is anything else → a run is already in flight. **Stop.** Do not advance, do not register anything. Tell the user their options: \`Skill(skill: "lu")\` to resume the live run, or \`Skill(skill: "note", args: "<task>")\` to queue this task for later. Then end your turn.

This gate is what makes every advance below legal: from \`idle\` the only successor is \`triage\`, and from \`triage\` the only successor is \`research\`.

### Step 2: Get the task description

If the invocation carried a description, use it. Otherwise use the AskQuestion tool:

- header: "Quick Task"
- question: "What do you want to do?"

Hold the answer as \`$DESCRIPTION\`. Do not transform it — pass the prose through verbatim in Step 4.

### Step 3: Confirm it really is quick

\`\`\`bash
luca classify --task "$DESCRIPTION" --files <estimated-file-count> --domains "<comma-list>" --concerns "<comma-list>" --json
\`\`\`

Read the \`.complexity\` field, then take the **higher** of that and your own read — the heuristic scores breadth only and systematically under-rates deep single-file work, so it is a floor, never a ceiling.

- \`TRIVIAL\` or \`SIMPLE\` → this is a quick task. Hold that level as \`$COMPLEXITY\` and continue.
- \`MODERATE\` or above → **decline**. Nothing has been mutated yet, so this is a clean exit: tell the user the task is bigger than quick is for and hand it to the full entry point with \`Skill(skill: "lu", args: "$DESCRIPTION")\`. End your turn.

### Step 4: Register the phase

One phase, appended immediately after the current position so it is the next thing worked on:

\`\`\`bash
luca roadmap add-phase --name "$DESCRIPTION" --complexity "$COMPLEXITY" --after "$CURRENT_PHASE"
\`\`\`

The verb prints the phase it created:

\`\`\`json
{ "nn": "07", "slug": "07-fix-flaky-auth-test", "dir": ".luca/phases/07-fix-flaky-auth-test" }
\`\`\`

Use \`.dir\` verbatim wherever you need the phase directory — never assemble that path yourself. Hold \`.nn\` for the next step.

Two things to know about the verb:

- With \`--after "$CURRENT_PHASE"\` the new phase lands at \`currentPhase + 1\`. On an empty roadmap (\`currentPhase\` is \`0\`) it becomes phase \`01\` and is activated automatically.
- Inserting **renumbers** every later pending phase and renames its directory. That is by design — decimal phase numbers are not valid slugs. Mention it to the user if the roadmap had pending phases after the current one.

### Step 5: Position onto the new phase

\`\`\`bash
luca state set-current-phase --phase-number "$NN"
\`\`\`

Where \`$NN\` is the \`nn\` printed in Step 4. Idempotent when the verb already activated it; it also marks the phase in-progress.

### Step 6: Enter the pipeline

Two advances, both legal from \`idle\`, both unmasked — a failure here is a real contract violation and must surface:

\`\`\`bash
luca state advance --to-step triage
luca state advance --to-step research
\`\`\`

That is the whole of quick's triage: one phase on the roadmap, a complexity level recorded on it, and the run positioned at the first working step.

### Step 7: Hand off

\`\`\`
Skill(skill: "lu")
\`\`\`

Invoke it with **no arguments**. The run is already staged in \`.luca/state.json\`, so \`/lu\` sees a mid-flight pipeline, skips its own triage (which would otherwise call \`luca roadmap create\` and reset the roadmap you just built), and resumes at \`research\`. The complexity you settled on in Step 3 is on the roadmap entry, so \`/lu\` can read it back rather than re-classifying.

From here \`/lu\` owns the run. Quick is done.

## Success Criteria

- [ ] \`luca state read\` succeeded and \`pipelineStep\` was \`idle\` (otherwise: routed and stopped)
- [ ] Task description obtained
- [ ] Complexity resolved to \`TRIVIAL\` or \`SIMPLE\` (otherwise: routed to \`/lu\` and stopped)
- [ ] Exactly one phase registered via \`luca roadmap add-phase\`, its \`dir\` taken from the verb's output
- [ ] \`currentPhase\` positioned onto the new phase
- [ ] \`idle → triage → research\` completed with zero non-zero exits
- [ ] \`/lu\` invoked with no arguments
- [ ] No directories created, no artifacts written, no commits made by this skill

## Anti-Patterns

- Don't build a slug or a phase number yourself — \`luca roadmap add-phase\` owns both, and hand-built ones fail the contract validator.
- Don't invent a directory outside \`.luca/phases/<NN>-<slug>/\`. There is no quick-specific home.
- Don't advance past \`research\`. Every later step is \`/lu\`'s to drive.
- Don't mask an advance with \`|| true\` or \`2>/dev/null\`. If a transition is rejected, the skill is wrong and you need to see it.
- Don't promise the user that research or review will be skipped. They won't be.

## Next Steps

**Primary:** \`/lu\` — already invoked in Step 7; it drives the run to completion.

**Also available:**

- \`/progress\` — check where the run got to
- \`/note <message>\` — queue a task instead of starting one
</main>
`

export const quickSkill = defineSkill({
    name: 'quick',
    description:
        'Register a small ad-hoc task as a roadmap phase and hand it to the /lu pipeline, skipping the roadmap-decomposition conversation. Use when the task is one small, well-understood deliverable.',
    body: BODY,
})
