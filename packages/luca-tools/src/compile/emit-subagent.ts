/**
 * emit-subagent — compile a `SubagentDefinition` to its Claude Code
 * `.claude/agents/<id>.md` artifact.
 *
 * Claude Code's Task tool consumes subagents from `.claude/agents/`.
 * Mode-agents (defineAgent) and subagents (defineSubagent) share that
 * directory in the existing hand-written precedents — the distinction
 * is purely semantic (mode-agents drive top-level pipeline stages;
 * subagents are spawned by mode-agents via the Task tool).
 *
 * We add a `subagent: true` frontmatter flag so the parity audit and
 * any future tooling can tell the two apart at file-glance without
 * having to read the body. The Claude Code harness ignores unknown
 * frontmatter keys, so this is forward-safe.
 *
 * Source-of-truth precedents:
 *   packages/luca-framework/skills/agents/luca-*.md  (today's hand-
 *   written subagent artifacts; frontmatter shape `name`, `description`,
 *   `tools`, `model`).
 */
import { join } from 'node:path'

import { ensureDir, type EmitResult, writeFileBytes } from './emit-util.ts'
import { renderBody } from './render-body.ts'
import {
    type FrontmatterEntry,
    renderFrontmatter,
} from './render-frontmatter.ts'

import type { SubagentDefinition } from '../define/index.ts'

/**
 * Emit `<outputRoot>/.claude/agents/<id>.md` from a subagent
 * definition. Returns the path that was written.
 */
export async function emitSubagent(
    def: SubagentDefinition,
    outputRoot: string
): Promise<EmitResult> {
    const entries: FrontmatterEntry[] = [
        ['name', def.name],
        ['description', def.description],
        // `subagent: true` distinguishes Task-tool subagents from
        // mode-agents in the same directory. Claude Code ignores
        // unknown keys; the parity audit reads it.
        ['subagent', true],
        ['id', def.id],
        ['max-steps', def.maxSteps],
    ]
    if (def.model !== undefined) {
        entries.push(['model', def.model])
    }
    if (def.allowedTools !== undefined && def.allowedTools.length > 0) {
        // Hand-written precedents use a comma-separated string for
        // `tools:` — we stay compatible with that on the `tools` key,
        // and we ALSO emit the typed array under `allowed-tools` so
        // downstream readers can pick either. Both are pure metadata
        // surfaced to humans; the runtime tool registry is the real
        // gatekeeper.
        entries.push(['tools', def.allowedTools.join(', ')])
        entries.push(['allowed-tools', def.allowedTools])
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
    return { path, kind: 'subagent' }
}
