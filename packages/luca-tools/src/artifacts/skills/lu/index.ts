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

**Run id for telemetry.** \`luca telemetry emit\` REQUIRES a \`--run-id <runId>\` flag, and it is also what names the per-run log \`.luca/telemetry/<runId>.jsonl\`. Establish the run id ONCE here and re-use that exact value as \`--run-id\` on EVERY \`luca telemetry emit\` below, and as the filename when you read back the log at the learn step. Emit and readback MUST use the identical run id so the filename lines up.

Resolve it like this: the run id is the state's \`sessionId\` (the generated pipeline RUN id, normally stamped at init). Read it from the same \`luca state read\` output (the \`.sessionId\` field). **But \`sessionId\` can be empty/unset** — recovery and partial runs don't always stamp it — and passing an empty \`--run-id\` (a REQUIRED flag) makes every emit exit 1. So if \`sessionId\` is empty, mint one with \`luca telemetry new-run\` (it prints a fresh run id) and reuse that minted value as the run id for the rest of this run. Equivalent to:

\`\`\`bash
RUN_ID=$(luca state read | jq -r '.sessionId // empty')
[ -z "$RUN_ID" ] && RUN_ID=$(luca telemetry new-run)
# then: --run-id "$RUN_ID" on every emit; the run's log is .luca/telemetry/$RUN_ID.jsonl
\`\`\`

Hold \`RUN_ID\` in context and pass it as \`--run-id\` everywhere below. Do NOT re-derive it or mint a second id mid-run — one run id per run.

### Triage

Triage runs once, at the start of a run. It is inline here — there is no separate triage skill.

1. **Classify complexity.** Read the request. Pick one of \`TRIVIAL | SIMPLE | MODERATE | COMPLEX | CRITICAL\` based on file count, scope, and risk. There is no CLI command to persist complexity — record it in your reasoning and pass it to every subagent you spawn (pass it to any subagent whose behavior varies by complexity). If \`--complexity=<level>\` or \`--force-complex\` was passed, use that directly.

   **Override telemetry.** Once the final complexity level is chosen, compare it against the deterministic heuristic baseline from \`luca classify --task "<request>" --json\` (the \`--task\` flag is REQUIRED — read its \`.complexity\` field). On a MISMATCH between the heuristic level and your final level, emit one override record:
   \`\`\`
   luca telemetry emit --kind classifier.override --run-id <runId> --meta '{"classifier":"complexity","from":"<heuristic-level>","to":"<final-level>","source":"<taxonomy>"}'
   \`\`\`
   Pick \`source\` from this taxonomy by what drove the final level: \`cli-flag\` (a \`--complexity=<level>\` flag), \`force-complex\` (the \`--force-complex\` flag), \`human-ask\` (a gate-ask / AskUserQuestion override), or \`heuristic-promotion\` (you raised the level above the classify score on your own judgment). When heuristic and final agree, emit nothing.
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
2. Run the step using the table below.
3. Advance to the next step with \`luca state advance --to-step <step>\`. Transitions are validated against the pipeline-transitions table — illegal jumps are rejected.

| Step          | How to run it                                                              |
|---------------|----------------------------------------------------------------------------|
| \`research\`    | Spawn \`researcher\` (Agent tool). Persist its output by writing \`research.md\` with the \`Write\` tool to the canonical phase path (get the dir from \`luca phase current\`). |
| \`discuss\`     | Invoke \`Skill(skill: "phase-discuss")\`.                                    |
| \`architect\`   | Lightweight synthesis: read research + context, confirm the plan-ready brief. Advance to \`plan\`. |
| \`plan\`        | Invoke \`Skill(skill: "phase-plan")\`.                                       |
| \`plan-review\` | Spawn \`plan-reviewer\` (Agent tool). On \`NEEDS_REVISION\`, loop back to \`plan\`. After the reviewer returns \`APPROVED\`, check \`plan-review.md\` for an existing \`## Confidence Gate Resolutions\` section (a resuming orchestrator must re-use it — do NOT re-run the gate); then run the **Confidence Gate** (see below) before advancing. |
| \`execute\`     | Invoke \`Skill(skill: "phase-execute")\`, injecting the Confidence Gate resolutions into its prompt (see below).                                    |
| \`checks\`      | Run \`luca checks run --file .luca/tmp/checks.json\` (stage the commands array there — never in shared /tmp/) with the project's typecheck (and tests, if present). On failure, loop back to \`execute\`. |
| \`verify\`      | Spawn \`verifier\` (Agent tool). On \`recommendation: fix\`, loop back to \`checks\`; on \`escalate\`, stop and surface to the user. |
| \`review\`      | Spawn \`reviewer\` (Agent tool) — one per perspective, in parallel.     |
| \`learn\`       | Spawn \`learner\` (Agent tool), injecting the run's signal digest into its prompt (see "Learner prompt injection" below); it writes \`learn.md\` and returns a \`TO_PERSIST\` block. **You persist those learnings to MuninnDB** (subagents have no MCP access). FIRST resolve the repo vault once: read \`.luca/config.json\` → \`muninn.vault\` (fallback \`"default"\`). Then for each \`TO_PERSIST\` entry, substitute the literal \`<repo-vault>\` placeholder (or any non-\`default\` placeholder the learner emitted) in its \`vault:\` with that resolved name — a literal \`<repo-vault>\`/\`repo_vault\` must NEVER reach muninn. Call \`mcp__muninn__muninn_remember_batch\` with the substituted vaults (\`default\` for \`pattern:\`/\`pitfall:\`/\`procedure:\`, the resolved repo vault for \`convention:\`/\`decision:\`), deduping against existing memories. Then, if more phases remain: run \`luca phase advance\` (bumps \`currentPhase\` and marks the finished phase complete) **before** advancing the step to \`plan\`. On the last phase, do NOT run \`luca phase advance\`; advance to \`finalize\`. |
| \`finalize\`    | Spawn the \`finalize\` agent (Agent tool): gap detection, postmortem gate, PR creation, milestone close (invokes \`Skill(skill: "milestone-complete")\` for the versioned snapshot + phase archive). On a gap/postmortem block it re-enters via \`--to-step execute\`/\`review\`; on success it resets the run with \`--to-step idle\`. |

### Satisfaction signal (outcome) — PRIMARY, always-on

This is the **primary** satisfaction signal (meta key \`source:'outcome'\`) and the one that makes \`full-auto\` runs observable: gate-ask and oversight-pause only fire when a human is in the loop, but \`source:'outcome'\` fires on every run regardless of oversight, so a fully autonomous run is **never** signal-empty. At each terminal branch of \`checks\`, \`verify\`, and \`review\`, emit one record reflecting whether the step passed:

\`\`\`
luca telemetry emit --kind signal.satisfaction --run-id <runId> --slug <currentPhaseSlug> --complexity <level> --meta '{"source":"outcome","valence":"<positive|negative|neutral>","step":"<checks|verify|review>","detail":"<pass/fail summary>"}'
\`\`\`

**Why \`--slug\`/\`--complexity\` (FORWARD-ONLY).** All three \`signal.satisfaction\` emits below stamp \`--slug <currentPhaseSlug>\` and \`--complexity <level>\` so the milestone-close outcome KPIs (\`luca telemetry kpi\`) can bucket records by complexity. This is forward-only: records emitted before this stamping carry \`slug:null\`/\`complexity:null\` and are excluded from buckets (tallied under \`unattributed\`). The KPIs are forward trends, not a backfill. Pass the run's classified \`<level>\` (Step 0/1) and the active \`<currentPhaseSlug>\`.

Valence mapping per step:

- \`checks\` — typecheck/tests PASS → \`valence:"positive"\`; FAIL (looping back to \`execute\`) → \`valence:"negative"\`.
- \`verify\` — verifier returns clean / \`recommendation\` not \`fix\`|\`escalate\` → \`positive\`; gaps found (\`fix\`, loop back to \`checks\`) or \`escalate\` → \`negative\`.
- \`review\` — all reviewers approve with no blocking findings → \`positive\`; any blocking finding → \`negative\`.

Emit exactly one \`outcome\` record per terminal branch you take (do NOT \`.parse()\` the meta — the MetaSchema is advisory only).

### Failure dumps (signal.failure-dump)

When a step fails hard, capture the failure context so it can be mined later. Emit a \`signal.failure-dump\` record at each of these branches:

- \`verify\` returns \`recommendation: escalate\` (the run stops and is surfaced to the user).
- \`checks\` fails its loop — the \`checks → execute → checks\` retry loop is exhausted without going green.
- A subagent (researcher, plan-reviewer, verifier, reviewer, learner, finalize) crashes or times out.

**Small dumps go inline** in the meta:
\`\`\`
luca telemetry emit --kind signal.failure-dump --run-id <runId> --meta '{"step":"<checks|verify|review|...>","reason":"<short failure reason>","dump":"<the failure text, inline>"}'
\`\`\`

**Large dumps** (long stderr, full subagent transcript, multi-screen check output) must NOT be inlined — write the payload to a gitignored ephemeral file under \`.luca/tmp/<kebab-name>.json\` (e.g. \`.luca/tmp/verify-escalate-dump.json\`) with the \`Write\` tool, then reference it via \`meta.dumpRef\` instead of \`meta.dump\`:
\`\`\`
luca telemetry emit --kind signal.failure-dump --run-id <runId> --meta '{"step":"<checks|verify|review|...>","reason":"<short failure reason>","dumpRef":".luca/tmp/<kebab-name>.json"}'
\`\`\`

\`.luca/tmp/\` is gitignored and repo-scoped — it is NOT a pipeline artifact and needs no contract entry. Include either \`dump\` (small) or \`dumpRef\` (large), never both. As above, do NOT \`.parse()\` the meta — the MetaSchema is advisory only.

**Meta-string safety (all emits).** The \`--meta\` value is single-quoted shell JSON, so keep every interpolated field (\`detail\`, \`reason\`, \`dump\`, \`from\`, \`to\`, etc.) single-line and quote-free — no embedded single quotes, newlines, or double-quotes that would break the JSON or the shell quoting. Push any multi-line or risky content (long stderr, transcripts, anything with quotes) to a \`.luca/tmp/<kebab-name>.json\` dump and reference it via \`meta.dumpRef\` instead of inlining it.

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

     **Satisfaction signal (meta key \`source:'gate-ask'\`).** Each answered \`ask\` item IS a satisfaction signal — the answer tells you whether the plan matched user intent. Emit one record per answer:
     \`\`\`
     luca telemetry emit --kind signal.satisfaction --run-id <runId> --slug <currentPhaseSlug> --complexity <level> --meta '{"source":"gate-ask","valence":"<positive|negative|neutral>","step":"plan-review","detail":"<decision + which alternative the user picked>"}'
     \`\`\`
     Set \`valence\` from accept-vs-redirect: the user accepting the executor's recorded/leading recommendation is \`positive\`; picking a different alternative (a redirect away from the plan) is \`negative\`; an unclear or "either is fine" answer is \`neutral\`.

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

Before spawning the \`learner\` (Agent tool) at the \`learn\` step, gather the run's signal telemetry and build a **compact signal digest** so the learner can cluster it (subagents have no telemetry/MCP access — the digest must travel in the prompt, exactly as gate resolutions travel to the executor above):

1. **Collect \`signal.*\` records** from \`.luca/telemetry/<RUN_ID>.jsonl\` (the run id established at Step 0 — the \`sessionId\`, or the \`luca telemetry new-run\` fallback if \`sessionId\` was unset — the same value you passed as \`--run-id\` on every emit). Read the file with the \`Read\` tool and keep the \`signal.satisfaction\` and \`signal.failure-dump\` records emitted this run. For large failure dumps referenced via \`meta.dumpRef\`, include the ref path, not the inlined payload.
2. **Collect the confidence journal** — the executor's recorded confidence entries (decision, category, confidence level, the gate bucket each was routed to, and any gate resolution from \`plan-review.md\`).
3. **Compact it.** One line per signal: source/kind, valence (for satisfaction), step, and a short detail. One line per confidence entry: level, category, decision. Aggregate where it helps (e.g. \`outcome: 3 positive / 1 negative across checks,verify,review\`) — keep the whole digest to a handful of lines, not a transcript.
4. **Inject** the digest into the learner's opening prompt as a \`<signal-digest>\` block (mirror the \`<confidence-gate-resolutions>\` shape above):

\`\`\`
<signal-digest>
[satisfaction:outcome] verify negative — gaps found, looped to checks
[satisfaction:gate-ask] plan-review negative — user redirected to alt B
[failure-dump] checks — retry loop exhausted (dumpRef: .luca/tmp/checks-dump.json)
[confidence] low/design-choice — picked closure over factory for cache
... (one line per signal/entry; empty block if the run produced no signals)
</signal-digest>
\`\`\`

The learner clusters the digest to surface recurring satisfaction/failure patterns alongside the artifacts it reads for \`learn.md\`.

### Oversight

Read \`oversight\` from \`luca state read\`:

- \`full-auto\` — autonomous: the only pauses are confidence-gate \`ask\` items (low-confidence + unresearchable) and CRITICAL safety. All other steps run without interruption.
- \`checkpoint\` — pause after \`plan-review\` (post-gate), \`verify\`, and \`learn\` for user confirmation; confidence-gate \`ask\` items also pause.
- \`human-in-loop\` — pause after every step; confidence-gate \`ask\` items pause within the plan-review step as well.

**Satisfaction signal (oversight-pause).** At every \`checkpoint\` / \`human-in-loop\` oversight pause, the user's response IS a satisfaction signal. After the user responds, emit one record:
\`\`\`
luca telemetry emit --kind signal.satisfaction --run-id <runId> --slug <currentPhaseSlug> --complexity <level> --meta '{"source":"oversight-pause","valence":"<positive|negative|neutral>","step":"<the step just paused after>","detail":"<what the user confirmed or redirected>"}'
\`\`\`
Set \`valence\` from accept-vs-redirect: the user confirming / approving the step is \`positive\`; asking for changes or redirecting is \`negative\`; a neutral acknowledgement is \`neutral\`. These pauses only fire in \`checkpoint\` / \`human-in-loop\`, so in \`full-auto\` the \`outcome\` path below carries the satisfaction signal instead.

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
