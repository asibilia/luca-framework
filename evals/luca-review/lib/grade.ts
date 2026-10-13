import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { GradeSchema, type Case, type Grade } from './case-schema'
import { filesUnder, sha256 } from './workspace'

export const GRADER_MODEL = 'claude-opus-5-5'
export const MAX_FILE_CHARS = 20_000
export const MAX_TOTAL_CHARS = 150_000

const FENCE = '`'.repeat(3)
const TEXT_FILE = /\.(?:md|txt|json|log)$/

/** Hides which setup ran, so the grader can't favor one. */
export const redact = ({ text }: { text: string }): string =>
    text.replace(/\b(?:agent|luca)-review\b/gi, 'the-skill')

export type OutputFile = { path: string; text: string }

/**
 * The text files a run wrote or changed in `ws` (not the installed skill,
 * not `tmp/`), then the Markdown files in its review root (not the
 * reviewers' raw workspaces or sessions). Long files are cut, and the
 * total is capped.
 */
export const runOutputs = ({
    ws,
    baseline,
    reviews_dir,
}: {
    ws: string
    baseline: Record<string, string>
    reviews_dir: string
}): OutputFile[] => {
    const written = filesUnder({ dir: ws, skip: ['.claude', 'tmp'] }).filter(
        (path) =>
            TEXT_FILE.test(path) &&
            baseline[path] !== sha256({ bytes: readFileSync(join(ws, path)) })
    )
    const reviews = existsSync(reviews_dir)
        ? filesUnder({
              dir: reviews_dir,
              skip: ['workspaces', 'sessions'],
          }).filter((path) => path.endsWith('.md'))
        : []
    const sources = [
        ...written.map((path) => ({ path, file: join(ws, path) })),
        ...reviews.map((path) => ({
            path: `review root/${path}`,
            file: join(reviews_dir, path),
        })),
    ]
    const files: OutputFile[] = []
    let total = 0
    for (const [index, source] of sources.entries()) {
        if (total >= MAX_TOTAL_CHARS) {
            files.push({
                path: '(more files)',
                text: `${sources.length - index} more files left out: the size cap was reached.`,
            })
            break
        }
        const full = readFileSync(source.file, 'utf8')
        const text =
            full.length > MAX_FILE_CHARS
                ? `${full.slice(0, MAX_FILE_CHARS)}\n[cut: ${full.length - MAX_FILE_CHARS} more characters]`
                : full
        files.push({ path: source.path, text })
        total += text.length
    }
    return files
}

const ANSWER_FORMAT = [
    '## Your answer',
    `Reply with one JSON object in a ${FENCE}json block, and nothing after it:`,
    '{"parts": [{"name": "<part name>", "caught": true, "evidence": "<a short quote from the run>"}], "false_blockers": [{"claim": "<the blocker>", "why_false": "<why>"}], "method": {"closing_line_ok": null, "register_exists": null, "findings_checked_before_fix": null}}',
    'Give one entry in "parts" for every part above, by its name. List every false blocker; an empty list if there are none.',
    'For "method", use null when an item does not apply. closing_line_ok applies to Level 1 tasks: true when the run shows the delegated agent ended with exactly ARTIFACT-VERIFIED and a 64-character hash, or ARTIFACT-MISSING: and a reason. register_exists and findings_checked_before_fix apply to Level 3 tasks: a findings register file exists; findings were checked against the sources before anything was changed.',
].join('\n\n')

/** The grader's prompt: the task, the answer written before any run, the run's report and files. Skill names are hidden. */
export const graderPrompt = ({
    the_case,
    report,
    files,
}: {
    the_case: Case
    report: string
    files: OutputFile[]
}): string =>
    redact({
        text: [
            'You are grading one run of an evaluation. You have no tools. Judge only from the material below, and be strict: a part counts as caught only when the run clearly says it.',
            `## The task the run was given\n\nThis is a Level ${the_case.level} task.\n\n${the_case.task}`,
            `## What a good run gets right (written before any run)\n\n${the_case.answer.parts
                .map(
                    (part) =>
                        `### ${part.name}\n\n${part.right}\n\nCount it as caught when: ${part.caught_when}`
                )
                .join('\n\n')}`,
            `## False blockers\n\nA false blocker is a finding the run presents as a confirmed blocker (something that must be fixed before the work can be used) that is not true against the material. ${the_case.answer.false_blocker_hint}`,
            `## The run's final report to the owner\n\n${report === '' ? '(none)' : report}`,
            `## Files the run wrote\n\n${
                files.length === 0
                    ? '(none)'
                    : files
                          .map((file) => `### ${file.path}\n\n${file.text}`)
                          .join('\n\n')
            }`,
            ANSWER_FORMAT,
        ].join('\n\n'),
    })

/** Reads the grader's reply: a fenced JSON block, or bare JSON. It must grade exactly the case's parts. */
export const parseGrade = ({
    text,
    the_case,
}: {
    text: string
    the_case: Case
}): Grade => {
    const block =
        new RegExp(`${FENCE}json\\s*([\\s\\S]*?)${FENCE}`).exec(text)?.[1] ??
        text
    const grade = GradeSchema.parse(JSON.parse(block))
    const graded = grade.parts.map((part) => part.name).sort()
    const wanted = the_case.answer.parts.map((part) => part.name).sort()
    if (graded.join('\n') !== wanted.join('\n')) {
        throw new Error(
            `grade parts ${graded.join(', ')} don't match the case's parts ${wanted.join(', ')}`
        )
    }
    return grade
}

/** The share of answer parts the run caught. */
export const caughtShare = ({ grade }: { grade: Grade }): number =>
    grade.parts.filter((part) => part.caught).length / grade.parts.length
