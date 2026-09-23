import { resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { z } from 'zod'

import { makeRunId } from '../journal/journal'

/** The env var the board plugin passes the per-run token in. */
export const BOARD_TOKEN_ENV = 'LUCA_BOARD_TOKEN'

/** How to call `luca-run`, shown with every argument error. */
export const RUN_USAGE = `Usage:
  luca-run --spec <n> [--repo <path>] [--run-id <id>] [--base <branch>] [--board-plugin <id>]
  luca-run --demo [--run-id <id>] [--board-plugin <id>]

  --spec <n>            Run spec #n of the repo's GitHub issues.
  --demo                A practice run in a throwaway repo: no GitHub, no models.
  --repo <path>         The repo to run on. Defaults to the current folder.
  --run-id <id>         The run's id and folder name. Defaults to a new one.
  --base <branch>       The branch the run starts from. Defaults to main.
  --board-plugin <id>   Send the journal to this Paseo board plugin; the
                        per-run token comes from $${BOARD_TOKEN_ENV}.`

/** Letters, digits, `-` and `_`: safe as a folder name and in a branch name. */
const RunIdSchema = z
    .string()
    .regex(
        /^[A-Za-z0-9][A-Za-z0-9_-]*$/,
        'A run id is letters, digits, "-" and "_".'
    )

const runArgsSchema = ({ cwd }: { cwd: string }) =>
    z
        .object({
            spec: z.coerce.number().int().positive().optional(),
            demo: z.boolean().default(false),
            repo: z
                .string()
                .min(1)
                .default(cwd)
                .transform((path) => resolve(cwd, path)),
            run_id: RunIdSchema.default(() => makeRunId()),
            base: z.string().min(1).nullable().default(null),
            board_plugin: z.string().min(1).nullable().default(null),
            token: z.string().nullable().default(null),
        })
        .refine(({ spec, demo }) => (spec === undefined) === demo, {
            message: 'Give exactly one of --spec <n> or --demo.',
        })
        .refine(({ board_plugin, token }) => board_plugin === null || token, {
            message: `--board-plugin needs the run's token in $${BOARD_TOKEN_ENV}.`,
        })
        .transform(
            ({ spec, repo, run_id, base, board_plugin, token }): RunArgs => {
                const common = {
                    repo,
                    run_id,
                    base_branch: base,
                    board:
                        board_plugin === null || token === null
                            ? null
                            : { plugin_id: board_plugin, token },
                }
                return spec === undefined
                    ? { mode: 'demo', ...common }
                    : { mode: 'spec', spec_number: spec, ...common }
            }
        )

type RunArgsCommon = {
    /** The repo to run on, as an absolute path. */
    repo: string
    run_id: string
    /** `null` means the engine's default, `main`. */
    base_branch: string | null
    /** Where to send the journal; `null` for no board. */
    board: { plugin_id: string; token: string } | null
}

/** What `luca-run` was asked to do. */
export type RunArgs =
    | (RunArgsCommon & { mode: 'spec'; spec_number: number })
    | (RunArgsCommon & { mode: 'demo' })

/**
 * Reads `luca-run`'s command line. Never throws: bad flags come back as
 * `{ ok: false, error }` with the usage text.
 *
 * @param argv - The arguments after the script path.
 * @param cwd - What a relative `--repo` (or none) is taken from.
 * @param env - Where the board token is read from.
 *
 * @example
 * const parsed = parseRunArgs({ argv: Bun.argv.slice(2), cwd: process.cwd(), env: process.env })
 * if (parsed.ok && parsed.args.mode === 'spec') console.log(parsed.args.spec_number)
 */
export const parseRunArgs = ({
    argv,
    cwd,
    env,
}: {
    argv: readonly string[]
    cwd: string
    env: Record<string, string | undefined>
}): { ok: true; args: RunArgs } | { ok: false; error: string } => {
    let values
    try {
        values = parseArgs({
            args: [...argv],
            strict: true,
            allowPositionals: false,
            options: {
                spec: { type: 'string' },
                demo: { type: 'boolean' },
                repo: { type: 'string' },
                'run-id': { type: 'string' },
                base: { type: 'string' },
                'board-plugin': { type: 'string' },
            },
        }).values
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { ok: false, error: `${message}\n\n${RUN_USAGE}` }
    }
    const parsed = runArgsSchema({ cwd }).safeParse({
        spec: values.spec,
        demo: values.demo,
        repo: values.repo,
        run_id: values['run-id'],
        base: values.base,
        board_plugin: values['board-plugin'],
        token: env[BOARD_TOKEN_ENV],
    })
    if (!parsed.success) {
        return {
            ok: false,
            error: `${z.prettifyError(parsed.error)}\n\n${RUN_USAGE}`,
        }
    }
    return { ok: true, args: parsed.data }
}
