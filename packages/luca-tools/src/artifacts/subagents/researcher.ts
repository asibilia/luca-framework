/**
 * researcher subagent — deep codebase research across scope, architecture,
 * implementation, ecosystem, and risk dimensions.
 *
 * Ported from luca-mastracode/src/subagents/researcher.ts. Read-only
 * (no edit tools in allowedTools). Anti-sycophancy not declared
 * (researchers are evidence-gatherers; the verdict gate is on reviewers).
 *
 * D1 RESTORATION:
 *   - selfVerify: true (default) — researchers must verify every
 *     file/line they reference via Read/Grep before citing it.
 *   - muninn-recall invocation — surfaces prior research patterns from
 *     MuninnDB before the agent commits to a research direction.
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
    allowedTools: ['Read', 'Grep', 'Glob'],
    guidance: {
        selfVerify: true,
    },
    pipelineInvocations: ['muninn-recall'],
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
Structure your research as markdown with:
1. **Summary** (2-3 sentences)
2. **Key Findings** (bulleted list with confidence: HIGH/MEDIUM/LOW)
3. **Implications for Planning** (how this affects the plan)
4. **Open Questions** (things that need further investigation)

## Constraints
- Read-only: Do NOT modify any files
- Evidence-based: Every finding must reference specific files/lines
- Concise: Stay focused on your assigned dimension
- Confidence-tagged: Mark each finding as HIGH/MEDIUM/LOW confidence
`,
})
