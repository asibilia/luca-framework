/**
 * emit-command — compile a `CommandDefinition` to its Claude Code
 * `.claude/commands/<name>.md` artifact.
 *
 * Claude Code slash-commands live in `.claude/commands/`. A command
 * file is a small markdown document with optional frontmatter and a
 * body the harness inlines into the prompt when the user types
 * `/<name>`. Body may reference `$ARGUMENTS` for user argv.
 *
 * Source-of-truth precedents:
 *   packages/luca-framework/skills/commands/*.md  (today's hand-
 *   written slash-command artifacts; frontmatter shape `name`,
 *   `description`).
 */
import { join } from 'node:path'

import { ensureDir, type EmitResult, writeFileBytes } from './emit-util.ts'
import {
    type FrontmatterEntry,
    renderFrontmatter,
} from './render-frontmatter.ts'

import type { CommandDefinition } from '../define/index.ts'

/**
 * Emit `<outputRoot>/.claude/commands/<name>.md` from a command
 * definition. Returns the path that was written.
 */
export async function emitCommand(
    def: CommandDefinition,
    outputRoot: string
): Promise<EmitResult> {
    const entries: FrontmatterEntry[] = [
        ['name', def.name],
        ['description', def.description],
    ]
    if (def.argHint !== undefined) {
        entries.push(['argument-hint', def.argHint])
    }

    const frontmatter = renderFrontmatter(entries)
    // Commands don't get a D1 prelude — they're slash-command shortcuts,
    // not autonomous agents. Body is emitted verbatim (with a trailing
    // newline normalized).
    const body = def.body.replace(/\s+$/u, '') + '\n'

    const dir = join(outputRoot, '.claude', 'commands')
    await ensureDir(dir)
    const path = join(dir, `${def.name}.md`)
    await writeFileBytes(path, frontmatter + '\n' + body)
    return { path, kind: 'command' }
}
