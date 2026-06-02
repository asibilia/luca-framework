/**
 * lu slash command — Start (or resume) the Luca autonomous development pipeline for a request.
 *
 * Ported from ~/.claude/commands/lu.md (user copy canonical) (E-6).
 * The /lu command is the orchestrator script that drives the pipeline loop
 * end-to-end. Substantially different from the lu skill (which is the
 * routing skill); both surfaces ship intentionally.
 */
import { defineCommand } from '../../define/command.ts'

const BODY = `# /lu

The unified entry point for the Luca pipeline. \`/lu <request>\` takes a development request and drives it through the full pipeline: triage → research → discuss → architect → plan → plan-review → execute → checks → verify → review → learn → finalize.

You are the **orchestrator**. You do not write code or planning artifacts directly — you read state, run each step (delegating to its skill or subagent), and advance the pipeline.

## Step 0 — Read state

Run \`luca state read\`. Branch on \`pipelineStep\`:

- \`idle\` or \`complete\` → fresh start. Go to **Triage**.
- anything else → the pipeline is mid-flight. Skip triage, go straight to **Pipeline loop** and resume from the current step.

If the user passed a request but the pipeline is already mid-flight, surface that to the user and ask whether to resume the current run or finish it first — do NOT silently discard either.

## Triage

Triage runs once, at the start of a run. It is inline here — there is no separate triage skill.

1. **Classify complexity.** Read the request. Pick one of \`TRIVIAL | SIMPLE | MODERATE | COMPLEX | CRITICAL\` based on file count, scope, and risk. There is no CLI command to persist complexity — record it in your reasoning and pass it to every subagent you spawn (the model-routing table keys off it).
2. **Build the roadmap.** Decompose the request into ordered phases. Each phase is one deliverable unit. Stage the phases array in a JSON file, then run \`luca roadmap create --file\`:
   \`\`\`
   # /tmp/luca-roadmap.json:
   # [
   #   { "name": "<kebab-or-prose name>", "deps": [], "complexity": "<level>" },
   #   ...
   # ]
   luca roadmap create --file /tmp/luca-roadmap.json
   \`\`\`
   For a single-deliverable request, that is a one-phase roadmap. \`luca roadmap create\` is only legal in \`idle\`/\`triage\` — it resets \`currentPhase\` to 0.
3. **Advance** \`idle → triage → research\` via two \`luca state advance --to-step <step>\` calls.

## Pipeline loop

Repeat until the \`finalize\` step resets the run (\`pipelineStep\` returns to \`idle\`):

1. Run \`luca state read\` to get the current \`pipelineStep\`.
2. Run the step using the table below.
3. Advance to the next step with \`luca state advance --to-step <step>\`. Transitions are validated against the pipeline-transitions table — illegal jumps are rejected.

| Step          | How to run it                                                              |
|---------------|----------------------------------------------------------------------------|
| \`research\`    | Spawn \`researcher\` (Agent tool). Persist its output by writing \`research.md\` with the \`Write\` tool to the canonical phase path (get the dir from \`luca phase current\`). |
| \`discuss\`     | Invoke the \`/phase-discuss\` skill.                                         |
| \`architect\`   | Lightweight synthesis: read research + context, confirm the plan-ready brief. Advance to \`plan\`. |
| \`plan\`        | Invoke the \`/phase-plan\` skill.                                            |
| \`plan-review\` | Spawn \`plan-reviewer\` (Agent tool). On \`NEEDS_REVISION\`, loop back to \`plan\`. |
| \`execute\`     | Invoke the \`/phase-execute\` skill.                                         |
| \`checks\`      | Run \`luca checks run --file <commands.json>\` with the project's typecheck (and tests, if present). On failure, loop back to \`execute\`. |
| \`verify\`      | Spawn \`verifier\` (Agent tool). On \`recommendation: fix\`, loop back to \`checks\`; on \`escalate\`, stop and surface to the user. |
| \`review\`      | Spawn \`reviewer\` (Agent tool) — one per perspective, in parallel.     |
| \`learn\`       | Spawn \`learner\` (Agent tool); it writes \`learn.md\` and returns a \`TO_PERSIST\` block. **You persist those learnings to MuninnDB** (subagents have no MCP access): for each \`TO_PERSIST\` entry call \`mcp__muninn__muninn_remember_batch\` routed to the entry's \`vault:\` (\`default\` for \`pattern:\`/\`pitfall:\`, the repo vault for \`convention:\`/\`decision:\`), deduping against existing memories. Then: more phases remain → run \`luca phase advance\`, then advance to \`plan\`; last phase → advance to \`finalize\`. |
| \`finalize\`    | Spawn the \`finalize\` agent (Agent tool): gap detection, postmortem gate, PR creation, milestone close (invokes \`/milestone-complete\` for the versioned snapshot + phase archive). On a gap/postmortem block it re-enters via \`--to-step execute\`/\`review\`; on success it resets the run with \`--to-step idle\`. |

## Oversight

Read \`oversight\` from \`luca state read\`:

- \`full-auto\` — run the whole loop without pausing.
- \`checkpoint\` — pause after \`plan-review\`, \`verify\`, and \`learn\` for user confirmation.
- \`human-in-loop\` — pause after every step.

## What you must NOT do

- Do NOT write code directly. Phase artifact files are written with the \`Write\` tool to their canonical path by a subagent or \`/phase-*\` skill; structured \`.luca/\` mutations go through the \`luca\` CLI. The stage-gate hook blocks any other direct write.
- Do NOT skip steps. The pipeline-transitions table is the contract; \`luca state advance\` enforces it. There is no bypass.
- Do NOT re-triage a mid-flight pipeline. Resume from the current step instead.
- Do NOT commit. Commits happen only in the finalizing flow, never inside \`/lu\`.

$ARGUMENTS
`

export const luCommand = defineCommand({
    name: 'lu',
    description:
        'Start (or resume) the Luca autonomous development pipeline for a request.',
    body: BODY,
})
