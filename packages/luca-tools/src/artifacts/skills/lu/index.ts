/**
 * lu skill — Unified entry point for all Luca workflows with cognitive pre-flight and complexity routing.
 *
 * Ported from fd0b169be:packages/luca-framework/.cursor/skills/lu/SKILL.md (pre-D-4) (E-5).
 * Body path-retargeting: .planning/ → .luca/; uppercase artifacts
 * (PLAN.md, RESEARCH.md, CONTEXT.md, POSTMORTEM.md) → LUCA_DIR_CONTRACT
 * canonicals (plan.md, research.md, context.md, learn.md).
 */
import { defineSkill } from '../../../define/skill.ts'
import { INPHASE_TERSENESS_DIRECTIVE } from '../../shared/index.ts'

const BODY = `<main>
The single entry point for the Luca pipeline. This SKILL is the long-form companion to the modernized \`/lu\` slash command — it drives the pipeline loop end-to-end: triage → research → discuss → architect → plan → plan-review → execute → checks → verify → review → learn → finalize.

**Arguments:** \`<task-description> [--complexity=TRIVIAL|SIMPLE|MODERATE|COMPLEX|CRITICAL] [--force-complex] [--skip-memory] [--skip-branch]\`

**CRITICAL:** You are the **orchestrator**. You do not write code or planning artifacts directly — you read state, run each step (delegating to its skill or subagent), and advance the pipeline via \`luca state advance\`.

${INPHASE_TERSENESS_DIRECTIVE}

</main>

<sub-agent_delegation_requirements>
This skill uses TWO delegation mechanisms:

**Skill tool** — for workflow sub-skills (phase-discuss, phase-plan, phase-execute, etc.)

- Invoke: \`Skill(skill: "skill-name", args: "...")\`
- Each invoked skill loads its own SKILL.md with full instructions
- Users see visual skill headers for each step

**Task tool** — for specialized subagents (researcher, plan-reviewer, verifier, reviewer, learner)

- Invoke: \`Task(agent: "agent-name", prompt: "...")\`
- Subagents run inside a fresh sub-context

### Model Resolution

Models are set by each agent’s own definition (and the harness default). The skill does not pick model strings — it spawns the named agent and the routing layer handles tier selection.

</sub-agent_delegation_requirements>

<workflow>
Execute these steps in order. Each step is either a Task tool call (for subagents) or a Skill tool call (for sub-skills).

### Step 0: Read state

Run \`luca state read\`. Branch on \`pipelineStep\`:

- \`idle\` or \`complete\` → fresh start. Go to **Triage**.
- anything else → the pipeline is mid-flight. Skip triage, go straight to **Pipeline loop** and resume from the current step.

If the user passed a request but the pipeline is already mid-flight, surface that to the user and ask whether to resume the current run or finish it first — do NOT silently discard either.

**Run id for recall telemetry.** \`luca telemetry emit\` REQUIRES a \`--run-id <runId>\` flag, and it is also what names the per-run log \`.luca/telemetry/<runId>.jsonl\`. Recall quality (\`recall.hit\` / \`recall.miss\` / \`recall.utilization\`) is the ONLY telemetry the pipeline still writes locally — pipeline boundaries, subagent spans, and cost live in LangSmith traces, and mode transitions live in \`.luca/ledger.jsonl\`. Establish the run id ONCE here and re-use that exact value as \`--run-id\` on EVERY \`luca telemetry emit\` the pipeline steps run.

Resolve it like this: the run id is the state's \`sessionId\` (the generated pipeline RUN id, normally stamped at init). Read it from the same \`luca state read\` output (the \`.sessionId\` field). **But \`sessionId\` can be empty/unset** — recovery and partial runs don't always stamp it — and passing an empty \`--run-id\` (a REQUIRED flag) makes every emit exit 1. So if \`sessionId\` is empty, mint one with \`luca state new-run\` (it prints a fresh run id and writes nothing) and reuse that minted value as the run id for the rest of this run. Equivalent to:

\`\`\`bash
RUN_ID=$(luca state read | jq -r '.sessionId // empty')
[ -z "$RUN_ID" ] && RUN_ID=$(luca state new-run)
# then: --run-id "$RUN_ID" on every recall emit; the run's log is .luca/telemetry/$RUN_ID.jsonl
\`\`\`

Hold \`RUN_ID\` in context and pass it as \`--run-id\` everywhere below. Do NOT re-derive it or mint a second id mid-run — one run id per run.

**Attribution flags — the other half of the join.** \`--run-id\` alone does not make a record joinable. Every post-triage \`recall.*\` emit also carries \`--slug <currentPhaseSlug> --complexity <level> --oversight <oversight>\` (and \`--wave <waveIndex>\` at execute), because these records are now the ONLY producer of the \`slug\`/\`wave\` stamps the \`trace-insights\` Stage A5 ledger↔telemetry join keys on — the ledger \`mode-transition\` rows carry neither. \`luca telemetry emit\` reads all of them from flags only, so an unflagged emit writes \`slug: null\` and joins to nothing, silently degrading \`costByPhase\` to "attribution unavailable" for the whole run. Nothing errors; the data is just gone.

Of the three, only \`<level>\` needs YOU: there is no CLI surface that persists top-level \`state.complexity\`, so **pass the complexity you classify in Triage below into every mode-agent prompt you spawn** (the model-routing table already needs it). The modes resolve \`--slug\` from \`luca phase current\` and \`--oversight\` from \`luca state read\` themselves. The triage-stage recall is the one deliberate exception — it fires before classification and before any phase is active, so it emits unflagged and carries \`slug: null\`.

### Triage

Triage runs once, at the start of a run. It is inline here — there is no separate triage skill.

1. **Classify complexity.** Read the request. Pick one of \`TRIVIAL | SIMPLE | MODERATE | COMPLEX | CRITICAL\` based on file count, scope, and risk. There is no CLI command to persist complexity — record it in your reasoning and pass it to every subagent you spawn (pass it to any subagent whose behavior varies by complexity). If \`--complexity=<level>\` or \`--force-complex\` was passed, use that directly.

   **Heuristic baseline (floor, not ceiling).** Compute the deterministic baseline with \`luca classify\`, passing the scope signals you already extracted while reading the request — NOT just \`--task\`. A \`--task\`-only call starves the heuristic (it scores \`estimatedFileCount=0\`, no domains, no concerns) and collapses to description-keyword matching, which systematically under-scores work. Supply every signal you can estimate:
   \`\`\`
   luca classify --task "<request>" --files <estimated-file-count> --domains "<comma-list>" --concerns "<comma-list>" [--breaking] --json
   \`\`\`
   (\`--task\` is REQUIRED; \`--files\`/\`--domains\`/\`--concerns\`/\`--breaking\` are optional — pass each one you can estimate. Read the \`.complexity\` field.)

   This baseline is a **FLOOR, never a ceiling.** Breadth signals (files, domains) cannot measure design/iteration depth — a deep single-file design, tuning, or balancing task is genuinely hard yet touches one file. Your own judgment is authoritative: take the HIGHER of the heuristic level and your read, and never demote below your judgment to match the heuristic. **In particular, never trust a \`TRIVIAL\` heuristic result on its face — re-judge it before accepting**, because a breadth-only score under-rates deep single-file work.

2. **Build the roadmap.** Decompose the request into ordered phases. Each phase is one deliverable unit. Stage the phases array in a JSON file, then run \`luca roadmap create --file\`:
   \`\`\`
   # .luca/tmp/roadmap.json:
   # [
   #   { "name": "<kebab-or-prose name>", "deps": [], "complexity": "<level>" },
   #   ...
   # ]
   luca roadmap create --file .luca/tmp/roadmap.json
   \`\`\`
   For a single-deliverable request, that is a one-phase roadmap. \`luca roadmap create\` is only legal in \`idle\`/\`triage\` — it resets \`currentPhase\` to 0.
3. **Advance** \`idle → triage → research\` via two \`luca state advance --to-step <step>\` calls.

### Pipeline loop

Repeat until the \`finalize\` step resets the run (\`pipelineStep\` returns to \`idle\`):

1. Run \`luca state read\` to get the current \`pipelineStep\`.
1a. **Budget guard (always-on stop).** Run \`luca budget check --complexity <level>\` and parse \`.status\` (always exits 0). This fires ONLY here, at the top-of-loop clean boundary — \`state.json\` is already resumable via Step 0, so nothing mid-flight is left dangling.
   - \`ok\` → continue to step 2.
   - \`warn\` → note the \`tripped\` dimensions in your reasoning (surface once to the user if you haven't) and keep going.
   - \`halt\` → **do NOT advance the pipeline.** Checkpoint-and-pause: (a) invoke \`Skill(skill: "lu-handoff")\` (or persist a resumable \`session:*\` handoff memory to the repo vault) capturing the current \`pipelineStep\`/\`currentPhase\`, the verdict's \`tripped\` dimensions, and the next action, including the verdict's \`tripped\` dimensions joined into a single comma-separated string (e.g. \`wallClock,toolCalls\`); (b) surface a paste-ready resume message ("Budget guard tripped (<dims>). Run checkpointed at step <step>; re-run /lu to resume."). Then END YOUR TURN.
2. Run the step using the table below.
3. Advance to the next step with \`luca state advance --to-step <step>\`. Transitions are validated against the pipeline-transitions table — illegal jumps are rejected.

**The loop yields at each phase boundary** (after \`learn\`) — see "Phase-boundary handoff & yield" below. This bounds the orchestrator's resident context: each phase runs in a fresh turn instead of accumulating every phase's artifacts and subagent returns in one continuous transcript (the dominant cost driver — see \`docs/decisions/orchestrator-context-pruning.md\`).

| Step          | How to run it                                                              |
|---------------|----------------------------------------------------------------------------|
| \`research\`    | Get the phase dir from \`luca phase current\` and pass it to \`researcher\` (Agent tool) so **it writes \`research.md\` itself**; hold ONLY the compact summary it returns. Do NOT inline the researcher's full findings or re-write the file yourself — the full findings transiting your context is the largest per-phase context bloat (see \`docs/decisions/orchestrator-context-pruning.md\`). |
| \`discuss\`     | Invoke \`Skill(skill: "phase-discuss")\`.                                    |
| \`architect\`   | Lightweight synthesis: read research + context, confirm the plan-ready brief. Writes nothing — the downstream \`plan\` / \`plan-review\` steps own the plan write. Advance to \`plan\`. |
| \`plan\`        | Invoke \`Skill(skill: "phase-plan")\`.                                       |
| \`plan-review\` | Spawn \`plan-reviewer\` (Agent tool). On \`NEEDS_REVISION\`, loop back to \`plan\`. After the reviewer returns \`APPROVED\`, check \`plan-review.md\` for an existing \`## Confidence Gate Resolutions\` section (a resuming orchestrator must re-use it — do NOT re-run the gate); then run the **Confidence Gate** (see below) before advancing. |
| \`execute\`     | Invoke \`Skill(skill: "phase-execute")\`, injecting the Confidence Gate resolutions into its prompt (see below).                                    |
| \`checks\`      | Run \`luca checks run --file .luca/tmp/checks.json\` (stage the commands array there — never in shared /tmp/) with the project's typecheck (and tests, if present). On failure, loop back to \`execute\`. |
| \`verify\`      | Spawn \`verifier\` (Agent tool). On \`recommendation: fix\`, loop back to \`checks\`; on \`escalate\`, stop and surface to the user. The verifier returns a compact envelope (status/recommendation/counts + the verify.json path) — hold only that and re-Read verify.json before branching; do NOT inline its per-criterion analysis (see \`docs/decisions/orchestrator-context-pruning.md\`). |
| \`review\`      | Spawn \`reviewer\` (Agent tool) — one per perspective, in parallel. Each reviewer returns a compact envelope (perspective/verdict/counts + audit path) — hold only the per-perspective verdict and counts, re-Read the audit file when you need finding detail; do NOT inline the full FINDINGS block (see \`docs/decisions/orchestrator-context-pruning.md\`). |
| \`learn\`       | Spawn \`learner\` (Agent tool), injecting the run's signal digest into its prompt (see "Learner prompt injection" below); it writes \`learn.md\` and returns a compact envelope whose only payload is the \`TO_PERSIST\` block (not learn.md's full sections). **You persist those learnings to MuninnDB** (subagents have no MCP access) — hold the TO_PERSIST block until persisted, then drop it; re-Read learn.md for any narrative detail (see \`docs/decisions/orchestrator-context-pruning.md\`). FIRST resolve the repo vault once: read \`.luca/config.json\` → \`muninn.vault\` (fallback \`"default"\`). Then for each \`TO_PERSIST\` entry, substitute the literal \`<repo-vault>\` placeholder (or any non-\`default\` placeholder the learner emitted) in its \`vault:\` with that resolved name — a literal \`<repo-vault>\`/\`repo_vault\` must NEVER reach muninn. Call \`mcp__muninn__muninn_remember_batch\` with the substituted vaults (\`default\` for \`pattern:\`/\`pitfall:\`/\`procedure:\`, the resolved repo vault for \`convention:\`/\`decision:\`), deduping against existing memories. Then, if more phases remain: run \`luca phase advance\` (bumps \`currentPhase\` and marks the finished phase complete), advance the step to \`plan\`, then **hand off and yield at the phase boundary** per "Phase-boundary handoff & yield" below — do NOT loop straight into the next phase's work in the same turn. On the last phase, do NOT run \`luca phase advance\`; advance to \`finalize\` and run the finalize step in this same turn (no boundary yield before finalize). |
| \`finalize\`    | Spawn the \`finalize\` agent (Agent tool): gap detection, postmortem gate, PR creation, milestone close (invokes \`Skill(skill: "milestone-complete")\` for the versioned snapshot + phase archive). On a gap/postmortem block it re-enters via \`--to-step execute\`/\`review\`; on success it resets the run with \`--to-step idle\`. |

### Confidence Gate (between plan-review and execute)

After \`plan-reviewer\` returns \`APPROVED\` and **before** advancing to \`execute\`, run the Confidence Gate:

**Resume check:** if \`plan-review.md\` already contains a \`## Confidence Gate Resolutions\` section (from a prior run or interrupted gate), skip steps 1–3 below and proceed directly to step 4 (hold resolutions in context) and step 5 (advance to execute).

1. **Read the gate output:**
   \`\`\`
   luca confidence gate --slug <currentPhaseSlug>
   \`\`\`
   Parse the JSON response for \`{ auto, research, ask, counts }\`.

2. **All-auto check:** if \`counts.research === 0\` and \`counts.ask === 0\` (every entry is \`auto\`), proceed directly to step 5 — skip research, skip asking, no resolutions to append.

3. **Route each bucket:**

   - **\`auto\`** entries — all high/medium-confidence entries that the gate routed automatically. Proceed silently.

   - **\`research\`** entries — each entry has a factual ambiguity resolvable by automated research. For each entry, spawn a \`researcher\` (Agent tool) with the following prompt template:
     > "You are a researcher resolving a planning-time ambiguity for the Luca confidence gate.
     > Decision: <entry.decision>
     > Category: <entry.category>
     > Reasoning recorded by the executor: <entry.reasoning>
     > Alternatives considered: <entry.alternatives>
     > Provide a concrete recommendation (one clear answer) and a brief rationale (2–4 sentences). Respond with: RECOMMENDATION: <answer> RATIONALE: <why>"
     Record the researcher's recommendation as the resolution (annotated \`[gate-research]\`).

   - **\`ask\`** entries — low-confidence, unresearchable entries. For each entry, use the **AskUserQuestion** tool to surface ONE targeted question: set the question to the entry's \`decision\` and the options/alternatives to the entry's \`alternatives\`. **Block until the user answers — do NOT proceed on an unanswered question.** Record the user's answer as the resolution (annotated \`[gate-ask]\`). **This is the only pause in \`full-auto\` mode** — gate \`ask\` items pause even in full-auto by design. In \`checkpoint\` and \`human-in-loop\`, normal oversight pauses additionally apply.

4. **Persist resolutions to \`plan-review.md\`:**
   Get the phase dir via \`luca phase current\`. Read the existing \`.luca/phases/<slug>/plan-review.md\` (via the \`Read\` tool). **Check if a \`## Confidence Gate Resolutions\` section already exists** — if it does, skip this append (idempotency guard against plan-review→plan→plan-review re-runs). Otherwise, append the section with each resolution (decision, bucket, recommendation/answer). Use the \`Edit\` tool to append to the file — this write is legal at the \`plan-review\` pipelineStep per \`STEP_ARTIFACTS\`. Do NOT write to \`context.md\` (blocked at this step).

5. **Hold resolutions in context.** You will inject them into the executor's prompt at the \`execute\` step (see "Executor prompt injection" below) so the implementer acts on them even if context compresses.

6. **Advance to \`execute\`** via \`luca state advance --to-step execute\`.

### Executor prompt injection (at the execute step)

When invoking \`Skill(skill: "phase-execute")\`, prepend the gate resolutions (held in context from step 5 above) to the skill's args or opening prompt as a \`<confidence-gate-resolutions>\` block:

\`\`\`
<confidence-gate-resolutions>
[gate-research] <decision>: <researcher recommendation>
[gate-ask] <decision>: <user answer>
... (one line per resolution; empty block if all were auto)
</confidence-gate-resolutions>
\`\`\`

The executor subagent uses these resolutions to resolve ambiguities without re-asking the user.

### Learner prompt injection (at the learn step)

Before spawning the \`learner\` (Agent tool) at the \`learn\` step, gather the run's decision + rework record and build a **compact run digest** so the learner can cluster it (subagents have no MCP or \`.luca/\` read access — the digest must travel in the prompt, exactly as gate resolutions travel to the executor above):

1. **Collect the confidence journal** — the executor's recorded confidence entries (decision, category, confidence level, the gate bucket each was routed to, and any gate resolution from \`plan-review.md\`).
2. **Collect the rework record** from \`.luca/ledger.jsonl\` for this run's \`runId\` (the one established at Step 0): the \`pipeline-re-entered\` and \`fixloop-counted\` entries, which say which steps looped back and how close each loop came to its budget.
3. **Compact it.** One line per confidence entry: level, category, decision. One line per rework entry: edge, counter, budget verdict. Aggregate where it helps (e.g. \`rework: 2 checks→execute, 1 verify→checks\`) — keep the whole digest to a handful of lines, not a transcript.
4. **Inject** the digest into the learner's opening prompt as a \`<signal-digest>\` block (mirror the \`<confidence-gate-resolutions>\` shape above):

\`\`\`
<signal-digest>
[confidence] low/design-choice — picked closure over factory for cache
[rework] checks->execute ×2 (budget 5, within)
[rework] verify->checks ×1 (budget 3, within)
... (one line per entry; empty block if the run produced no signals)
</signal-digest>
\`\`\`

The learner clusters the digest to surface recurring decision/rework patterns alongside the artifacts it reads for \`learn.md\`.

### Phase-boundary handoff & yield

After \`luca phase advance\` at a phase boundary (more phases remain), bound the resident context instead of chaining the next phase into the same turn:

1. **Persist the cognitive handoff.** Invoke \`Skill(skill: "lu-handoff")\`. It writes the \`session:phase-boundary-handoff\` memory to the repo vault (decisions made this phase, open threads, and a 2-4 sentence resume prompt for the next phase) and surfaces a preservation-steered \`/compact\` command. This is the layer a turn boundary would otherwise drop — the mechanical state (\`pipelineStep\`, \`currentPhase\`, artifacts) is already durable in \`.luca/state.json\` + on disk, so Step 0 resumes phase N+1 losslessly.
2. **Then act by \`oversight\`:**
   - \`checkpoint\` / \`human-in-loop\` — this IS the post-\`learn\` pause: surface the handoff summary + the \`/compact\` command and **END YOUR TURN**. The user compacts and re-invokes \`/lu\`, which resumes phase N+1 from state with a small context. (This is where the context-compaction win lands today.)
   - \`full-auto\` — persist the handoff (done in step 1, so recovery is durable and any auto-compact is steered), then **continue** into phase N+1 in this turn. Full-auto does NOT yield yet: current source has no autonomous re-invoker (autopilot was removed in \`433c78080\`, #290), so yielding would stall the run. Restoring an outer-loop re-invoker so full-auto also yields-and-resumes is tracked follow-up (see \`docs/decisions/orchestrator-context-pruning.md\` and luca-framework#319).

Regardless of oversight, the researcher/reviewer/verifier/learner subagents already keep their verbose output in their own context and return only compact envelopes (see the \`research\` row) — so per-phase bloat is cut in **every** mode, and the boundary yield additionally caps cross-phase growth where a re-invoker exists.

### Oversight

Read \`oversight\` from \`luca state read\`:

- \`full-auto\` — autonomous: the only pauses are confidence-gate \`ask\` items (low-confidence + unresearchable), CRITICAL safety, and the always-on budget halt (see below). All other steps run without interruption.
- \`checkpoint\` — pause after \`plan-review\` (post-gate), \`verify\`, and \`learn\` for user confirmation; confidence-gate \`ask\` items also pause.
- \`human-in-loop\` — pause after every step; confidence-gate \`ask\` items pause within the plan-review step as well.
- **always-on budget stop** — the top-of-loop budget guard (step 1a) is the one stop that fires even in \`full-auto\`: a \`halt\` verdict checkpoints-and-pauses regardless of oversight mode. Wall-clock, tool-call, and cost ceilings apply in every mode.

### What you must NOT do

- Do NOT write code directly. Phase artifact files are written with the \`Write\` tool to their canonical path by a subagent or \`/phase-*\` skill; structured \`.luca/\` mutations go through the \`luca\` CLI. The stage-gate hook blocks any other direct write.
- Do NOT skip steps. The pipeline-transitions table is the contract; \`luca state advance\` enforces it. There is no bypass.
- Do NOT re-triage a mid-flight pipeline. Resume from the current step instead.
- Do NOT commit. Commits happen only in the finalizing flow, never inside \`/lu\`.

### Other entry points (alternatives to /lu)

- New project initialization: \`Skill(skill: "project-new", args: "<project description>")\`
- New milestone: \`Skill(skill: "milestone-new", args: "<milestone description>")\`
- Quick / ad-hoc task that doesn't need a roadmap: \`Skill(skill: "quick", args: "<task-description>")\`
- Progress check: \`Skill(skill: "progress")\`
- Session planning: \`Skill(skill: "session-plan")\`

PR-review and debug workflows are not bundled with the v13 Luca skill set; reach for the user's own \`gh-pr-address\` / \`bug-diagnose\` skills (under \`~/.claude/skills/\`) when present.

</workflow>
`

export const luSkill = defineSkill({
    name: 'lu',
    description:
        'Unified entry point for all Luca workflows with cognitive pre-flight and complexity routing.',
    body: BODY,
})
