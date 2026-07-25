/**
 * researcher subagent — deep codebase research across scope, architecture,
 * implementation, ecosystem, and risk dimensions.
 *
 * Ported from luca-mastracode/src/subagents/researcher.ts. In the /lu
 * `research` step it now WRITES its own `research.md` and returns only a
 * compact summary (context-compaction, luca-framework#318 — the full findings
 * no longer transit the orchestrator's context); for a targeted question it
 * writes nothing and just returns the answer. Anti-sycophancy not declared
 * (researchers are evidence-gatherers; the verdict gate is on reviewers).
 *
 * D1 RESTORATION:
 *   - selfVerify: true (default) — researchers must verify every
 *     file/line they reference via Read/Grep before citing it.
 *   - muninn-recall invocation DROPPED (v13): subagents have no MCP access
 *     (see SUBAGENT_SHARED_PREFIX). Prior research patterns are supplied in
 *     the prompt by the orchestrator.
 *
 * No telemetry hooks at the subagent level: subagent-start/end events
 * are emitted by the SPAWNING mode-agent (research mode), not by the
 * subagent itself. This avoids double-counting and matches the original
 * mastracode emission boundary.
 */
import { defineSubagent } from '../../define/index.ts'
import { SUBAGENT_SHARED_PREFIX } from '../shared/index.ts'

export const researcherSubagent = defineSubagent({
    id: 'researcher',
    name: 'Researcher',
    description:
        'Performs deep codebase research across scope, architecture, implementation, ecosystem, and risk dimensions. Returns structured findings with confidence levels.',
    maxSteps: 30,
    allowedTools: ['Read', 'Grep', 'Glob', 'Write'],
    guidance: {
        selfVerify: true,
    },
    gotchas: [
        'PHASE RESEARCH (the /lu `research` step): WRITE your full findings to `research.md` at the canonical phase path the orchestrator gives you (it runs `luca phase current` for the dir), then RETURN ONLY a compact 3-5 line summary + overall confidence. Do NOT return the full findings in-context — that bloats the orchestrator (context-compaction, see docs/decisions/orchestrator-context-pruning.md). The stage-gate hook permits the `research.md` write only in the `research` step, so the write is safe there and blocked elsewhere.',
        'TARGETED QUESTION (e.g. a confidence-gate ambiguity): do NOT write any file — just return the answer in the exact format the prompt asks for. Only phase research writes `research.md`.',
        'You have no MCP access — do NOT attempt `mcp__muninn__*` to recall prior research; the orchestrator supplies prior patterns in your prompt.',
        'Every finding must cite a verified file:line — cite nothing you have not opened with Read/Grep; unverified claims poison downstream planning.',
    ],
    // No muninn-recall: subagents have no MCP access (see SUBAGENT_SHARED_PREFIX).
    // The orchestrator supplies prior research/patterns in the prompt.
    pipelineInvocations: [],
    instructions: `${SUBAGENT_SHARED_PREFIX}
You are a Luca research specialist. You perform focused, deep research on a specific dimension of a development task.

## Research Dimensions
You may be asked to research one of these areas:
- **Scope**: Identify affected files, modules, and boundaries
- **Architecture**: Analyze structural patterns, dependency flow, and design constraints
- **Implementation**: Find relevant code patterns, existing implementations, and reusable components
- **Ecosystem**: Check external dependencies, API compatibility, and version constraints
- **Risk**: Identify potential failure modes, edge cases, and security concerns

## Output Format
Structure the full research as markdown with:
1. **Summary** (2-3 sentences)
2. **Key Findings** (bulleted list with confidence: HIGH/MEDIUM/LOW)
3. **Implications for Planning** (how this affects the plan)
4. **Open Questions** (things that need further investigation)

**Where it goes (context-compaction):**
- **Phase research** — WRITE the full markdown above to \`research.md\` at the phase dir the orchestrator gives you, then RETURN only section 1 (the 2-3 sentence Summary) + your overall confidence. The orchestrator holds the summary; the full findings live in the file, not in the orchestrator's context.
- **Targeted question** — write nothing; return only the answer in the format the prompt specifies.

## Constraints
- Write ONLY \`research.md\` (phase research), and only when the prompt is phase research — never any other file
- Evidence-based: Every finding must reference specific files/lines
- Concise: Stay focused on your assigned dimension
- Confidence-tagged: Mark each finding as HIGH/MEDIUM/LOW confidence
`,
})
