#!/usr/bin/env bun
/**
 * Fetches every finding on a pull request, for the `/luca-pr-address`
 * skill:
 *
 *   bun fetch-findings.ts [PR number] [--repo <owner/repo>] [--only <author>]
 *                         [--owner <login>] [--save]
 *
 * - no number: the PR of the current branch.
 * - `--repo`: the PR's repo; default, the repo of the current folder.
 * - `--only`: keep only findings whose author or check name contains this.
 * - `--owner`: the reviewer-owner, whose findings are never declined or
 *   deferred; default, the GitHub user `gh` is signed in as.
 * - `--save`: write the result to `findings.json` in the PR's working
 *   folder and print only the headline (state, counts, the folder).
 *
 * It reads three channels (line and file comments, review bodies, check
 * run annotations) and prints one JSON object. It never decides whether
 * alerts exist from a check's pass or fail: a check's conclusion and its
 * annotations are separate, so it always reads the annotations.
 *
 * It only reads GitHub. The working folder is outside any repo:
 * `$LUCA_PR_ADDRESS_DIR`, or `~/.local/state/luca/pr-address`, then
 * `<owner>/<repo>/pr-<number>`. It exits 0, or 1 with the reason on stderr.
 */
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import {
    alertFindings,
    CHANGES_WANTED_LABEL,
    findingStats,
    flattenPages,
    isCiNotice,
    labelNames,
    lastSummary,
    matchesOnly,
    pendingChecks,
    prState,
    reviewBodyFindings,
    reviewCommentFindings,
    runsWithAnnotations,
} from './pr-findings'

/** One `gh` call. */
export type Gh = (call: {
    args: string[]
}) => Promise<{ ok: boolean; stdout: string; stderr: string }>

/** What the command line asked for. */
export type FetchOptions = {
    pr_number: number | null
    repo: string | null
    only: string | null
    owner: string | null
    save: boolean
}

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

/** Reads the command line; throws on a flag with no value or an unknown one. */
export const parseArgs = (argv: string[]): FetchOptions => {
    const options: FetchOptions = {
        pr_number: null,
        repo: null,
        only: null,
        owner: null,
        save: false,
    }
    const rest = [...argv]
    while (rest.length > 0) {
        const arg = rest.shift() ?? ''
        if (arg === '--save') {
            options.save = true
        } else if (arg === '--repo' || arg === '--only' || arg === '--owner') {
            const value = rest.shift()
            if (value === undefined) throw new Error(`${arg} needs a value`)
            if (arg === '--repo') options.repo = value
            if (arg === '--only') options.only = value
            if (arg === '--owner') options.owner = value
        } else if (/^\d+$/.test(arg)) {
            options.pr_number = Number(arg)
        } else {
            throw new Error(`unknown argument: ${arg}`)
        }
    }
    return options
}

/** The folder a PR's working files go in. Never inside a repo. */
export const workDir = ({
    home,
    env,
    repo,
    pr_number,
}: {
    home: string
    env: Record<string, string | undefined>
    repo: string
    pr_number: number
}): string =>
    join(
        env.LUCA_PR_ADDRESS_DIR || join(home, '.local/state/luca/pr-address'),
        ...repo.split('/'),
        `pr-${pr_number}`
    )

/** Runs `gh` and returns what it printed; throws with the reason when it fails. */
const run = async ({
    gh,
    args,
    what,
}: {
    gh: Gh
    args: string[]
    what: string
}): Promise<string> => {
    const result = await gh({ args })
    if (!result.ok) {
        throw new Error(`${what}: ${result.stderr.trim() || 'gh failed'}`)
    }
    return result.stdout.trim()
}

/** Every page of a GitHub list, as parsed JSON. */
const pages = async ({
    gh,
    path,
    what,
}: {
    gh: Gh
    path: string
    what: string
}): Promise<unknown> => {
    const printed = await run({
        gh,
        args: ['api', path, '--paginate', '--slurp'],
        what,
    })
    return JSON.parse(printed === '' ? '[]' : printed)
}

/** Fetches all three channels and returns the one object the skill reads. */
export const fetchFindings = async ({
    gh,
    options,
    now,
}: {
    gh: Gh
    options: FetchOptions
    now: Date
}) => {
    const repo =
        options.repo ??
        (await run({
            gh,
            args: [
                'repo',
                'view',
                '--json',
                'nameWithOwner',
                '--jq',
                '.nameWithOwner',
            ],
            what: 'Could not tell which repo this is',
        }))
    const pr_number =
        options.pr_number ??
        Number(
            await run({
                gh,
                args: ['pr', 'view', '--json', 'number', '--jq', '.number'],
                what: 'Could not find a PR for the current branch',
            })
        )
    const owner =
        options.owner ??
        (await run({
            gh,
            args: ['api', 'user', '--jq', '.login'],
            what: 'Could not tell who is signed in (pass --owner <login>)',
        }))

    const pull: unknown = JSON.parse(
        await run({
            gh,
            args: ['api', `repos/${repo}/pulls/${pr_number}`],
            what: `Could not read PR #${pr_number}`,
        })
    )
    if (!isObject(pull) || !isObject(pull.head) || !isObject(pull.base)) {
        throw new Error(`PR #${pr_number} came back in a shape I can't read`)
    }
    const head_sha = String(pull.head.sha)
    const base = `repos/${repo}`

    const comments = flattenPages({
        pages: await pages({
            gh,
            path: `${base}/pulls/${pr_number}/comments`,
            what: 'Could not read the review comments',
        }),
    })
    const reviews = flattenPages({
        pages: await pages({
            gh,
            path: `${base}/pulls/${pr_number}/reviews`,
            what: 'Could not read the reviews',
        }),
    })
    const issue_comments = flattenPages({
        pages: await pages({
            gh,
            path: `${base}/issues/${pr_number}/comments`,
            what: 'Could not read the PR conversation',
        }),
    })
    const runs = flattenPages({
        pages: await pages({
            gh,
            path: `${base}/commits/${head_sha}/check-runs`,
            what: 'Could not read the check runs',
        }),
        key: 'check_runs',
    })

    const summary = lastSummary(issue_comments)
    const annotated = new Set(runsWithAnnotations(runs))
    const alerts = (
        await Promise.all(
            runs
                .filter(
                    (check) =>
                        typeof check.id === 'number' && annotated.has(check.id)
                )
                .map(async (check) =>
                    alertFindings({
                        run: check,
                        answered: summary.head_sha === head_sha,
                        annotations: flattenPages({
                            pages: await pages({
                                gh,
                                path: `${base}/check-runs/${String(check.id)}/annotations`,
                                what: 'Could not read a check run’s annotations',
                            }),
                        }),
                    })
                )
        )
    ).flat()

    const everything = [
        ...reviewCommentFindings({ comments, head_sha, owner }),
        ...reviewBodyFindings({ reviews, owner, summary_at: summary.at }),
        ...alerts,
    ].filter(
        (finding) =>
            options.only === null ||
            matchesOnly({ finding, only: options.only })
    )
    const findings = everything.filter((finding) => !isCiNotice(finding))
    const ci_notices = everything.filter(isCiNotice)
    const labels = labelNames(pull)

    return {
        pr: pr_number,
        repo,
        title: String(pull.title ?? ''),
        state: prState(pull),
        head_sha,
        head_ref: String(pull.head.ref ?? ''),
        base: String(pull.base.ref ?? ''),
        fetched_at: now.toISOString(),
        owner,
        labels,
        changes_wanted: labels.includes(CHANGES_WANTED_LABEL),
        last_summary_at: summary.at === '' ? null : summary.at,
        pending_checks: pendingChecks(runs),
        findings,
        ci_notices,
        stats: findingStats({ findings, ci_notices }),
    }
}

/** Runs the real `gh`. A missing `gh` is a failed call, not a crash. */
const realGh: Gh = async ({ args }) => {
    try {
        const child = Bun.spawn(['gh', ...args], {
            stdin: 'ignore',
            stdout: 'pipe',
            stderr: 'pipe',
        })
        const [stdout, stderr, code] = await Promise.all([
            new Response(child.stdout).text(),
            new Response(child.stderr).text(),
            child.exited,
        ])
        return { ok: code === 0, stdout, stderr }
    } catch (error) {
        return {
            ok: false,
            stdout: '',
            stderr: `gh could not run: ${String(error)}`,
        }
    }
}

/** The command: fetch, then print everything, or save it and print the headline. */
export const main = async ({
    argv,
    gh,
    home,
    env,
    out,
    err,
}: {
    argv: string[]
    gh: Gh
    home: string
    env: Record<string, string | undefined>
    out: (line: string) => void
    err: (line: string) => void
}): Promise<number> => {
    try {
        const options = parseArgs(argv)
        const result = await fetchFindings({ gh, options, now: new Date() })
        if (!options.save) {
            out(JSON.stringify(result, null, 2))
            return 0
        }
        const work_dir = workDir({
            home,
            env,
            repo: result.repo,
            pr_number: result.pr,
        })
        await mkdir(work_dir, { recursive: true })
        const findings_file = join(work_dir, 'findings.json')
        await Bun.write(findings_file, `${JSON.stringify(result, null, 2)}\n`)
        out(
            JSON.stringify(
                {
                    work_dir,
                    findings_file,
                    pr: result.pr,
                    repo: result.repo,
                    state: result.state,
                    head_sha: result.head_sha,
                    owner: result.owner,
                    changes_wanted: result.changes_wanted,
                    pending_checks: result.pending_checks,
                    stats: result.stats,
                },
                null,
                2
            )
        )
        return 0
    } catch (error) {
        err(error instanceof Error ? error.message : String(error))
        return 1
    }
}

if (import.meta.main) {
    process.exit(
        await main({
            argv: process.argv.slice(2),
            gh: realGh,
            home: homedir(),
            env: process.env,
            out: (line) => console.log(line),
            err: (line) => console.error(line),
        })
    )
}
