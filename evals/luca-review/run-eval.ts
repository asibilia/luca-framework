#!/usr/bin/env bun
/**
 * Runs eval cases, one at a time:
 *
 *   bun evals/luca-review/run-eval.ts --round r1 [--case <id>|all]
 *       [--arm A|B|C|all] [--rep 1] [--no-grade] [--dry-run] [--grade-only]
 *
 * Each run's folder is `<evals root>/<round>/<case number><setup><rep>/`
 * (see lib/workspace.ts). The run gets its case's prompt on stdin, in a
 * fresh `claude -p` with only its setup's skill. Afterwards the run is
 * checked (did it finish, did the right skill load, are there transcripts),
 * its tokens and leaks are counted from Claude Code's transcripts, a grader
 * scores what it wrote against the case's answer, and `out/row.json` is
 * saved.
 *
 * --dry-run builds the folder and prints the prompt, without running. The
 * folder stays, so dry-run in a throwaway round.
 * --grade-only grades runs that have no `out/grade.json` yet, from their
 * saved output, for example after the grader failed. A run that already has
 * a grade is skipped, so a person's corrections are never overwritten. It
 * can't be used with --dry-run.
 *
 * A run that fails in any way is printed as `ERROR <message>`, and the
 * sweep goes on to the next run. Exit code 1 when any run was invalid,
 * errored, or (unless --no-grade) was left ungraded.
 */
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { z } from 'zod'

import {
    ArmSchema,
    RowSchema,
    loadCase,
    type Arm,
    type Case,
    type Grade,
    type Row,
} from './lib/case-schema'
import {
    EVAL_MODEL,
    claudeArgs,
    parseStream,
    runClaude,
    type StreamSummary,
} from './lib/claude-run'
import { runValidity } from './lib/decide'
import {
    GRADER_MODEL,
    caughtShare,
    graderPrompt,
    parseGrade,
    runOutputs,
} from './lib/grade'
import {
    NO_RESULT_REASON,
    WALL_UNKNOWN_REASON,
    caseIds,
    hasResultEvent,
    missingGradeOnlyFile,
    runFailed,
    runLine,
    savedWallMs,
} from './lib/run-checks'
import {
    coordinatorFile,
    costUnits,
    leakedFiles,
    projectsDir,
    sumUsage,
    transcriptFiles,
} from './lib/transcripts'
import {
    CASES_DIR,
    buildWorkspace,
    evalsRoot,
    runEnv,
    runRoot,
    skillName,
    skillSource,
    taskPrompt,
} from './lib/workspace'

const RUN_TIMEOUT_MS = 90 * 60_000
const GRADE_TIMEOUT_MS = 15 * 60_000
const GRADE_BUDGET_USD = 5
const ARMS: Arm[] = ['A', 'B', 'C']

const ArgsSchema = z.object({
    round: z.string().regex(/^[a-z0-9-]+$/),
    case_id: z.string().default('all'),
    arm: z.union([ArmSchema, z.literal('all')]).default('all'),
    rep: z.coerce.number().int().min(1).default(1),
    no_grade: z.boolean().default(false),
    dry_run: z.boolean().default(false),
    grade_only: z.boolean().default(false),
})

const { values } = parseArgs({
    options: {
        round: { type: 'string' },
        case: { type: 'string' },
        arm: { type: 'string' },
        rep: { type: 'string' },
        'no-grade': { type: 'boolean' },
        'dry-run': { type: 'boolean' },
        'grade-only': { type: 'boolean' },
    },
})
const args = ArgsSchema.parse({
    round: values.round,
    case_id: values.case,
    arm: values.arm,
    rep: values.rep,
    no_grade: values['no-grade'],
    dry_run: values['dry-run'],
    grade_only: values['grade-only'],
})
if (args.dry_run && args.grade_only) {
    throw new Error(
        '--dry-run and --grade-only cannot be used together: a dry run builds a new run folder, and grading only reads an existing one'
    )
}

/** Each setup's skill name, or null when it has none yet (B before Task 13). */
const knownName = ({ arm }: { arm: Arm }): string | null => {
    const dir = skillSource({ arm })
    return dir !== null && existsSync(join(dir, 'SKILL.md'))
        ? skillName({ skill_dir: dir })
        : null
}
const NAMES: Record<Arm, string | null> = {
    A: knownName({ arm: 'A' }),
    B: knownName({ arm: 'B' }),
    C: null,
}

const writeJson = (path: string, value: unknown) =>
    Bun.write(path, `${JSON.stringify(value, null, 2)}\n`)

const gradeRun = async ({
    the_case,
    summary,
    ws,
    baseline,
    root,
    out,
    label,
}: {
    the_case: Case
    summary: StreamSummary
    ws: string
    baseline: Record<string, string>
    root: string
    out: string
    label: string
}): Promise<Grade | null> => {
    const files = runOutputs({
        ws,
        baseline,
        reviews_dir: join(root, 'reviews'),
    })
    const prompt = graderPrompt({
        the_case,
        report: summary.result_text,
        files,
    })
    await Bun.write(join(out, 'grader-prompt.md'), prompt)
    // Outside the run's root, so the grader's transcript isn't counted as the run's.
    const grade_dir = join(evalsRoot(), args.round, 'grader', label)
    await mkdir(grade_dir, { recursive: true })
    let grade: Grade
    try {
        const run = await runClaude({
            cwd: grade_dir,
            args: claudeArgs({
                model: GRADER_MODEL,
                max_budget_usd: GRADE_BUDGET_USD,
                output_format: 'json',
                tools: [],
            }),
            env: process.env,
            stdin_text: prompt,
            out_file: join(out, 'grader.json'),
            timeout_ms: GRADE_TIMEOUT_MS,
        })
        const reply = z
            .object({ result: z.string() })
            .parse(JSON.parse(run.text))
        grade = parseGrade({ text: reply.result, the_case })
    } catch (error) {
        await Bun.write(
            join(out, 'grade-error.txt'),
            `${error instanceof Error ? error.message : String(error)}\n`
        )
        return null
    }
    await writeJson(join(out, 'grade.json'), grade)
    // A grade that worked makes an earlier failure's note stale.
    await rm(join(out, 'grade-error.txt'), { force: true })
    return grade
}

/**
 * Runs, or with --grade-only grades, one case on one setup. Null when
 * nothing was run (a dry run, or a run already graded); else its row, and
 * whether its stream ended with `is_error`.
 */
const runOne = async ({
    case_id,
    arm,
}: {
    case_id: string
    arm: Arm
}): Promise<{ row: Row; is_error: boolean } | null> => {
    const root = runRoot({ round: args.round, case_id, arm, rep: args.rep })
    const label = `${case_id.split('-')[0] ?? case_id}${arm}${args.rep}`
    const ws = join(root, 'ws')
    const out = join(root, 'out')
    if (args.grade_only && existsSync(join(out, 'grade.json'))) {
        // A person may have corrected this grade by hand: never grade over it.
        console.log(`${case_id} ${arm}${args.rep}: already graded, skipped`)
        return null
    }
    const case_dir = join(CASES_DIR, case_id)
    const the_case = await loadCase({ dir: case_dir })
    let baseline: Record<string, string> = {}
    let skill_name: string | null = null
    let text = ''
    let wall_ms = 0
    let wall_known = true
    if (args.grade_only) {
        const missing = missingGradeOnlyFile({ root })
        if (missing !== null) {
            throw new Error(`run ${label} is missing ${missing} (in ${root})`)
        }
        baseline = z
            .record(z.string(), z.string())
            .parse(JSON.parse(readFileSync(join(out, 'baseline.json'), 'utf8')))
        skill_name = NAMES[arm]
        text = readFileSync(join(out, 'stream.jsonl'), 'utf8')
        const saved_wall = savedWallMs({
            row: existsSync(join(out, 'row.json'))
                ? RowSchema.parse(
                      JSON.parse(readFileSync(join(out, 'row.json'), 'utf8'))
                  )
                : null,
        })
        wall_known = saved_wall !== null
        wall_ms = saved_wall ?? 0
    } else {
        const built = await buildWorkspace({
            the_case,
            case_dir,
            root,
            skill_dir: skillSource({ arm }),
        })
        baseline = built.baseline
        skill_name = built.skill_name
        const prompt = taskPrompt({ the_case, skill_name })
        await Bun.write(join(out, 'prompt.md'), prompt)
        await writeJson(join(out, 'baseline.json'), baseline)
        if (args.dry_run) {
            console.log(`${root}\n\n${prompt}\n`)
            return null
        }
        const run = await runClaude({
            cwd: ws,
            args: claudeArgs({
                model: EVAL_MODEL,
                max_budget_usd: the_case.max_budget_usd,
                output_format: 'stream-json',
                tools: null,
            }),
            env: runEnv({ root }),
            stdin_text: prompt,
            out_file: join(out, 'stream.jsonl'),
            timeout_ms: RUN_TIMEOUT_MS,
        })
        text = run.text
        wall_ms = run.wall_ms
    }
    const summary = parseStream({ text })
    const files = transcriptFiles({ root, projects_dir: projectsDir() })
    const usage = sumUsage({ files })
    const cost_units = costUnits({ usage })
    await writeJson(join(out, 'usage.json'), {
        usage,
        cost_units,
        total_cost_usd: summary.total_cost_usd,
        is_error: summary.is_error,
        transcripts: files,
    })
    const other_names = ARMS.filter((other) => other !== arm)
        .map((other) => NAMES[other])
        .filter((name): name is string => name !== null && name !== skill_name)
    // A run with no result event was cut off (its time limit, a crash): it
    // did not finish, so it must not be scored as a real zero. A run with a
    // result event and is_error set did finish, and stays valid.
    const invalid_reason =
        runValidity({
            session_id: summary.session_id,
            skills: summary.skills,
            skill_name,
            other_names,
            cost_units,
        }) ??
        (hasResultEvent({ text }) ? null : NO_RESULT_REASON) ??
        (wall_known ? null : WALL_UNKNOWN_REASON)
    const leaks =
        the_case.marker === null || summary.session_id === null
            ? 0
            : leakedFiles({
                  files,
                  marker: the_case.marker,
                  coordinator_file: coordinatorFile({
                      ws,
                      session_id: summary.session_id,
                      projects_dir: projectsDir(),
                  }),
              }).length
    const grade =
        invalid_reason !== null || args.no_grade
            ? null
            : await gradeRun({
                  the_case,
                  summary,
                  ws,
                  baseline,
                  root,
                  out,
                  label,
              })
    const row = RowSchema.parse({
        case_id,
        arm,
        rep: args.rep,
        invalid_reason,
        caught: grade === null ? null : caughtShare({ grade }),
        false_blockers: grade === null ? null : grade.false_blockers.length,
        leaks,
        cost_units,
        wall_ms,
        claude_code_version: summary.claude_code_version,
    })
    await writeJson(join(out, 'row.json'), row)
    return { row, is_error: summary.is_error }
}

const case_ids = caseIds({ cases_dir: CASES_DIR })
const chosen =
    args.case_id === 'all'
        ? case_ids
        : case_ids.filter((name) => name === args.case_id)
if (chosen.length === 0)
    throw new Error(`no case ${args.case_id} in ${CASES_DIR}`)
const arms: Arm[] = args.arm === 'all' ? ARMS : [args.arm]

let any_failed = false
for (const case_id of chosen) {
    for (const arm of arms) {
        try {
            const ran = await runOne({ case_id, arm })
            if (ran === null) continue
            if (runFailed({ row: ran.row, grading: !args.no_grade })) {
                any_failed = true
            }
            console.log(runLine(ran))
        } catch (error) {
            any_failed = true
            console.log(
                `${case_id} ${arm}${args.rep}: ERROR ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }
}
process.exit(any_failed ? 1 : 0)
