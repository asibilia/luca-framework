#!/usr/bin/env bun
/**
 * Prints a spec and its tickets as one plain-text bundle, for the
 * `/luca-spec-check` skill's fresh readers:
 *
 *   bun spec-bundle.ts <spec number> [--repo <owner/repo>]
 *
 * It fetches, with `gh`, the spec issue (number, title, body, labels) and
 * its sub-issues in order (number, title, body). From the repo it is run
 * in, it reads `.luca/config.json`'s `rule_files` and checks whether
 * `GLOSSARY.md` and `docs/adr/` exist. It only reads. It changes nothing.
 *
 * It imports nothing but Bun's and Node's own modules: it runs from
 * `~/.claude/skills/luca-spec-check/`, where no packages are installed.
 * `formatSpecBundle` makes no `gh` calls, so `spec-bundle.test.ts` tests it
 * without the network.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export type BundleIssue = { number: number; title: string; body: string }

export type SpecBundle = {
    spec: BundleIssue & { labels: string[] }
    tickets: BundleIssue[]
    rule_files: string[]
    glossary: boolean
    adr: boolean
}

const issueText = ({
    heading,
    issue,
}: {
    heading: string
    issue: BundleIssue
}): string =>
    [`${heading} #${issue.number}: ${issue.title}`, '', issue.body.trim()].join(
        '\n'
    )

/** The bundle's text: the spec, its tickets in order, then the repo. Pure. */
export const formatSpecBundle = ({
    spec,
    tickets,
    rule_files,
    glossary,
    adr,
}: SpecBundle): string =>
    [
        issueText({ heading: '== Spec', issue: spec }),
        `Labels: ${spec.labels.length === 0 ? 'none' : spec.labels.join(', ')}`,
        '',
        tickets.length === 0
            ? 'No tickets yet.'
            : tickets
                  .map((ticket) =>
                      issueText({ heading: '== Ticket', issue: ticket })
                  )
                  .join('\n\n'),
        '',
        '== Repo',
        '',
        'Rule files:',
        ...(rule_files.length === 0
            ? ['- none']
            : rule_files.map((file) => `- ${file}`)),
        `GLOSSARY.md: ${glossary ? 'yes' : 'no'}`,
        `docs/adr/: ${adr ? 'yes' : 'no'}`,
    ].join('\n')

/** Runs `gh api` and reads its JSON, or exits with what `gh` said. */
const ghApi = (path: string): unknown => {
    const out = Bun.spawnSync(['gh', 'api', path])
    if (out.exitCode !== 0) {
        console.error(`gh api ${path} failed: ${out.stderr.toString().trim()}`)
        process.exit(1)
    }
    return JSON.parse(out.stdout.toString())
}

type LooseIssue = {
    number?: number
    title?: string
    body?: string | null
    labels?: ({ name?: string } | string)[]
}

const toIssue = (raw: LooseIssue): BundleIssue => ({
    number: raw.number ?? 0,
    title: raw.title ?? '',
    body: raw.body ?? '',
})

/** The `rule_files` of `.luca/config.json` in `repo_dir`, or none. */
const ruleFiles = (repo_dir: string): string[] => {
    try {
        const config = JSON.parse(
            readFileSync(join(repo_dir, '.luca', 'config.json'), 'utf8')
        ) as { rule_files?: unknown }
        return Array.isArray(config.rule_files)
            ? config.rule_files.filter((file) => typeof file === 'string')
            : []
    } catch {
        return []
    }
}

/** The spec number and the optional `--repo` value, or null when either is missing. Pure. */
export const parseArgs = (
    argv: string[]
): { number: number; repo: string | null } | null => {
    const repoAt = argv.indexOf('--repo')
    const repo = repoAt >= 0 ? argv[repoAt + 1] : null
    if (repo === undefined) return null
    const number = argv.find(
        (arg, index) =>
            /^\d+$/.test(arg) && (repoAt < 0 || index !== repoAt + 1)
    )
    return number === undefined ? null : { number: Number(number), repo }
}

const main = () => {
    const args = parseArgs(Bun.argv.slice(2))
    if (args === null) {
        console.error(
            'Usage: bun spec-bundle.ts <spec number> [--repo <owner/repo>]'
        )
        process.exit(1)
    }
    // `gh` fills in `{owner}/{repo}` from the repo of the current folder.
    const base = `repos/${args.repo ?? '{owner}/{repo}'}/issues/${args.number}`
    const raw = ghApi(base) as LooseIssue
    const subs = ghApi(`${base}/sub_issues?per_page=100`) as LooseIssue[]
    const repo_dir = process.cwd()
    console.log(
        formatSpecBundle({
            spec: {
                ...toIssue(raw),
                labels: (raw.labels ?? []).map((label) =>
                    typeof label === 'string' ? label : (label.name ?? '')
                ),
            },
            tickets: subs.map(toIssue),
            rule_files: ruleFiles(repo_dir),
            glossary: existsSync(join(repo_dir, 'GLOSSARY.md')),
            adr: existsSync(join(repo_dir, 'docs', 'adr')),
        })
    )
}

if (import.meta.main) main()
