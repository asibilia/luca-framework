import { existsSync } from 'node:fs'
import { appendFile, mkdir, readFile, rename, unlink } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'

import { ShadowScanFindingSchema } from '@alecsibilia/luca-core'

import { z, type ToolDescriptor } from '../../schemas.ts'

const inputSchema = z.object({
    finding: ShadowScanFindingSchema.describe(
        'A single finding from a luca-shadow-scanner ShadowScanReport. recommended_action drives what gets applied.'
    ),
    confirm: z
        .boolean()
        .default(false)
        .describe(
            'Must be true to actually apply the remediation. Default false so a stray call cannot delete/move files.'
        ),
})

interface PathCheck {
    ok: boolean
    abs: string
    error?: string
}

/**
 * Resolve a project-relative path and confirm it stays inside the
 * project root and outside .git/. Returns the absolute path on success.
 */
function checkPath(cwd: string, relPath: string): PathCheck {
    const root = resolve(cwd)
    const abs = resolve(root, relPath)
    const rel = relative(root, abs)
    if (rel === '' || rel.startsWith('..') || rel.startsWith(`..${sep}`)) {
        return {
            ok: false,
            abs,
            error: `path "${relPath}" escapes the project root`,
        }
    }
    if (rel === '.git' || rel.startsWith(`.git${sep}`)) {
        return {
            ok: false,
            abs,
            error: `refusing to operate inside .git/ ("${relPath}")`,
        }
    }
    return { ok: true, abs }
}

/**
 * Apply a single shadow-scan remediation: delete, move, or gitignore.
 *
 * This is the write half of the read-only luca-shadow-scanner subagent
 * — the scanner detects debris, this tool applies one finding at a
 * time. Destructive (delete/move), so confirm=true is required.
 *
 * Path safety: every path is resolved against the project root and
 * rejected if it escapes the root or touches .git/. The stage-gate
 * hook guards .luca/ writes but NOT arbitrary deletes elsewhere, so
 * this tool enforces its own boundary.
 */
export const lucaRepoCleanupApplyTool: ToolDescriptor<
    z.infer<typeof inputSchema>
> = {
    name: 'luca_repo_cleanup_apply',
    description:
        'Apply one luca-shadow-scanner finding: delete a debris file, move a misplaced file, or add a path to .gitignore. Destructive — requires confirm=true. Path-safety enforced (no traversal, no .git/).',
    inputSchema,
    async handler(args, ctx) {
        if (!args.confirm) {
            return {
                content: [
                    {
                        type: 'text',
                        text: 'luca_repo_cleanup_apply refused: confirm=true required (delete/move are destructive).',
                    },
                ],
                isError: true,
            }
        }

        const { finding } = args
        const src = checkPath(ctx.cwd, finding.file_path)
        if (!src.ok) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `luca_repo_cleanup_apply: ${src.error}`,
                    },
                ],
                isError: true,
            }
        }

        switch (finding.recommended_action) {
            case 'delete': {
                if (!existsSync(src.abs)) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `skipped: ${finding.file_path} not found (nothing to delete).`,
                            },
                        ],
                    }
                }
                await unlink(src.abs)
                return {
                    content: [
                        {
                            type: 'text',
                            text: `applied delete: removed ${finding.file_path}`,
                        },
                    ],
                }
            }

            case 'move': {
                if (!finding.target_path) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: 'luca_repo_cleanup_apply: target_path is required for a move action.',
                            },
                        ],
                        isError: true,
                    }
                }
                const dst = checkPath(ctx.cwd, finding.target_path)
                if (!dst.ok) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `luca_repo_cleanup_apply: ${dst.error}`,
                            },
                        ],
                        isError: true,
                    }
                }
                if (!existsSync(src.abs)) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `skipped: ${finding.file_path} not found (nothing to move).`,
                            },
                        ],
                    }
                }
                await mkdir(dirname(dst.abs), { recursive: true })
                await rename(src.abs, dst.abs)
                return {
                    content: [
                        {
                            type: 'text',
                            text: `applied move: ${finding.file_path} → ${finding.target_path}`,
                        },
                    ],
                }
            }

            case 'gitignore': {
                const gitignorePath = join(resolve(ctx.cwd), '.gitignore')
                const existing = existsSync(gitignorePath)
                    ? await readFile(gitignorePath, 'utf-8')
                    : ''
                const alreadyPresent = existing.split('\n').some((line) => {
                    const trimmed = line.trim()
                    return (
                        trimmed !== '' &&
                        !trimmed.startsWith('#') &&
                        trimmed === finding.file_path
                    )
                })
                if (alreadyPresent) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `skipped: ${finding.file_path} already in .gitignore.`,
                            },
                        ],
                    }
                }
                const newline =
                    existing === '' || existing.endsWith('\n') ? '' : '\n'
                await appendFile(
                    gitignorePath,
                    `${newline}${finding.file_path}\n`
                )
                return {
                    content: [
                        {
                            type: 'text',
                            text: `applied gitignore: added ${finding.file_path} to .gitignore`,
                        },
                    ],
                }
            }
        }
    },
}
