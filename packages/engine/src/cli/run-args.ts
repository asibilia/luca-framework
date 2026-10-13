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
  luca-run --resume <run-id> [--repo <path>] [--board-plugin <id>]
  luca-run --unfinished

  --spec <n>            Run spec #n of the repo's GitHub issues.
  --demo                A practice run in a throwaway repo: no GitHub, no models.
  --resume <run-id>     Go on with a run that crashed or was killed, from its
                        journal: same spec, base branch, and run branch.
  --unfinished          Print the runs that are not over, as one JSON object:
                        { "runs": [{ run_id, restart, reason, message }] }.
                        The board plugin restarts the ones with restart true.
  --repo <path>         The repo to run on. Defaults to the current folder
                        (for --resume, to the repo the run started in).
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

const boardOf = ({
    board_plugin,
    token,
}: {
    board_plugin: string | null
    token: string | null
}): RunArgsCommon['board'] =>
    board_plugin === null || token === null
        ? null
        : { plugin_id: board_plugin, token }

const BOARD_TOKEN_MESSAGE = `--board-plugin needs the run's token in $${BOARD_TOKEN_ENV}.`

const resumeArgsSchema = ({ cwd }: { cwd: string }) =>
    z
        .object({
            resume: RunIdSchema,
            repo: z
                .string()
                .min(1)
                .transform((path) => resolve(cwd, path))
                .nullable()
                .default(null),
            board_plugin: z.string().min(1).nullable().default(null),
            token: z.string().nullable().default(null),
            // The journal already has these.
            spec: z.undefined('--resume takes the spec from the journal.'),
            demo: z.undefined('Give only one of --resume or --demo.'),
            run_id: z.undefined('--resume <run-id> is the run id.'),
            base: z.undefined('--resume takes the base from the journal.'),
        })
        .refine(({ board_plugin, token }) => board_plugin === null || token, {
            message: BOARD_TOKEN_MESSAGE,
        })
        .transform(
            ({ resume, repo, board_plugin, token }): RunArgs => ({
                mode: 'resume',
                run_id: resume,
                repo,
                board: boardOf({ board_plugin, token }),
            })
        )

const UNFINISHED_ALONE = '--unfinished takes no other flags.'

const unfinishedArgsSchema = z
    .object({
        unfinished: z.literal(true),
        spec: z.undefined(UNFINISHED_ALONE),
        demo: z.undefined(UNFINISHED_ALONE),
        resume: z.undefined(UNFINISHED_ALONE),
        repo: z.undefined(UNFINISHED_ALONE),
        run_id: z.undefined(UNFINISHED_ALONE),
        base: z.undefined(UNFINISHED_ALONE),
        board_plugin: z.undefined(UNFINISHED_ALONE),
    })
    .transform((): RunArgs => ({ mode: 'unfinished' }))

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
            message: BOARD_TOKEN_MESSAGE,
        })
        .transform(
            ({ spec, repo, run_id, base, board_plugin, token }): RunArgs => {
                const common = {
                    repo,
                    run_id,
                    base_branch: base,
                    board: boardOf({ board_plugin, token }),
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
    | {
          mode: 'resume'
          run_id: string
          /** `null` for the repo the run started in (or the current folder). */
          repo: string | null
          board: RunArgsCommon['board']
      }
    /** Print the unfinished runs and whether each may be restarted (#375). */
    | { mode: 'unfinished' }

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
                resume: { type: 'string' },
                unfinished: { type: 'boolean' },
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
    const schema =
        values.unfinished === true
            ? unfinishedArgsSchema
            : values.resume === undefined
              ? runArgsSchema({ cwd })
              : resumeArgsSchema({ cwd })
    const parsed = schema.safeParse({
        unfinished: values.unfinished,
        resume: values.resume,
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
