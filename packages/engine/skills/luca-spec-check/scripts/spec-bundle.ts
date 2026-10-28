#!/usr/bin/env bun
/**
 * Prints a spec and its tickets as one plain-text bundle, for the
 * `/luca-spec-check` skill's fresh readers:
 *
 *   bun spec-bundle.ts <spec number> [--repo <owner/repo>]
 *
 * It fetches it all with `gh`, from one GitHub repo (`--repo`, else the repo
 * of the current folder, from any folder in it): the spec issue (number,
 * title, body, labels), its sub-issues in order (number, title, body), and,
 * from the repo's default branch, `.luca/config.json`'s `rule_files` and
 * whether `GLOSSARY.md` and `docs/adr/` exist. So the issues and the repo's
 * facts can't come from two different repos. It only reads. It changes
 * nothing.
 *
 * It imports nothing but Bun's and Node's own modules: it runs from
 * `~/.claude/skills/luca-spec-check/`, where no packages are installed. So it
 * reads `gh`'s JSON loosely, with small readers, not with Zod.
 * `formatSpecBundle` makes no `gh` calls, so `spec-bundle.test.ts` tests it
 * without the network.
 */
import { Buffer } from 'node:buffer'

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

// NOTE: these small readers are copies of the ones in
// `../../luca-retro/scripts/retro-summary.ts`: each skill's script must
// stand alone. Keep them in step.

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (value: unknown): string =>
    typeof value === 'string' ? value : ''

const numberOr = (value: unknown): number | null =>
    typeof value === 'number' ? value : null

const listOf = (value: unknown): unknown[] =>
    Array.isArray(value) ? value : []

const objectOf = (value: unknown): Record<string, unknown> =>
    isObject(value) ? value : {}

/** Says why, and exits. */
const fail = (why: string): never => {
    console.error(why)
    return process.exit(1)
}

/**
 * Runs `gh api` on `path`: its JSON, or `null` when GitHub says Not Found.
 * Any other failure exits with what `gh` said, so a lost connection never
 * reads as a missing file.
 */
const ghApi = (path: string): unknown => {
    const out = Bun.spawnSync(['gh', 'api', path])
    if (out.exitCode === 0) return JSON.parse(out.stdout.toString())
    const said = out.stderr.toString().trim()
    return said.includes('HTTP 404')
        ? null
        : fail(`gh api ${path} failed: ${said}`)
}

/** `ghApi`, where Not Found exits too. */
const ghFound = (path: string): unknown =>
    ghApi(path) ?? fail(`gh api ${path} failed: Not Found (HTTP 404)`)

/** An issue, from `gh api`'s JSON. */
const toIssue = (raw: unknown): BundleIssue => {
    const issue = objectOf(raw)
    return {
        number: numberOr(issue.number) ?? 0,
        title: text(issue.title),
        body: text(issue.body),
    }
}

/** An issue's label names, from `gh api`'s JSON. */
const labelsOf = (raw: unknown): string[] =>
    listOf(objectOf(raw).labels).map((label) =>
        typeof label === 'string' ? label : text(objectOf(label).name)
    )

/** A file's text, from `gh api`'s contents JSON, or `null` when it has none. */
const fileText = (raw: unknown): string | null => {
    const file = objectOf(raw)
    return file.encoding === 'base64'
        ? Buffer.from(text(file.content), 'base64').toString('utf8')
        : null
}

/** The `rule_files` in a `.luca/config.json`'s text, or none. */
const ruleFiles = (config: string | null): string[] => {
    if (config === null) return []
    try {
        return listOf(objectOf(JSON.parse(config)).rule_files).filter(
            (file): file is string => typeof file === 'string'
        )
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
    const repo = `repos/${args.repo ?? '{owner}/{repo}'}`
    const issue = `${repo}/issues/${args.number}`
    const raw = ghFound(issue)
    const subs = ghFound(`${issue}/sub_issues?per_page=100`)
    console.log(
        formatSpecBundle({
            spec: { ...toIssue(raw), labels: labelsOf(raw) },
            tickets: listOf(subs).map(toIssue),
            rule_files: ruleFiles(
                fileText(ghApi(`${repo}/contents/.luca/config.json`))
            ),
            glossary: ghApi(`${repo}/contents/GLOSSARY.md`) !== null,
            adr: ghApi(`${repo}/contents/docs/adr`) !== null,
        })
    )
}

if (import.meta.main) main()
