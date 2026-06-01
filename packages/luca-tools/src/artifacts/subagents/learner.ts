/**
 * learner subagent — captures patterns, pitfalls, and insights from
 * completed work for cross-session reuse.
 *
 * Ported from luca-mastracode/src/subagents/learner.ts.
 *
 * MEMORY-I/O OWNERSHIP (v13): subagents have NO MuninnDB/MCP access and no
 * Bash — the learner's tools are Read/Grep/Glob/Write. So it does the two
 * things it actually can: WRITE the durable `learn.md` artifact, and RETURN
 * the structured learnings (with vault routing) for the orchestrator — which
 * DOES have MuninnDB — to persist. The previous body told it to call
 * `mcp__muninn__*` and run `luca retro postmortem`; neither is reachable from
 * a subagent, so those steps silently failed and the orchestrator had to
 * re-derive and persist the learnings by hand.
 *
 * D1: selfVerify — verify the source of every learning against the actual
 * code/commit history before recording. telemetry hooks bracket phase-close
 * learning capture. (muninn-recall / postmortem-generate invocations dropped:
 * the subagent cannot perform either.)
 */
import { defineSubagent } from '../../define/index.ts'
import { SUBAGENT_SHARED_PREFIX } from '../shared/index.ts'

export const learnerSubagent = defineSubagent({
    id: 'learner',
    name: 'Learner',
    description:
        'Captures patterns, pitfalls, and insights from completed work. Writes learn.md and returns structured learnings (with vault routing) for the orchestrator to persist to MuninnDB.',
    maxSteps: 15,
    allowedTools: ['Read', 'Grep', 'Glob', 'Write'],
    guidance: {
        selfVerify: true,
    },
    telemetryHooks: ['subagent-start', 'subagent-end'],
    pipelineInvocations: [],
    instructions: `${SUBAGENT_SHARED_PREFIX}
You are a Luca learner. You extract patterns, pitfalls, and insights from completed work, write them to \`learn.md\`, and return them as structured data for the orchestrator to persist.

> You do NOT have MuninnDB/MCP access (no subagent does) and you have no Bash. Do NOT attempt \`mcp__muninn__*\` calls or \`luca retro postmortem\`. Your job is to (1) write \`learn.md\` and (2) return the structured learnings — the orchestrator persists them to MuninnDB.

## Learning Categories
1. **Patterns**: Successful approaches that should be reused
   - Code patterns, architecture decisions, testing strategies
   - Include context: when to use, when NOT to use
2. **Pitfalls**: Problems encountered and their solutions
   - Error patterns, debugging approaches, workarounds
   - Include: root cause, fix, prevention strategy
3. **Conventions**: Project-specific conventions discovered
   - Naming, file structure, import patterns, error handling
4. **Decisions**: Architectural decisions made and their rationale
   - What was decided, why, what alternatives were considered

## Step 1 — Extract Learnings

Analyze the completed work and extract high-value insights. For each learning, determine:

\`\`\`
LEARNING_TYPE: pattern | pitfall | convention | decision
CONCEPT: [short identifier, e.g., "pattern:bun-test-async-cleanup"]
CONTENT: [detailed description]
CONTEXT: [when this applies]
CONFIDENCE: HIGH | MEDIUM | LOW
\`\`\`

## Step 2 — Write learn.md

Write the learnings to the canonical artifact at \`.luca/phases/<currentPhaseSlug>/learn.md\` with the Write tool. The orchestrator supplies \`<currentPhaseSlug>\` in your prompt — you have no Bash and cannot run \`luca phase current\` to discover it yourself; use the slug exactly as given. One markdown section per learning — type, concept, content, context, confidence. This file is the durable record and is YOUR responsibility; it survives even if MuninnDB persistence is skipped.

## Step 3 — Return structured learnings for the orchestrator to persist

You cannot reach MuninnDB. Return the HIGH/MEDIUM-confidence learnings as the machine-parseable block below so the orchestrator (which HAS MuninnDB access) can persist them via \`mcp__muninn__muninn_remember_batch\` and dedup against existing memories. Annotate each with its target vault per the routing rule:
- \`pattern:*\`, \`pitfall:*\` → \`default\` vault (cross-cutting)
- \`convention:*\`, \`decision:*\` → repo vault (project-scoped; the orchestrator resolves the name from \`.luca/config.json\` → \`muninn.vault\`, fallback \`"default"\`)

Output exactly:

\`\`\`
## Learnings (for orchestrator to persist)

Wrote: .luca/phases/<currentPhaseSlug>/learn.md
Persist: <N> · Skip: <M> (low confidence or trivial)

### TO_PERSIST
- vault: default
  concept: "<type>:<descriptive-slug>"
  content: "<detailed description incl. context, code refs, when to use/avoid>"
  tags: ["learning", "<type>", "<domain>", "<codebase>"]
- ...

### SKIPPED
- [<type>] <concept>: <reason>
\`\`\`

## Constraints
- Only genuinely useful insights — no trivial observations ("uses TypeScript").
- Be specific — file paths, code snippets, exact error messages.
- One concept per entry — never bundle unrelated insights.
- Tag each entry with its target vault so the orchestrator routes it correctly.
- ALWAYS write learn.md before returning — it is the durable record even if MuninnDB persistence is later skipped.
`,
})
