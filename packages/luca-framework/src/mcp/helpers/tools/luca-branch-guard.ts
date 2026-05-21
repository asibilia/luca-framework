import { z, type ToolDescriptor } from '../../schemas.ts'

const inputSchema = z.object({
    default_branch: z
        .string()
        .min(1)
        .default('main')
        .describe(
            'Branch name that must NOT equal the current branch (typically the repository default branch).'
        ),
})

interface GuardResult {
    ok: boolean
    current: string
    default: string
    message: string
}

async function readCurrentBranch(cwd: string): Promise<string | null> {
    const proc = Bun.spawn(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd,
        stdout: 'pipe',
        stderr: 'pipe',
    })
    const code = await proc.exited
    if (code !== 0) return null
    const out = await new Response(proc.stdout).text()
    return out.trim() || null
}

/**
 * Reject calls invoked while on the repository default branch. Used by
 * executor and finalize subagents to refuse direct commits to main/master.
 * Pure read tool — no allowedPhases, callable in any pipelineStep.
 */
export const lucaBranchGuardTool: ToolDescriptor<z.infer<typeof inputSchema>> =
    {
        name: 'luca_branch_guard',
        description:
            'Assert that the current git branch is NOT the repository default branch. Returns isError when on the default branch, otherwise ok=true. Use before committing to prevent accidental main writes.',
        inputSchema,
        async handler(args, ctx) {
            const current = await readCurrentBranch(ctx.cwd)
            if (current === null) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `luca_branch_guard: could not read git branch in ${ctx.cwd} (not a git repo?)`,
                        },
                    ],
                    isError: true,
                }
            }

            const result: GuardResult = {
                ok: current !== args.default_branch,
                current,
                default: args.default_branch,
                message:
                    current === args.default_branch
                        ? `on default branch "${args.default_branch}" — refusing to proceed; switch to a feature branch first.`
                        : `current branch "${current}" differs from default "${args.default_branch}".`,
            }

            return {
                content: [
                    { type: 'text', text: JSON.stringify(result, null, 2) },
                ],
                isError: !result.ok,
            }
        },
    }
