/**
 * lu-handoff skill — phase-boundary + halt handoff primitive for the /lu pipeline.
 *
 * Ported into source from the working copy at ~/.claude/skills/lu-handoff/SKILL.md
 * (the skill had been dropped from source in the D-4 cleanup; commit 433c78080
 * removed autopilot and left lu-handoff installed-only). Restored here as the
 * SHARED checkpoint/handoff primitive that the trace-insights recommendations
 * build on:
 *   - #318 (context compaction): the /lu loop invokes this at each PHASE
 *     BOUNDARY before yielding the turn, so cognitive state survives /compact.
 *   - #319 (budget guard): the loop invokes the SAME skill on a BUDGET/DURATION
 *     halt before pausing, so a long run checkpoints instead of erroring.
 * Both cases are one operation: persist the session:phase-boundary-handoff
 * memory to the repo vault, emit boundary telemetry, surface a resume prompt,
 * and yield at a clean boundary. See luca-framework#318 / #319.
 */
import { defineSkill } from '../../../define/skill.ts'

const BODY = `# Luca Phase-Boundary Handoff

When the user finishes a \`/lu\` phase and is about to \`/compact\` and then run \`/lu\` again, compaction
will compress the conversation into a summary. That summary keeps *what happened* but loses the
**cognitive layer** — why each decision was made, which alternatives were rejected, what's still
unresolved, what's risky about the next phase. That's the context the next agent most needs and is
exactly what gets lost.

Your job is to rescue that layer: write it somewhere durable that survives compaction, and shape the
\`/compact\` command so the next \`/lu\` agent is pointed straight at it.

## What this skill is NOT doing (so you don't waste effort)

- **Not fixing routing.** \`/lu\` resumes by reading \`.luca/state.json\` (\`pipelineStep\`, \`currentPhase\`,
  \`roadmap\`). The state machine already routes to the correct next phase/step on its own. You do not
  need to encode "what runs next" mechanically — read it from state to *describe* the next move, but
  trust the machine to execute it.
- **Not snapshotting mechanical repo state.** Branch, uncommitted files, test output — git and
  \`.luca/\` already hold those. Capturing them again is noise. Stay on the cognitive layer.
- **Not replacing \`/workflow-save\` or \`/session-pause\`.** Those persist run telemetry and mid-phase
  WIP. This writes a *different*, complementary memory (\`session:phase-boundary-handoff\`) aimed only
  at surviving the compaction boundary. If the user also wants full run-data persisted, suggest
  \`/workflow-save\` — don't duplicate it here.

## Workflow

### 1. Anchor in the pipeline state

Read the workflow state to ground "where we are" and "what's next":

\`\`\`bash
luca state read            # preferred; falls back to reading .luca/state.json directly
\`\`\`

From it, identify: the phase that just completed (\`currentPhase\` + its \`roadmap[].name\`), the
\`pipelineStep\`, and the next phase (\`roadmap[currentPhase+1].name\`, or recognize this was the last
phase → next is finalize/milestone). If the current phase dir has a \`plan.md\` or \`learn.md\`
(\`.luca/phases/<slug>/\`), skim it for the phase goal and the key learnings so the handoff names the
*next* phase's objective concretely, not just its slug.

Detect the situation:
- **Phase boundary** (pipelineStep at/after \`learn\`, or phase marked complete): the next move is a
  fresh phase. This is the primary case — write a forward-looking "next phase brief."
- **Mid-phase** (pipelineStep mid-flight): the next move is resuming the *same* phase at that step.
  The handoff still helps by re-injecting decisions; frame "next action" as resume-at-step-X.

### 2. Harvest the cognitive layer from this conversation

This is the real work and the part nothing else captures. From the actual session — not boilerplate —
pull:

- **Decisions made & why.** Each meaningful choice this session and the reasoning, so the next agent
  doesn't relitigate settled ground. Include rejected alternatives when the rejection was deliberate.
- **Open threads & blockers.** Unresolved questions, deferred work, known issues, things to watch for
  in the next phase. Anything that would make the next agent stumble if it didn't know.

Be honest and specific. If the session genuinely produced no notable decisions or open threads, say
so plainly rather than padding — a thin-but-true handoff beats an inflated one. Ground every line in
something that actually happened in the conversation.

### 3. Persist the durable handoff to MuninnDB

This is what survives compaction, because it lives outside the context window.

**Resolve the vault** (it must be the repo vault — \`session:*\` memories route there, and the
vault-guard hook enforces it):
1. \`.luca/config.json\` → \`muninn.vault\` (primary)
2. \`LUCA_MUNINN_VAULT\` env var (fallback)
3. \`"default"\` (last resort)

**Write the memory** under a stable concept so it's always "the latest handoff":

- Concept: \`session:phase-boundary-handoff\`
- First \`muninn_recall\` (or read) to see if one already exists. If it does, \`muninn_evolve\` it
  (update, don't accumulate duplicates). Otherwise \`muninn_remember\`.
- Content: the structured handoff below.

\`\`\`
# Luca handoff — phase <N> "<slug>" → <next>

## Where we are
<phase N "slug" — pipelineStep complete. Next: phase N+1 "next-slug", goal: …  (or: last phase → finalize)>

## Decisions this session (don't relitigate)
- <decision> — <why; rejected alternative if relevant>
- …

## Open threads & blockers (watch for these)
- <unresolved question / deferred item / known risk>
- …

## Resume prompt
<2–4 sentences for the next /lu agent: what just happened, the immediate next move, what to be careful
of going into the next phase.>
\`\`\`

### 4. Show it, then emit the /compact command

First print the handoff inline so the user can eyeball (and mentally veto) it before compacting.

Then give a ready-to-paste \`/compact\` command. The description does double duty — it steers the
summarizer *and* leaves the next agent an explicit instruction:

\`\`\`
/compact Preserve the Luca phase-boundary handoff: phase <N> "<slug>" is complete; next is phase
<N+1> "<next-slug>" (goal: <…>). Key decisions this session: <1-line digest>. Open threads:
<1-line digest>. Immediate next action after compaction: run /lu to begin the next phase — and FIRST
recall the full handoff from MuninnDB (vault "<resolved-vault>", concept "session:phase-boundary-handoff")
to restore the decisions and blockers that this summary abbreviates.
\`\`\`

Keep the inline digests short — the durable memory holds the full detail; the description just has to
get the next agent to it.

### 5. Hand back

Tell the user, concisely: the handoff is saved to MuninnDB; paste the \`/compact\` command above; once
compaction finishes, run \`/lu\` and the next agent will restore context from the handoff and continue.

## Quality bar

- **Grounded**: the "where we are / what's next" comes from real \`.luca/state.json\`; the decisions and
  blockers come from things that actually happened in this conversation. No generic filler.
- **Cognitive, not mechanical**: decisions, rationale, and open threads — not branch names or file
  lists the state machine and git already track.
- **Survives compaction**: the full handoff is in a durable MuninnDB memory, and the \`/compact\`
  description names the exact vault + concept to recall it. The summary alone is never the only copy.
- **Honest**: thin sessions get a short, true handoff — not padding.
- **Complementary**: writes the \`session:phase-boundary-handoff\` memory only; defers run-data
  persistence to \`/workflow-save\` and mid-phase WIP to \`/session-pause\`.

$ARGUMENTS
`

export const luHandoffSkill = defineSkill({
    name: 'lu-handoff',
    description:
        'Prepare a phase-boundary (or budget/duration-halt) handoff for the Luca /lu workflow right before a /compact or pause, so the next agent resumes the pipeline with full cognitive context. Persists a durable session:phase-boundary-handoff memory to the repo MuninnDB vault (decisions, rationale, open threads) and hands back a preservation-steered /compact command that points the next /lu at the saved handoff. Fire on "hand off before I compact", "prep a handoff", "compact and continue the pipeline", "phase handoff", a budget/duration halt, or any imminent /compact during a /lu run.',
    body: BODY,
})
