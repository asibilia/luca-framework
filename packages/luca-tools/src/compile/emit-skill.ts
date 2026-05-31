/**
 * emit-skill — compile a `SkillDefinition` to its Claude Code
 * `skills/<name>/SKILL.md` artifact.
 *
 * Skills in Claude Code are directories: `skills/<name>/SKILL.md`. The
 * harness scans those directories at session start, surfaces the
 * descriptions to the model, and inlines the body when the skill is
 * invoked (via `/<name>` or a Skill tool call).
 *
 * The skill output path uses `skills/` (no leading dot) — matching the
 * hand-written precedent at
 *   packages/luca-framework/skills/skills/<name>/SKILL.md
 *
 * That precedent has a triple `skills/skills/<name>/SKILL.md` layout
 * because the legacy build also produced `skills/agents/` and
 * `skills/commands/` siblings. We DROP that legacy nesting in the new
 * compiler output: `<outputRoot>/skills/<name>/SKILL.md`. D-4 wires
 * the supersede step so the host repo's tracked layout follows the
 * Claude Code canonical shape (one level under `skills/`).
 */
import { join } from 'node:path'

import type { SkillDefinition } from '../define/index.ts'

import {
    type FrontmatterEntry,
    renderFrontmatter,
} from './render-frontmatter.ts'
import { ensureDir, type EmitResult, writeFileBytes } from './emit-util.ts'

/**
 * Emit `<outputRoot>/skills/<name>/SKILL.md` from a skill definition.
 * Returns the path that was written.
 */
export async function emitSkill(
    def: SkillDefinition,
    outputRoot: string,
): Promise<EmitResult> {
    const entries: FrontmatterEntry[] = [
        ['name', def.name],
        ['description', def.description],
    ]
    if (def.model !== undefined) {
        entries.push(['model', def.model])
    }
    if (def.allowedTools !== undefined && def.allowedTools.length > 0) {
        // Hand-written skills use the comma-separated `tools:` key (see
        // skills/agents/*.md). We mirror that for compatibility and
        // emit the typed array under `allowed-tools` for the parity
        // audit.
        entries.push(['tools', def.allowedTools.join(', ')])
        entries.push(['allowed-tools', def.allowedTools])
    }

    const frontmatter = renderFrontmatter(entries)
    // Skills don't get a D1 prelude — guidance/telemetry/invocation
    // hooks are agent concerns, not skill concerns. Body is verbatim
    // with a trailing newline normalized.
    const body = def.body.replace(/\s+$/u, '') + '\n'

    const dir = join(outputRoot, 'skills', def.name)
    await ensureDir(dir)
    const path = join(dir, 'SKILL.md')
    await writeFileBytes(path, frontmatter + '\n' + body)
    return { path, kind: 'skill' }
}
