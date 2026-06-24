/**
 * emit-agent — compile an `AgentDefinition` (mode-agent) to its Claude
 * Code `.claude/agents/<id>.md` artifact.
 *
 * Mode-agents are the architect / plan / execute / review / etc. top-
 * level pipeline stages. They share the `.claude/agents/` directory
 * with subagents — matching the hand-written precedent in
 * `packages/luca-framework/.claude/agents/*.md`.
 *
 * Compared to subagents the frontmatter carries a few extra
 * presentation/routing fields (`stage`, `color`, `default-model-id`).
 * We do NOT set `subagent: true` here — its absence is how the parity
 * audit and the Claude Code harness tell mode-agents from Task-tool
 * subagents.
 *
 * The constraint shell (core-operating-rules + hard-constraints +
 * alwaysApply rules + memory-tier-discipline + recency-reminders)
 * mentioned in the D-1 schema comment is NOT composed here — that
 * shell becomes its own helper during D-3 when the mode-agent bodies
 * are ported from luca-mastracode. For D-2 we emit exactly what the
 * definition gives us; D-3 layers the shell on top by editing the
 * definitions themselves.
 */
import { join } from 'node:path'

import { ensureDir, type EmitResult, writeFileBytes } from './emit-util.ts'
import { renderBody } from './render-body.ts'
import {
    type FrontmatterEntry,
    renderFrontmatter,
} from './render-frontmatter.ts'

import type { AgentDefinition } from '../define/index.ts'

/**
 * Emit `<outputRoot>/.claude/agents/<id>.md` from a mode-agent
 * definition. Returns the path that was written.
 */
export async function emitAgent(
    def: AgentDefinition,
    outputRoot: string
): Promise<EmitResult> {
    const entries: FrontmatterEntry[] = [
        ['name', def.name],
        ['description', def.description],
        ['id', def.id],
        ['stage', def.stage],
    ]
    if (def.color !== undefined) {
        entries.push(['color', def.color])
    }
    if (def.defaultModelId !== undefined) {
        entries.push(['default-model-id', def.defaultModelId])
    }

    const frontmatter = renderFrontmatter(entries)
    const body = renderBody({
        instructions: def.instructions,
        guidance: def.guidance,
        gotchas: def.gotchas,
        telemetryHooks: def.telemetryHooks,
        pipelineInvocations: def.pipelineInvocations,
    })

    const dir = join(outputRoot, '.claude', 'agents')
    await ensureDir(dir)
    const path = join(dir, `${def.id}.md`)
    await writeFileBytes(path, frontmatter + '\n' + body)
    return { path, kind: 'agent' }
}
