import { join } from 'node:path'

import { z } from 'zod'

/** The three setups: Corey Gallon's skill as published (A), ours (B), no skill (C). */
export const ArmSchema = z.enum(['A', 'B', 'C'])
export type Arm = z.infer<typeof ArmSchema>

const CommitSchema = z.string().regex(/^[0-9a-f]{40}$/)

/** A file from this repo's git history, copied into the run's folder at `into`. */
export const GitFileSchema = z.object({
    commit: CommitSchema,
    path: z.string().min(1),
    into: z.string().min(1),
})

/** A commit's diff, cut down to `paths`, saved in the run's folder at `into`. */
export const GitDiffSchema = z.object({
    commit: CommitSchema,
    paths: z.array(z.string().min(1)).min(1),
    into: z.string().min(1),
})

/** A planted change: every `find` in the run's files becomes `replace`. */
export const PlantSchema = z.object({
    find: z.string().min(1),
    replace: z.string(),
})

/** One thing a good run gets right, and how the grader tells that it did. */
export const AnswerPartSchema = z.object({
    name: z.string().regex(/^[a-z0-9-]+$/),
    right: z.string().min(20),
    caught_when: z.string().min(20),
})

/**
 * One eval case, from `cases/<id>/case.json`. Every setup gets `task`; A and
 * B also get `skill_clause`, with `{skill}` swapped for the setup's skill
 * name. The answer was written before any run. `marker`, when set, sits in
 * the case's `notes/`, which reviewers must never see. `absent_commands`
 * must not be installed (case 2 needs its tool to be missing).
 */
export const CaseSchema = z.object({
    id: z.string().regex(/^[1-9]-[a-z0-9]+(?:-[a-z0-9]+)*$/),
    level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    task: z.string().min(40),
    skill_clause: z.string().includes('{skill}'),
    git_files: z.array(GitFileSchema).default([]),
    git_diff: GitDiffSchema.nullable().default(null),
    plants: z.array(PlantSchema).default([]),
    absent_commands: z.array(z.string().min(1)).default([]),
    answer: z.object({
        parts: z.array(AnswerPartSchema).min(1),
        false_blocker_hint: z.string(),
    }),
    marker: z
        .string()
        .regex(/^LR-MARKER-[A-Z0-9]{8}$/)
        .nullable(),
    max_budget_usd: z.number().positive(),
})
export type Case = z.infer<typeof CaseSchema>

/** What the grader hands back for one run. A person who corrects a grade adds `person_note`. */
export const GradeSchema = z.object({
    parts: z
        .array(
            z.object({
                name: z.string(),
                caught: z.boolean(),
                evidence: z.string().min(1),
            })
        )
        .min(1),
    false_blockers: z.array(
        z.object({ claim: z.string().min(1), why_false: z.string().min(1) })
    ),
    method: z.object({
        closing_line_ok: z.boolean().nullable(),
        register_exists: z.boolean().nullable(),
        findings_checked_before_fix: z.boolean().nullable(),
    }),
    person_note: z.string().optional(),
})
export type Grade = z.infer<typeof GradeSchema>

/** One run's numbers, saved as `out/row.json`. `caught` is the share of answer parts caught. */
export const RowSchema = z.object({
    case_id: z.string(),
    arm: ArmSchema,
    rep: z.number().int().min(1),
    invalid_reason: z.string().nullable(),
    caught: z.number().min(0).max(1).nullable(),
    false_blockers: z.number().int().min(0).nullable(),
    leaks: z.number().int().min(0),
    cost_units: z.number().min(0),
    wall_ms: z.number().min(0),
    claude_code_version: z.string(),
})
export type Row = z.infer<typeof RowSchema>

/** The trigger test's prompts, from `triggers.json`. */
export const TriggersSchema = z
    .array(
        z.object({ prompt: z.string().min(10), should_trigger: z.boolean() })
    )
    .min(6)
export type Trigger = z.infer<typeof TriggersSchema>[number]

/** One trigger prompt's outcome for one setup. */
export const TriggerResultSchema = z.object({
    prompt: z.string(),
    should_trigger: z.boolean(),
    triggered: z.boolean(),
    invalid_reason: z.string().nullable(),
})
export type TriggerResult = z.infer<typeof TriggerResultSchema>

/** Reads and checks `case.json` in a case folder. */
export const loadCase = async ({ dir }: { dir: string }): Promise<Case> =>
    CaseSchema.parse(await Bun.file(join(dir, 'case.json')).json())
