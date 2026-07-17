/**
 * lu slash command — Start (or resume) the Luca autonomous development pipeline for a request.
 *
 * Ported from ~/.claude/commands/lu.md (user copy canonical) (E-6).
 * The /lu command is the orchestrator script that drives the pipeline loop
 * end-to-end. Substantially different from the lu skill (which is the
 * routing skill); both surfaces ship intentionally.
 */
import { defineCommand } from '../../define/command.ts'
import { INPHASE_TERSENESS_DIRECTIVE } from '../shared/index.ts'

const BODY = `# /lu

The unified entry point for the Luca pipeline. \`/lu <request>\` takes a development request and drives it through the full pipeline: triage → research → discuss → architect → plan → plan-review → execute → checks → verify → review → learn → finalize.

You are the **orchestrator**. You do not write code or planning artifacts directly — you read state, run each step (delegating to its skill or subagent), and advance the pipeline.

${INPHASE_TERSENESS_DIRECTIVE}

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
   # .luca/tmp/roadmap.json:
   # [
   #   { "name": "<kebab-or-prose name>", "deps": [], "complexity": "<level>" },
   #   ...
   # ]
   luca roadmap create --file .luca/tmp/roadmap.json
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
| \`architect\`   | Lightweight synthesis: read research + context, confirm the plan-ready brief. Writes nothing — the downstream \`plan\` / \`plan-review\` steps own the plan write. Advance to \`plan\`. |
| \`plan\`        | Invoke the \`/phase-plan\` skill.                                            |
| \`plan-review\` | Spawn \`plan-reviewer\` (Agent tool). On \`NEEDS_REVISION\`, loop back to \`plan\`. After \`APPROVED\`, check \`plan-review.md\` for an existing \`## Confidence Gate Resolutions\` section (a resuming orchestrator re-uses it rather than re-running the gate); then run the **Confidence Gate** (see below) before advancing. |
| \`execute\`     | Invoke the \`/phase-execute\` skill, injecting the gate resolutions as a \`<confidence-gate-resolutions>\` block in its prompt. (The Confidence Gate runs between plan-review and execute — see the section below; it is a sub-step, not a \`pipelineStep\`.)                                         |
| \`checks\`      | Run \`luca checks run --file .luca/tmp/checks.json\` (stage the commands array there — never in shared /tmp/) with the project's typecheck (and tests, if present). On failure, loop back to \`execute\`. |
| \`verify\`      | Spawn \`verifier\` (Agent tool). On \`recommendation: fix\`, loop back to \`checks\`; on \`escalate\`, stop and surface to the user. |
| \`review\`      | Spawn \`reviewer\` (Agent tool) — one per perspective, in parallel.     |
| \`learn\`       | Spawn \`learner\` (Agent tool); it writes \`learn.md\` and returns a \`TO_PERSIST\` block. **You persist those learnings to MuninnDB** (subagents have no MCP access). FIRST resolve the repo vault once: read \`.luca/config.json\` → \`muninn.vault\` (fallback \`"default"\`). Then for each \`TO_PERSIST\` entry, take its \`vault:\` value and substitute the literal placeholder \`<repo-vault>\` (or any non-\`default\` placeholder the learner emitted) with that resolved name — a literal \`<repo-vault>\`/\`repo_vault\` must NEVER be passed to muninn. Call \`mcp__muninn__muninn_remember_batch\` with the substituted vaults (\`default\` for \`pattern:\`/\`pitfall:\`/\`procedure:\`, the resolved repo vault for \`convention:\`/\`decision:\`), deduping against existing memories. Then: more phases remain → run \`luca phase advance\`, then advance to \`plan\`; last phase → advance to \`finalize\`. |
| \`finalize\`    | Spawn the \`finalize\` agent (Agent tool): gap detection, postmortem gate, PR creation, milestone close (invokes \`/milestone-complete\` for the versioned snapshot + phase archive). On a gap/postmortem block it re-enters via \`--to-step execute\`/\`review\`; on success it resets the run with \`--to-step idle\`. |

## Confidence Gate (between plan-review and execute)

After \`plan-reviewer\` returns \`APPROVED\`, run the gate before advancing to \`execute\`:

**Resume check:** if \`plan-review.md\` already contains a \`## Confidence Gate Resolutions\` section (from a prior run or interrupted gate), skip steps 1–4 below and proceed directly to step 5 (hold resolutions in context) and step 6 (advance to execute).

1. \`luca confidence gate --slug <currentPhaseSlug>\` → parse \`{ auto, research, ask, counts }\`.
2. **All-auto check:** if \`counts.research === 0\` and \`counts.ask === 0\`, proceed directly to step 6 — no resolutions to record.
3. **\`auto\`** — proceed silently.
4. **\`research\`** — per entry, spawn \`researcher\` (Agent tool) with the following prompt template:
   > "You are a researcher resolving a planning-time ambiguity for the Luca confidence gate.
   > Decision: <entry.decision>
   > Category: <entry.category>
   > Reasoning recorded by the executor: <entry.reasoning>
   > Alternatives considered: <entry.alternatives>
   > Provide a concrete recommendation (one clear answer) and a brief rationale (2–4 sentences). Respond with: RECOMMENDATION: <answer> RATIONALE: <why>"
   Record recommendation as \`[gate-research]\` resolution.
5. **\`ask\`** — per entry, use the **AskUserQuestion** tool to surface ONE targeted question: set the question to the entry's \`decision\` and options to the entry's \`alternatives\`. **Block until the user answers — do NOT proceed on an unanswered question.** Record the answer as a \`[gate-ask]\` resolution. **This is the only pause in \`full-auto\`** — gate \`ask\` items pause even in full-auto; \`checkpoint\` and \`human-in-loop\` additionally pause at their normal points.
6. Get the phase dir via \`luca phase current\`. Read \`.luca/phases/<slug>/plan-review.md\`. **Check if a \`## Confidence Gate Resolutions\` section already exists** — if so, skip the append (idempotency guard). Otherwise, append \`## Confidence Gate Resolutions\` with all resolutions using the \`Edit\` tool (not \`Write\`). This write targets \`plan-review.md\` (legal at \`plan-review\` step) — do NOT write to \`context.md\` (blocked here).
7. Hold resolutions in context; inject them as \`<confidence-gate-resolutions>\` into the \`/phase-execute\` prompt at the execute step so the implementer resolves ambiguities without re-asking the user.

## Oversight

Read \`oversight\` from \`luca state read\`:

- \`full-auto\` — autonomous: the only pauses are confidence-gate \`ask\` items (low-confidence + unresearchable) and CRITICAL safety. All other steps run without interruption.
- \`checkpoint\` — pause after \`plan-review\` (post-gate), \`verify\`, and \`learn\` for user confirmation; confidence-gate \`ask\` items also pause.
- \`human-in-loop\` — pause after every step; confidence-gate \`ask\` items pause within the plan-review step as well.

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
