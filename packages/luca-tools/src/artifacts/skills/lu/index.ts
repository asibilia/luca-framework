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

### Triage

Triage runs once, at the start of a run. It is inline here — there is no separate triage skill.

1. **Classify complexity.** Read the request. Pick one of \`TRIVIAL | SIMPLE | MODERATE | COMPLEX | CRITICAL\` based on file count, scope, and risk. There is no CLI command to persist complexity — record it in your reasoning and pass it to every subagent you spawn (pass it to any subagent whose behavior varies by complexity). If \`--complexity=<level>\` or \`--force-complex\` was passed, use that directly.
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

### Pipeline loop

Repeat until the \`finalize\` step resets the run (\`pipelineStep\` returns to \`idle\`):

1. Run \`luca state read\` to get the current \`pipelineStep\`.
2. Run the step using the table below.
3. Advance to the next step with \`luca state advance --to-step <step>\`. Transitions are validated against the pipeline-transitions table — illegal jumps are rejected.

| Step          | How to run it                                                              |
|---------------|----------------------------------------------------------------------------|
| \`research\`    | Spawn \`researcher\` (Agent tool). Persist its output by writing \`research.md\` with the \`Write\` tool to the canonical phase path (get the dir from \`luca phase current\`). |
| \`discuss\`     | Invoke \`Skill(skill: "phase-discuss")\`.                                    |
| \`architect\`   | Lightweight synthesis: read research + context, confirm the plan-ready brief. Advance to \`plan\`. |
| \`plan\`        | Invoke \`Skill(skill: "phase-plan")\`.                                       |
| \`plan-review\` | Spawn \`plan-reviewer\` (Agent tool). On \`NEEDS_REVISION\`, loop back to \`plan\`. |
| \`execute\`     | Invoke \`Skill(skill: "phase-execute")\`.                                    |
| \`checks\`      | Run \`luca checks run --file <commands.json>\` with the project's typecheck (and tests, if present). On failure, loop back to \`execute\`. |
| \`verify\`      | Spawn \`verifier\` (Agent tool). On \`recommendation: fix\`, loop back to \`checks\`; on \`escalate\`, stop and surface to the user. |
| \`review\`      | Spawn \`reviewer\` (Agent tool) — one per perspective, in parallel.     |
| \`learn\`       | Spawn \`learner\` (Agent tool); it writes \`learn.md\` and returns a \`TO_PERSIST\` block. **You persist those learnings to MuninnDB** (subagents have no MCP access): for each \`TO_PERSIST\` entry call \`mcp__muninn__muninn_remember_batch\` routed to the entry's \`vault:\` (\`default\` for \`pattern:\`/\`pitfall:\`, the repo vault for \`convention:\`/\`decision:\`), deduping against existing memories. Then, if more phases remain: run \`luca phase advance\` (bumps \`currentPhase\` and marks the finished phase complete) **before** advancing the step to \`plan\`. On the last phase, do NOT run \`luca phase advance\`; advance to \`finalize\`. |
| \`finalize\`    | Spawn the \`finalize\` agent (Agent tool): gap detection, postmortem gate, PR creation, milestone close (invokes \`Skill(skill: "milestone-complete")\` for the versioned snapshot + phase archive). On a gap/postmortem block it re-enters via \`--to-step execute\`/\`review\`; on success it resets the run with \`--to-step idle\`. |

### Oversight

Read \`oversight\` from \`luca state read\`:

- \`full-auto\` — run the whole loop without pausing.
- \`checkpoint\` — pause after \`plan-review\`, \`verify\`, and \`learn\` for user confirmation.
- \`human-in-loop\` — pause after every step.

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
    name: "lu",
    description: "Unified entry point for all Luca workflows with cognitive pre-flight and complexity routing.",
    body: BODY,
})
