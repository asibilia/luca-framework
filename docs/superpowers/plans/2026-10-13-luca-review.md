# `/luca-review` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an eval that compares Corey Gallon's `agent-review` skill (setup A) with our adapted `/luca-review` (setup B) and with no skill (setup C). Then ship `/luca-review` with only the changes the eval shows do no harm.

**Architecture:**
- The eval lives at `evals/luca-review/`. It is a small Bun harness.
- For each case and setup, it builds a throwaway folder and runs a headless `claude -p` there with only that setup's skill loaded (`--setting-sources project`).
- It counts tokens from Claude Code's transcripts, checks reviewers for leaks with a marker word, has a model grade each run against an answer written down first, and applies a fixed decision rule.
- Setup B lives where it ships, at `packages/engine/skills/luca-review/`. It starts as a word-for-word copy of setup A, then gets one commit per change (D1–D6), so any change can be reverted alone.

**Tech Stack:** Bun 1.3.11, TypeScript (strict), Zod 4, `bun:test`, Claude Code 2.1.296 CLI (`claude -p`), git.

**Spec:** `docs/superpowers/specs/2026-10-13-luca-review-design.md`

## Global Constraints

**Order and stops:**
- Work in the worktree `<luca-review-checkout>`, on branch `feat/luca-review` (made from `origin/main`). Never switch branches in, or write to, the main checkout `<luca-main-checkout>`: Luca runs read their config from it, and other agents work there.
- Never push, open a pull request, or merge without the owner's yes. The owner merges, with `gh pr merge <n> --squash --admin --delete-branch`.
- Task 12 ends with a STOP: report the cost of one run to the owner, and wait for their go-ahead.
- Task 20 ends with a STOP: discuss the results with the owner before Task 21.

**Coding rules (from `docs/guides/coding-standards.md`):**
- Files are kebab-case.
- Object keys are snake_case.
- Functions are camelCase, and take one destructured object argument.
- Constants are SCREAMING_SNAKE_CASE.
- No classes, no `any`, no `as` casts, no `!` assertions.
- In `evals/`, parse with Zod (already a root dependency). Use native array methods and Bun's and Node's own modules. No Lodash, and no new dependencies: the owner's ruling, in line with where #539 is heading.
- A skill's helper script (`packages/engine/skills/*/scripts/*.ts`) imports only Bun's and Node's own modules. No Zod. It runs from `~/.claude/skills/<name>/`, where no packages are installed.

**The upstream skill (setup A):**
- Source: `https://github.com/captivus/agent-review` at commit `031841cb9e2d3403546d5e5b56cd877c51d86006` (version 1.0.0).
- License: MIT, copyright 2026 Corey Gallon. Every copy keeps his `LICENSE` file unchanged.
- Copy his files with `cp`, never by retyping.
- Nothing is copied from his blog post.

**Pinned values:**
- Claude Code: 2.1.296. Model for runs and grading: `claude-opus-5-5`.
- Eval state folder: `${LUCA_EVALS_DIR:-~/.local/state/luca/evals}`.
- Review root: `${LUCA_REVIEWS_DIR:-~/.local/state/luca/reviews}`.
- Pinned commits:
  - main when this plan was written: `8a3bc9f06a77158bea05583ddb836f87d2f240e8`
  - PR #531's merge commit: `d9946f89b26b93b026acabf277f6248881991fe3`

**Privacy:** the repo is public. No content from a private repo (such as heartgold-plus) goes into a fixture.

**Safety:**
- Eval runs (`claude -p`) run only in folders under `${LUCA_EVALS_DIR:-~/.local/state/luca/evals}` or the system temp folder: outside the repo, and outside `~/.claude`.
- Never write to `~/.local/state/luca/runs` (read copies only), never touch `~/.config/luca`, and never touch a running Luca process. Reading Claude Code's transcripts in `~/.claude/projects` is read-only.

**Decision rule:** B ships if, across the counted cases:
- it catches at least as much as A
- it has no more false blockers and no more leaks than A
- its cost units and its wall time are each ≤ 1.25 × A's

A case where C does as well as A and B is "too easy". It is not counted for catches or false blockers.

**Tests:**
- Never run a bare `bun test`. Use `timeout 900 bun test packages` and `timeout 300 bun test evals/luca-review`.
- Type check: `bunx --bun tsc --noEmit`. Lint: `bun run lint`.

**Commits:** conventional format, `type(scope): description`. Every commit message ends with:
```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

## Review Focus

These are the failure modes most likely to bite a person running the eval or the skill. Each has a test in the task that owns the code.

1. **Claude Code names transcript folders differently, or the eval folder sits behind a symlink.** Then the token count is silently zero. Expected: the run is marked invalid ("no transcripts found"), never scored as free. Tests: Task 4 (symlinked root) and Task 7 (`runValidity`).
2. **A setup's skill fails to load (bad frontmatter, wrong folder).** Then a run of A or B is really a run of C. Expected: the run is marked invalid and isn't graded. Test: Task 7 (`runValidity`).
3. **The grader answers in prose, breaks the JSON, or skips an answer part.** Expected: no crash; the run is listed as ungraded, the raw reply is kept, and `--grade-only` can grade it again. Tests: Task 6 (`parseGrade`).
4. **A cold reviewer crashes or is killed mid-run.** Expected: the canary file it planted in the owner's withheld folder is still removed. Test: Task 18.
5. **Fixture rot.** A plant's text or a git path no longer matches, and a case quietly loses its planted bug. Expected: building the case fails loudly. Tests: Task 3 (plant matches nothing) and Tasks 9–11 (every case builds, and its plants took).

## File map

```
evals/luca-review/
  README.md                         how to run the eval, what it measures, how to bisect
  upstream/agent-review/            setup A: his files at the pinned commit, unchanged
  upstream/pinned.json              commit and SHA-256 of every setup-A file
  upstream.test.ts                  fails if anyone edits setup A
  lib/case-schema.ts                Zod schemas: case, grade, row, triggers
  lib/workspace.ts                  setups, run folders, building a case's workspace
  lib/transcripts.ts                finding a run's transcripts, tokens, leaks
  lib/claude-run.ts                 claude -p arguments, running it, reading its stream
  lib/grade.ts                      what a run wrote, the grader prompt, parsing grades
  lib/decide.ts                     validity, per-case stats, decision rule, report text
  lib/*.test.ts                     one test file per lib file
  cases.test.ts                     every case is well formed and builds
  run-eval.ts                       CLI: run cases
  run-triggers.ts                   CLI: the trigger test
  report.ts                         CLI: sum up a round, write results/<round>.md
  triggers.json                     the trigger prompts
  cases/<n>-<name>/                 case.json, workspace/, notes/ (some cases)
  results/                          one Markdown report per round
packages/engine/skills/luca-review/
  SKILL.md, README.md, LICENSE, references/*.md
  scripts/cold-reviewer.ts (+ .test.ts)   D5
  skill-text.test.ts
```

Also modified:
- `bunfig.toml`: ignore the case folders when testing.
- `tsconfig.json` and `eslint.config.mjs`: leave the case folders out of the type check and lint.
- `packages/luca/pack.test.ts`, `packages/luca/README.md`, `packages/luca/scripts/copy-sources.ts` (comment): Task 21.
- `.changeset/luca-review-skill.md`: Task 21.

---

## Phase 1: the eval harness

### Task 1: Branch, setup A, and the repo plumbing

**Files:**
- Create: `evals/luca-review/upstream/agent-review/` (his `SKILL.md`, `README.md`, `LICENSE`, `references/*.md`)
- Create: `evals/luca-review/upstream/pinned.json`
- Create: `evals/luca-review/upstream.test.ts`
- Modify: `bunfig.toml`, `tsconfig.json`, `eslint.config.mjs`
- Add to git: `docs/superpowers/specs/2026-10-13-luca-review-design.md`, `docs/superpowers/plans/2026-10-13-luca-review.md`

**Interfaces:**
- Produces: the folder `evals/luca-review/upstream/agent-review/`. Tasks 3 and 13 read it.

- [ ] **Step 1: Check you are in the worktree**

```bash
cd <luca-review-checkout>
git branch --show-current
```

Expected: `feat/luca-review`. The spec and plan are already committed on it.

- [ ] **Step 2: Get his skill at the pinned commit**

```bash
rm -rf /tmp/agent-review-src
git clone https://github.com/captivus/agent-review.git /tmp/agent-review-src/repo
git -C /tmp/agent-review-src/repo checkout 031841cb9e2d3403546d5e5b56cd877c51d86006
ls /tmp/agent-review-src/repo /tmp/agent-review-src/repo/references
```

Expected:
- the first folder has `LICENSE`, `README.md`, `SKILL.md` and `references`
- `references/` has `level-1-dispatch.md`, `level-2-brief.md`, `level-3-reviewer-prompts.md` and `tool-notes.md`

- [ ] **Step 3: Write the failing test**

Create `evals/luca-review/upstream.test.ts`:

```ts
import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, test } from 'bun:test'
import { z } from 'zod'

/**
 * Setup A is Corey Gallon's agent-review skill exactly as published at the
 * pinned commit (MIT; its LICENSE travels with it). The eval measures our
 * skill against it, so nobody may edit it: this pins every file's SHA-256,
 * and that no file was added or removed.
 */

const UPSTREAM_DIR = join(import.meta.dir, 'upstream')
const SKILL_DIR = join(UPSTREAM_DIR, 'agent-review')

const PinnedSchema = z.object({
    repo: z.literal('https://github.com/captivus/agent-review'),
    commit: z.string().regex(/^[0-9a-f]{40}$/),
    files: z.record(z.string(), z.string().regex(/^[0-9a-f]{64}$/)),
})

const allFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
            ? allFiles(join(dir, entry.name))
            : [join(dir, entry.name)]
    )

const sha256 = async (path: string): Promise<string> =>
    new Bun.CryptoHasher('sha256')
        .update(await Bun.file(path).arrayBuffer())
        .digest('hex')

describe('setup A, the upstream agent-review skill', () => {
    test('every file is exactly as pinned, and none was added', async () => {
        const pinned = PinnedSchema.parse(
            await Bun.file(join(UPSTREAM_DIR, 'pinned.json')).json()
        )
        const files = allFiles(SKILL_DIR)
            .map((path) => relative(SKILL_DIR, path))
            .sort()
        expect(files).toEqual(Object.keys(pinned.files).sort())
        for (const file of files) {
            expect(await sha256(join(SKILL_DIR, file))).toBe(
                pinned.files[file]
            )
        }
    })

    test('it keeps its MIT license', async () => {
        const license = await Bun.file(join(SKILL_DIR, 'LICENSE')).text()
        expect(license).toContain('MIT License')
        expect(license).toContain('Copyright (c) 2026 Corey Gallon')
    })
})
```

- [ ] **Step 4: Run the test to see it fail**

```bash
timeout 300 bun test evals/luca-review/upstream.test.ts
```

Expected: FAIL (`ENOENT`, no `pinned.json` and no skill folder).

- [ ] **Step 5: Copy his files and pin them**

```bash
mkdir -p evals/luca-review/upstream/agent-review
cp -R /tmp/agent-review-src/repo/SKILL.md /tmp/agent-review-src/repo/README.md /tmp/agent-review-src/repo/LICENSE /tmp/agent-review-src/repo/references evals/luca-review/upstream/agent-review/
cd evals/luca-review/upstream/agent-review
{
  printf '{\n  "repo": "https://github.com/captivus/agent-review",\n  "commit": "031841cb9e2d3403546d5e5b56cd877c51d86006",\n  "files": {\n'
  find . -type f | sed 's|^\./||' | LC_ALL=C sort | while read -r f; do
    printf '    "%s": "%s",\n' "$f" "$(shasum -a 256 "$f" | cut -d' ' -f1)"
  done | sed '$ s/,$//'
  printf '  }\n}\n'
} > ../pinned.json
cd <luca-review-checkout>
cat evals/luca-review/upstream/pinned.json
```

Expected: JSON with 7 files: `LICENSE`, `README.md`, `SKILL.md`, and the four `references/…` files.

- [ ] **Step 6: Run the test to see it pass**

Run: `timeout 300 bun test evals/luca-review/upstream.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Keep the case folders out of the tests, the type check and lint**

The case folders (Tasks 9–11) hold sample code, including a `*.test.ts`, that only makes sense inside an eval run.

Add to the end of `bunfig.toml`:

```toml

[test]
# The eval's case folders hold sample code, tests included, that only runs
# inside an eval run (evals/luca-review/README.md).
pathIgnorePatterns = ["evals/luca-review/cases/**"]
```

In `tsconfig.json`, change the `exclude` list to:

```jsonc
  "exclude": [
    "dist",
    "**/dist",
    "packages/board",
    // Sample code the eval's cases put in front of agents, not ours to check.
    "evals/luca-review/cases"
  ]
```

In `eslint.config.mjs`, add `'evals/luca-review/cases/**',` to the `ignores` array, right after `'.planning/**',`.

- [ ] **Step 8: Check that everything still passes**

```bash
timeout 300 bun test evals/luca-review
bunx --bun tsc --noEmit
bun run lint
```

Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add bunfig.toml tsconfig.json eslint.config.mjs evals/luca-review/upstream evals/luca-review/upstream.test.ts
git commit -m "chore(repo): pin Corey Gallon's agent-review skill as the eval's setup A

His MIT-licensed skill, copied unchanged from commit 031841c, with its
LICENSE. A test pins every file's hash so the baseline can't drift.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: The schemas

**Files:**
- Create: `evals/luca-review/lib/case-schema.ts`
- Test: `evals/luca-review/lib/case-schema.test.ts`

**Interfaces:**
- Produces:
  - schemas: `ArmSchema`, `CaseSchema`, `GradeSchema`, `RowSchema`, `TriggersSchema`, `TriggerResultSchema`
  - types: `Arm` (`'A' | 'B' | 'C'`), `Case`, `Grade`, `Row`, `Trigger`, `TriggerResult`
  - `loadCase({ dir }): Promise<Case>`

- [ ] **Step 1: Write the failing test**

Create `evals/luca-review/lib/case-schema.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'

import { CaseSchema, GradeSchema, RowSchema } from './case-schema'

const VALID_CASE = {
    id: '3-machine-blamed',
    level: 3,
    task: 'Review diagnosis.md before we act on it, and write outcome.md.',
    skill_clause: 'Use the {skill} skill, Level 3, on diagnosis.md.',
    answer: {
        parts: [
            {
                name: 'real-cause',
                right: 'The tests fail because the port is in use.',
                caught_when: 'The outcome names the port clash as the cause.',
            },
        ],
        false_blocker_hint: '',
    },
    marker: 'LR-MARKER-3K7Q9ZT2',
    max_budget_usd: 25,
}

describe('CaseSchema', () => {
    test('a well-formed case parses, with empty defaults', () => {
        const parsed = CaseSchema.parse(VALID_CASE)
        expect(parsed.git_files).toEqual([])
        expect(parsed.git_diff).toBeNull()
        expect(parsed.plants).toEqual([])
        expect(parsed.absent_commands).toEqual([])
    })

    test('a skill clause without {skill} is refused', () => {
        expect(
            CaseSchema.safeParse({ ...VALID_CASE, skill_clause: 'Use it.' })
                .success
        ).toBe(false)
    })

    test('a marker in the wrong shape is refused', () => {
        expect(
            CaseSchema.safeParse({ ...VALID_CASE, marker: 'secret' }).success
        ).toBe(false)
    })

    test('a case with no answer parts is refused', () => {
        expect(
            CaseSchema.safeParse({
                ...VALID_CASE,
                answer: { parts: [], false_blocker_hint: '' },
            }).success
        ).toBe(false)
    })

    test('an id must be a number and a kebab-case name', () => {
        expect(
            CaseSchema.safeParse({ ...VALID_CASE, id: 'machine_blamed' })
                .success
        ).toBe(false)
    })
})

describe('GradeSchema', () => {
    test('a grade says, for each part, whether it was caught', () => {
        const grade = {
            parts: [{ name: 'real-cause', caught: true, evidence: '"port"' }],
            false_blockers: [],
            method: {
                closing_line_ok: null,
                register_exists: true,
                findings_checked_before_fix: true,
            },
        }
        expect(GradeSchema.parse(grade).person_note).toBeUndefined()
        expect(GradeSchema.safeParse({ ...grade, parts: [] }).success).toBe(
            false
        )
    })
})

describe('RowSchema', () => {
    test('caught is a share between 0 and 1', () => {
        const row = {
            case_id: '3-machine-blamed',
            arm: 'B',
            rep: 1,
            invalid_reason: null,
            caught: 0.5,
            false_blockers: 0,
            leaks: 0,
            cost_units: 1200,
            wall_ms: 60_000,
            claude_code_version: '2.1.296',
        }
        expect(RowSchema.parse(row).caught).toBe(0.5)
        expect(RowSchema.safeParse({ ...row, caught: 2 }).success).toBe(false)
    })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `timeout 300 bun test evals/luca-review/lib/case-schema.test.ts`
Expected: FAIL (`Cannot find module './case-schema'`).

- [ ] **Step 3: Write the schemas**

Create `evals/luca-review/lib/case-schema.ts`:

```ts
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
    .array(z.object({ prompt: z.string().min(10), should_trigger: z.boolean() }))
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
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `timeout 300 bun test evals/luca-review/lib/case-schema.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add evals/luca-review/lib/case-schema.ts evals/luca-review/lib/case-schema.test.ts
git commit -m "chore(repo): eval schemas for cases, grades and runs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: Run folders and workspaces

**Files:**
- Create: `evals/luca-review/lib/workspace.ts`
- Test: `evals/luca-review/lib/workspace.test.ts`

**Interfaces:**
- Consumes: `Arm` and `Case` (Task 2).
- Produces:
  - `EVAL_DIR`, `REPO_ROOT`, `CASES_DIR: string`
  - `skillSource({ arm }): string | null`
  - `skillName({ skill_dir }): string`
  - `evalsRoot(): string`
  - `runRoot({ round, case_id, arm, rep }): string`
  - `WORKSPACE_RULES: string`
  - `taskPrompt({ the_case, skill_name }): string`
  - `installSkill({ skill_dir, ws }): Promise<string | null>`
  - `filesUnder({ dir, skip? }): string[]` (sorted, relative to `dir`)
  - `sha256({ bytes }): string`
  - `workspaceHashes({ ws }): Record<string, string>`
  - `buildWorkspace({ the_case, case_dir, root, skill_dir }): Promise<{ ws: string; out: string; skill_name: string | null; baseline: Record<string, string> }>`
  - `runEnv({ root }): Record<string, string | undefined>`

- [ ] **Step 1: Write the failing test**

Create `evals/luca-review/lib/workspace.test.ts`:

```ts
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { CaseSchema } from './case-schema'
import {
    WORKSPACE_RULES,
    buildWorkspace,
    runRoot,
    skillName,
    skillSource,
    taskPrompt,
} from './workspace'

const PR_531 = 'd9946f89b26b93b026acabf277f6248881991fe3'
const MAIN_AT_PLAN = '8a3bc9f06a77158bea05583ddb836f87d2f240e8'
const STUCK_SUMMARY =
    'packages/engine/skills/luca-unstick/scripts/stuck-summary.ts'

let tmp = ''

beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'lr-ws-'))
    process.env.LUCA_EVALS_DIR = join(tmp, 'evals')
})

afterEach(async () => {
    delete process.env.LUCA_EVALS_DIR
    await rm(tmp, { recursive: true, force: true })
})

const sampleCase = (extra: Record<string, unknown>) =>
    CaseSchema.parse({
        id: '9-sample',
        level: 3,
        task: 'Review the change in hello.md and write outcome.md for the owner.',
        skill_clause: 'Use the {skill} skill, Level 3.',
        answer: {
            parts: [
                {
                    name: 'the-point',
                    right: 'The right answer, in full.',
                    caught_when: 'When the run says the right answer.',
                },
            ],
            false_blocker_hint: '',
        },
        marker: null,
        max_budget_usd: 5,
        ...extra,
    })

/** A case folder with `workspace/hello.md` and `notes/n.md`. */
const makeCaseDir = async (): Promise<string> => {
    const dir = join(tmp, 'case')
    await mkdir(join(dir, 'workspace'), { recursive: true })
    await mkdir(join(dir, 'notes'), { recursive: true })
    await Bun.write(join(dir, 'workspace', 'hello.md'), 'hello, world\n')
    await Bun.write(join(dir, 'notes', 'n.md'), 'my notes\n')
    return dir
}

/** A skill folder named fake-skill, with a reference file and a test file. */
const makeSkillDir = async (): Promise<string> => {
    const dir = join(tmp, 'skill')
    await mkdir(join(dir, 'references'), { recursive: true })
    await Bun.write(
        join(dir, 'SKILL.md'),
        '---\nname: fake-skill\ndescription: A fake skill for tests.\n---\n\nBody.\n'
    )
    await Bun.write(join(dir, 'references', 'r.md'), 'a reference\n')
    await Bun.write(join(dir, 'helper.test.ts'), 'test file\n')
    return dir
}

describe('taskPrompt', () => {
    test('adds the skill clause, named, only when there is a skill', () => {
        const the_case = sampleCase({})
        const with_skill = taskPrompt({ the_case, skill_name: 'luca-review' })
        expect(with_skill).toContain(the_case.task)
        expect(with_skill).toContain('Use the luca-review skill, Level 3.')
        expect(with_skill).toContain(WORKSPACE_RULES)
        const without = taskPrompt({ the_case, skill_name: null })
        expect(without).not.toContain('Use the')
        expect(without).toContain(WORKSPACE_RULES)
    })
})

describe('skills', () => {
    test('a skill is named by its frontmatter', async () => {
        expect(skillName({ skill_dir: await makeSkillDir() })).toBe(
            'fake-skill'
        )
    })

    test('a SKILL.md with no name is refused', async () => {
        const dir = join(tmp, 'nameless')
        await mkdir(dir, { recursive: true })
        await Bun.write(join(dir, 'SKILL.md'), '---\ndescription: x\n---\n')
        expect(() => skillName({ skill_dir: dir })).toThrow('no name')
    })

    test('A is the pinned upstream skill, B ours, C none', () => {
        expect(skillSource({ arm: 'A' })).toEndWith(
            join('evals', 'luca-review', 'upstream', 'agent-review')
        )
        expect(skillSource({ arm: 'B' })).toEndWith(
            join('packages', 'engine', 'skills', 'luca-review')
        )
        expect(skillSource({ arm: 'C' })).toBeNull()
    })
})

describe('runRoot', () => {
    test('is short: round, case number, setup, rep', () => {
        expect(
            runRoot({ round: 'r1', case_id: '3-machine-blamed', arm: 'B', rep: 2 })
        ).toBe(join(tmp, 'evals', 'r1', '3B2'))
    })
})

describe('buildWorkspace', () => {
    test('copies the workspace, the notes and the skill, but not its tests', async () => {
        const case_dir = await makeCaseDir()
        const root = join(tmp, 'evals', 'r1', '9A1')
        const built = await buildWorkspace({
            the_case: sampleCase({}),
            case_dir,
            root,
            skill_dir: await makeSkillDir(),
        })
        expect(built.skill_name).toBe('fake-skill')
        expect(readFileSync(join(built.ws, 'hello.md'), 'utf8')).toBe(
            'hello, world\n'
        )
        expect(existsSync(join(built.ws, 'notes', 'n.md'))).toBe(true)
        const skill = join(built.ws, '.claude', 'skills', 'fake-skill')
        expect(existsSync(join(skill, 'SKILL.md'))).toBe(true)
        expect(existsSync(join(skill, 'references', 'r.md'))).toBe(true)
        expect(existsSync(join(skill, 'helper.test.ts'))).toBe(false)
        for (const dir of ['out', 'tmp', 'reviews']) {
            expect(existsSync(join(root, dir))).toBe(true)
        }
        expect(Object.keys(built.baseline)).toEqual(['hello.md', 'notes/n.md'])
    })

    test('with no skill (setup C) there is no .claude folder', async () => {
        const built = await buildWorkspace({
            the_case: sampleCase({}),
            case_dir: await makeCaseDir(),
            root: join(tmp, 'evals', 'r1', '9C1'),
            skill_dir: null,
        })
        expect(built.skill_name).toBeNull()
        expect(existsSync(join(built.ws, '.claude'))).toBe(false)
    })

    test('refuses a root that exists, so no result is overwritten', async () => {
        const root = join(tmp, 'evals', 'r1', '9C1')
        await mkdir(root, { recursive: true })
        await expect(
            buildWorkspace({
                the_case: sampleCase({}),
                case_dir: await makeCaseDir(),
                root,
                skill_dir: null,
            })
        ).rejects.toThrow('already exists')
    })

    test('copies files and a diff from git history', async () => {
        const built = await buildWorkspace({
            the_case: sampleCase({
                git_files: [
                    {
                        commit: MAIN_AT_PLAN,
                        path: 'CLAUDE.md',
                        into: 'sources/CLAUDE.md',
                    },
                ],
                git_diff: {
                    commit: PR_531,
                    paths: [STUCK_SUMMARY],
                    into: 'change.diff',
                },
            }),
            case_dir: await makeCaseDir(),
            root: join(tmp, 'evals', 'r1', '9C1'),
            skill_dir: null,
        })
        expect(
            readFileSync(join(built.ws, 'sources', 'CLAUDE.md'), 'utf8')
        ).toContain('Default to using Bun')
        const diff = readFileSync(join(built.ws, 'change.diff'), 'utf8')
        expect(diff).toContain(`diff --git a/${STUCK_SUMMARY}`)
        expect(diff).toContain('+export const currentRepos')
    })

    test('applies plants, and refuses one that matches nothing', async () => {
        const built = await buildWorkspace({
            the_case: sampleCase({ plants: [{ find: 'world', replace: 'moon' }] }),
            case_dir: await makeCaseDir(),
            root: join(tmp, 'evals', 'r1', '9C1'),
            skill_dir: null,
        })
        expect(readFileSync(join(built.ws, 'hello.md'), 'utf8')).toBe(
            'hello, moon\n'
        )
        await expect(
            buildWorkspace({
                the_case: sampleCase({ plants: [{ find: 'mars', replace: 'x' }] }),
                case_dir: await makeCaseDir(),
                root: join(tmp, 'evals', 'r1', '9C2'),
                skill_dir: null,
            })
        ).rejects.toThrow('matches nothing')
    })

    test('refuses a case whose absent commands are installed', async () => {
        await expect(
            buildWorkspace({
                the_case: sampleCase({ absent_commands: ['git'] }),
                case_dir: await makeCaseDir(),
                root: join(tmp, 'evals', 'r1', '9C1'),
                skill_dir: null,
            })
        ).rejects.toThrow('git')
    })
})
```

Note: `makeCaseDir` writes to the same `case` folder each time it's called within one test. That's harmless, because the content is the same.

- [ ] **Step 2: Run it to see it fail**

Run: `timeout 300 bun test evals/luca-review/lib/workspace.test.ts`
Expected: FAIL (`Cannot find module './workspace'`).

- [ ] **Step 3: Write the code**

Create `evals/luca-review/lib/workspace.ts`:

```ts
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { cp, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import type { Arm, Case } from './case-schema'

/** `evals/luca-review/`. */
export const EVAL_DIR = join(import.meta.dir, '..')
export const REPO_ROOT = join(EVAL_DIR, '..', '..')
export const CASES_DIR = join(EVAL_DIR, 'cases')

/** Where each setup's skill comes from: A his, pinned; B ours, where it ships; C none. */
export const skillSource = ({ arm }: { arm: Arm }): string | null => {
    if (arm === 'A') return join(EVAL_DIR, 'upstream', 'agent-review')
    if (arm === 'B') {
        return join(REPO_ROOT, 'packages', 'engine', 'skills', 'luca-review')
    }
    return null
}

/** A skill's name, from its SKILL.md frontmatter. */
export const skillName = ({ skill_dir }: { skill_dir: string }): string => {
    const text = readFileSync(join(skill_dir, 'SKILL.md'), 'utf8')
    const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? ''
    const name = /^name: ([a-z0-9-]+)$/m.exec(frontmatter)?.[1]
    if (name === undefined) {
        throw new Error(`${join(skill_dir, 'SKILL.md')} has no name in its frontmatter`)
    }
    return name
}

/** The eval's state folder: `$LUCA_EVALS_DIR`, else `~/.local/state/luca/evals`. */
export const evalsRoot = (): string =>
    process.env.LUCA_EVALS_DIR ??
    join(homedir(), '.local', 'state', 'luca', 'evals')

/**
 * A run's folder, such as `<evals root>/r1/3B2`. Short on purpose: Claude
 * Code names its transcript folders after the path.
 */
export const runRoot = ({
    round,
    case_id,
    arm,
    rep,
}: {
    round: string
    case_id: string
    arm: Arm
    rep: number
}): string =>
    join(evalsRoot(), round, `${case_id.split('-')[0] ?? case_id}${arm}${rep}`)

/** Said to every setup, so all three work in the same place. */
export const WORKSPACE_RULES =
    'Work only inside this folder. Put any scratch files, extra workspaces or temporary folders inside it, for example under ./tmp. When you are done, end with a short report for the owner.'

/** The prompt a run gets: the task, the skill clause for A and B, and the workspace rules. */
export const taskPrompt = ({
    the_case,
    skill_name,
}: {
    the_case: Case
    skill_name: string | null
}): string =>
    [
        the_case.task,
        ...(skill_name === null
            ? []
            : [the_case.skill_clause.replaceAll('{skill}', skill_name)]),
        WORKSPACE_RULES,
    ].join('\n\n')

const isTestFile = (path: string): boolean => /\.test\.[cm]?[jt]sx?$/.test(path)

/** Copies a setup's skill into `ws` as a project skill, leaving its tests out. Its name, or null for C. */
export const installSkill = async ({
    skill_dir,
    ws,
}: {
    skill_dir: string | null
    ws: string
}): Promise<string | null> => {
    if (skill_dir === null) return null
    const name = skillName({ skill_dir })
    await cp(skill_dir, join(ws, '.claude', 'skills', name), {
        recursive: true,
        filter: (path) => !isTestFile(path),
    })
    return name
}

/** Every file under `dir`, sorted, as paths relative to it; top-level folders in `skip` are left out. */
export const filesUnder = ({
    dir,
    skip = [],
}: {
    dir: string
    skip?: string[]
}): string[] => {
    const walk = (folder: string, prefix: string): string[] =>
        readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
            const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`
            if (entry.isDirectory()) {
                return prefix === '' && skip.includes(entry.name)
                    ? []
                    : walk(join(folder, entry.name), path)
            }
            return entry.isFile() ? [path] : []
        })
    return walk(dir, '').sort()
}

export const sha256 = ({ bytes }: { bytes: Uint8Array | string }): string =>
    new Bun.CryptoHasher('sha256').update(bytes).digest('hex')

/** Each file under `ws`, but the installed skill, with its SHA-256: so we can tell later which files the run wrote. */
export const workspaceHashes = ({ ws }: { ws: string }): Record<string, string> =>
    Object.fromEntries(
        filesUnder({ dir: ws, skip: ['.claude'] }).map((path): [string, string] => [
            path,
            sha256({ bytes: readFileSync(join(ws, path)) }),
        ])
    )

const git = ({ args }: { args: string[] }): string => {
    const out = Bun.spawnSync(['git', '-C', REPO_ROOT, ...args])
    if (out.exitCode !== 0) {
        throw new Error(`git ${args.join(' ')} failed: ${out.stderr.toString()}`)
    }
    return out.stdout.toString()
}

const writeFile = async ({ path, text }: { path: string; text: string }) => {
    await mkdir(dirname(path), { recursive: true })
    await Bun.write(path, text)
}

/**
 * Builds a run's folder at `root`:
 * - `ws/` holds the case's `workspace/`, its git files and diff, the planted changes, its `notes/`, and the setup's skill.
 * - `out/`, `tmp/` and `reviews/` start empty.
 *
 * It refuses a root that exists, so no result is ever overwritten. It also refuses a case whose `absent_commands` are installed, or whose plants match nothing.
 */
export const buildWorkspace = async ({
    the_case,
    case_dir,
    root,
    skill_dir,
}: {
    the_case: Case
    case_dir: string
    root: string
    skill_dir: string | null
}): Promise<{
    ws: string
    out: string
    skill_name: string | null
    baseline: Record<string, string>
}> => {
    if (existsSync(root)) {
        throw new Error(`${root} already exists: use a new round or rep`)
    }
    const present = the_case.absent_commands.filter(
        (command) => Bun.which(command) !== null
    )
    if (present.length > 0) {
        throw new Error(
            `case ${the_case.id} needs these commands not installed: ${present.join(', ')}`
        )
    }
    const ws = join(root, 'ws')
    const out = join(root, 'out')
    for (const dir of [ws, out, join(root, 'tmp'), join(root, 'reviews')]) {
        await mkdir(dir, { recursive: true })
    }
    await cp(join(case_dir, 'workspace'), ws, { recursive: true })
    for (const file of the_case.git_files) {
        await writeFile({
            path: join(ws, file.into),
            text: git({ args: ['show', `${file.commit}:${file.path}`] }),
        })
    }
    const diff = the_case.git_diff
    if (diff !== null) {
        await writeFile({
            path: join(ws, diff.into),
            text: git({ args: ['show', '--format=', diff.commit, '--', ...diff.paths] }),
        })
    }
    for (const plant of the_case.plants) {
        const hits = filesUnder({ dir: ws }).filter((path) =>
            readFileSync(join(ws, path), 'utf8').includes(plant.find)
        )
        if (hits.length === 0) {
            throw new Error(
                `case ${the_case.id}: the plant "${plant.find}" matches nothing`
            )
        }
        for (const path of hits) {
            await Bun.write(
                join(ws, path),
                readFileSync(join(ws, path), 'utf8').replaceAll(
                    plant.find,
                    plant.replace
                )
            )
        }
    }
    if (existsSync(join(case_dir, 'notes'))) {
        await cp(join(case_dir, 'notes'), join(ws, 'notes'), { recursive: true })
    }
    const skill_name = await installSkill({ skill_dir, ws })
    return { ws, out, skill_name, baseline: workspaceHashes({ ws }) }
}

/** The run's environment: its own temp folder and its own review root. */
export const runEnv = ({ root }: { root: string }): Record<string, string | undefined> => ({
    ...process.env,
    TMPDIR: join(root, 'tmp'),
    LUCA_REVIEWS_DIR: join(root, 'reviews'),
})
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `timeout 300 bun test evals/luca-review/lib/workspace.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Type check, lint, commit**

```bash
bunx --bun tsc --noEmit && bun run lint
git add evals/luca-review/lib/workspace.ts evals/luca-review/lib/workspace.test.ts
git commit -m "chore(repo): eval run folders and case workspaces

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: Transcripts, tokens and leaks

**Files:**
- Create: `evals/luca-review/lib/transcripts.ts`
- Test: `evals/luca-review/lib/transcripts.test.ts`

**Interfaces:**
- Produces:
  - `projectsDir(): string`
  - `projectSlug({ path }): string`
  - `transcriptFiles({ root, projects_dir }): string[]`
  - type `Usage` (`input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`) and `ZERO_USAGE`
  - `sumUsage({ files }): Usage`
  - `costUnits({ usage }): number`
  - `coordinatorFile({ ws, session_id, projects_dir }): string`
  - `leakedFiles({ files, marker, coordinator_file }): string[]`

**What the code relies on (checked while writing this plan):**
- Claude Code keeps each session's transcript in `~/.claude/projects/<slug>/<session id>.jsonl`. The slug is the session folder's real path with every character except letters and digits turned into `-`.
- A subagent's transcript is in `<slug>/<session id>/subagents/agent-<id>.jsonl`.
- Each model message's lines carry `message.id` and `message.usage`. The same message is written on several lines.

- [ ] **Step 1: Write the failing test**

Create `evals/luca-review/lib/transcripts.test.ts`:

```ts
import { mkdtempSync, realpathSync, symlinkSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
    coordinatorFile,
    costUnits,
    leakedFiles,
    projectSlug,
    sumUsage,
    transcriptFiles,
} from './transcripts'

let tmp = ''
let root = ''
let projects = ''

beforeEach(async () => {
    tmp = realpathSync(mkdtempSync(join(tmpdir(), 'lr-tr-')))
    root = join(tmp, 'evals', 'r1', '3B1')
    projects = join(tmp, 'projects')
    await mkdir(join(root, 'ws'), { recursive: true })
    await mkdir(projects, { recursive: true })
})

afterEach(async () => {
    await rm(tmp, { recursive: true, force: true })
})

const line = (id: string, usage: Record<string, number>, extra = '') =>
    JSON.stringify({ type: 'assistant', message: { id, usage }, note: extra })

const writeTranscript = async (folder: string, name: string, lines: string[]) => {
    await mkdir(join(projects, folder), { recursive: true })
    const path = join(projects, folder, name)
    await Bun.write(path, `${lines.join('\n')}\n`)
    return path
}

describe('projectSlug', () => {
    test('turns every character but letters and digits into -', () => {
        expect(
            projectSlug({ path: '/Users/a/.local/state/luca/evals/r1/3B1' })
        ).toBe('-Users-a--local-state-luca-evals-r1-3B1')
    })
})

describe('transcriptFiles', () => {
    test("finds the run's sessions and their subagents, and nothing else", async () => {
        const slug = projectSlug({ path: root })
        const main = await writeTranscript(`${slug}-ws`, 's1.jsonl', ['{}'])
        const sub = await writeTranscript(
            `${slug}-ws/s1/subagents`,
            'agent-x.jsonl',
            ['{}']
        )
        const child = await writeTranscript(
            `${slug}-reviews-workspaces-s2-r1-maintainer`,
            's2.jsonl',
            ['{}']
        )
        await writeTranscript(`${slug}0-ws`, 'other.jsonl', ['{}'])
        await writeTranscript(`${slug}-ws/memory`, 'm.jsonl', ['{}'])
        expect(
            [...transcriptFiles({ root, projects_dir: projects })].sort()
        ).toEqual([main, sub, child].sort())
    })

    test('follows a symlinked root to its real path', async () => {
        const slug = projectSlug({ path: root })
        const main = await writeTranscript(`${slug}-ws`, 's1.jsonl', ['{}'])
        const link = join(tmp, 'link')
        symlinkSync(root, link)
        expect(transcriptFiles({ root: link, projects_dir: projects })).toEqual([
            main,
        ])
    })

    test('is empty when the projects folder is missing', () => {
        expect(
            transcriptFiles({ root, projects_dir: join(tmp, 'none') })
        ).toEqual([])
    })
})

describe('sumUsage', () => {
    test('counts each model message once, across files, and skips bad lines', async () => {
        const usage = {
            input_tokens: 10,
            output_tokens: 2,
            cache_creation_input_tokens: 100,
            cache_read_input_tokens: 1000,
        }
        const a = await writeTranscript('p', 'a.jsonl', [
            line('msg_1', usage),
            line('msg_1', usage, 'same message, second block'),
            'not json',
            JSON.stringify({ type: 'user', message: { content: 'hi' } }),
        ])
        const b = await writeTranscript('p', 'b.jsonl', [line('msg_2', usage)])
        expect(sumUsage({ files: [a, b] })).toEqual({
            input_tokens: 20,
            output_tokens: 4,
            cache_creation_input_tokens: 200,
            cache_read_input_tokens: 2000,
        })
    })
})

describe('costUnits', () => {
    test('weighs tokens by price, in input-token units', () => {
        expect(
            costUnits({
                usage: {
                    input_tokens: 100,
                    output_tokens: 100,
                    cache_creation_input_tokens: 100,
                    cache_read_input_tokens: 100,
                },
            })
        ).toBe(735)
    })
})

describe('leaks', () => {
    test("finds the marker in any transcript but the coordinator's own", async () => {
        const slug = projectSlug({ path: join(root, 'ws') })
        const coordinator = await writeTranscript(slug, 'main.jsonl', [
            '{"text":"LR-MARKER-ABCDEFGH"}',
        ])
        const reviewer = await writeTranscript(slug, 'main/subagents/r.jsonl', [
            '{"text":"I read LR-MARKER-ABCDEFGH"}',
        ])
        const clean = await writeTranscript(slug, 'main/subagents/c.jsonl', [
            '{"text":"nothing"}',
        ])
        const coordinator_file = coordinatorFile({
            ws: join(root, 'ws'),
            session_id: 'main',
            projects_dir: projects,
        })
        expect(coordinator_file).toBe(coordinator)
        expect(
            leakedFiles({
                files: [coordinator, reviewer, clean],
                marker: 'LR-MARKER-ABCDEFGH',
                coordinator_file,
            })
        ).toEqual([reviewer])
    })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `timeout 300 bun test evals/luca-review/lib/transcripts.test.ts`
Expected: FAIL (`Cannot find module './transcripts'`).

- [ ] **Step 3: Write the code**

Create `evals/luca-review/lib/transcripts.ts`:

```ts
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { z } from 'zod'

/** Claude Code's transcripts: `$CLAUDE_PROJECTS_DIR`, else `~/.claude/projects`. */
export const projectsDir = (): string =>
    process.env.CLAUDE_PROJECTS_DIR ?? join(homedir(), '.claude', 'projects')

/** Claude Code's folder name for a path: every character but letters and digits becomes `-`. */
export const projectSlug = ({ path }: { path: string }): string =>
    path.replace(/[^A-Za-z0-9]/g, '-')

const jsonlUnder = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) {
            return entry.name === 'memory' ? [] : jsonlUnder(path)
        }
        return entry.name.endsWith('.jsonl') ? [path] : []
    })

/**
 * Every transcript of every session that ran in `root` or below it: the
 * coordinator, its subagents, and any `claude -p` it started there. Matched
 * on the root's real path, since Claude Code names folders after it.
 */
export const transcriptFiles = ({
    root,
    projects_dir,
}: {
    root: string
    projects_dir: string
}): string[] => {
    if (!existsSync(projects_dir)) return []
    const slug = projectSlug({ path: realpathSync(root) })
    const folders = readdirSync(projects_dir).filter(
        (name) => name === slug || name.startsWith(`${slug}-`)
    )
    return folders.flatMap((name) => jsonlUnder(join(projects_dir, name)))
}

const UsageSchema = z.object({
    input_tokens: z.number().default(0),
    output_tokens: z.number().default(0),
    cache_creation_input_tokens: z.number().default(0),
    cache_read_input_tokens: z.number().default(0),
})
export type Usage = z.infer<typeof UsageSchema>

export const ZERO_USAGE: Usage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
}

const UsageLineSchema = z.object({
    message: z.object({ id: z.string(), usage: UsageSchema }),
})

const parseLine = (line: string): unknown => {
    try {
        return JSON.parse(line)
    } catch {
        return null
    }
}

/**
 * Token use across transcripts. Claude Code writes a model message on
 * several lines, each with the whole message's usage, so each message id
 * counts once.
 */
export const sumUsage = ({ files }: { files: string[] }): Usage => {
    const by_id = new Map<string, Usage>()
    for (const file of files) {
        for (const text of readFileSync(file, 'utf8').split('\n')) {
            if (!text.includes('"usage"')) continue
            const parsed = UsageLineSchema.safeParse(parseLine(text))
            if (parsed.success) {
                by_id.set(parsed.data.message.id, parsed.data.message.usage)
            }
        }
    }
    return [...by_id.values()].reduce(
        (sum, usage) => ({
            input_tokens: sum.input_tokens + usage.input_tokens,
            output_tokens: sum.output_tokens + usage.output_tokens,
            cache_creation_input_tokens:
                sum.cache_creation_input_tokens + usage.cache_creation_input_tokens,
            cache_read_input_tokens:
                sum.cache_read_input_tokens + usage.cache_read_input_tokens,
        }),
        ZERO_USAGE
    )
}

/**
 * One number to compare cost by, in input-token units. For the same model,
 * Anthropic prices a cache write at 1.25×, a cache read at 0.1×, and output
 * at 5× an input token.
 */
export const costUnits = ({ usage }: { usage: Usage }): number =>
    Math.round(
        usage.input_tokens +
            1.25 * usage.cache_creation_input_tokens +
            0.1 * usage.cache_read_input_tokens +
            5 * usage.output_tokens
    )

/** The coordinator's own transcript: it may read the withheld notes. */
export const coordinatorFile = ({
    ws,
    session_id,
    projects_dir,
}: {
    ws: string
    session_id: string
    projects_dir: string
}): string =>
    join(projects_dir, projectSlug({ path: realpathSync(ws) }), `${session_id}.jsonl`)

/** The transcripts, other than the coordinator's, that contain `marker`: a reviewer that saw withheld notes. */
export const leakedFiles = ({
    files,
    marker,
    coordinator_file,
}: {
    files: string[]
    marker: string
    coordinator_file: string
}): string[] =>
    files.filter(
        (file) =>
            file !== coordinator_file &&
            readFileSync(file, 'utf8').includes(marker)
    )
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `timeout 300 bun test evals/luca-review/lib/transcripts.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Type check, lint, commit**

```bash
bunx --bun tsc --noEmit && bun run lint
git add evals/luca-review/lib/transcripts.ts evals/luca-review/lib/transcripts.test.ts
git commit -m "chore(repo): eval token counts and leak checks from transcripts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: Running `claude -p`

**Files:**
- Create: `evals/luca-review/lib/claude-run.ts`
- Test: `evals/luca-review/lib/claude-run.test.ts`

**Interfaces:**
- Produces:
  - `EVAL_MODEL = 'claude-opus-5-5'`
  - `claudeArgs({ model, max_budget_usd, output_format, tools }): string[]`. `output_format` is `'stream-json' | 'json'`. `tools` is `string[] | null`.
  - type `StreamSummary` (`session_id: string | null`, `claude_code_version`, `skills`, `skill_calls`, `result_text`, `is_error`, `total_cost_usd`)
  - `parseStream({ text }): StreamSummary`
  - `runClaude({ cwd, args, env, stdin_text, out_file, timeout_ms, command? }): Promise<{ text: string; exit_code: number; wall_ms: number }>`

**What the code relies on (checked with Claude Code 2.1.296 while writing this plan):**
- `claude -p` reads its prompt from stdin.
- `--setting-sources project` loads only built-in skills plus the run folder's `.claude/skills/`.
- `--tools ""` gives no tools, and `--tools Skill` gives only the Skill tool.
- In `--output-format stream-json --verbose`:
  - the `system`/`init` event has `session_id`, `claude_code_version` and `skills`
  - the last line is the `result` event, with `result`, `is_error` and `total_cost_usd`
  - a skill call is an assistant `tool_use` named `Skill`, with `input.skill`

- [ ] **Step 1: Write the failing test**

Create `evals/luca-review/lib/claude-run.test.ts`:

```ts
import { chmodSync, mkdtempSync, readFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { claudeArgs, parseStream, runClaude } from './claude-run'

let tmp = ''

beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'lr-cr-'))
})

afterEach(async () => {
    await rm(tmp, { recursive: true, force: true })
})

describe('claudeArgs', () => {
    test('a coordinator run streams, with default tools', () => {
        expect(
            claudeArgs({
                model: 'claude-opus-5-5',
                max_budget_usd: 25,
                output_format: 'stream-json',
                tools: null,
            })
        ).toEqual([
            '-p',
            '--model',
            'claude-opus-5-5',
            '--setting-sources',
            'project',
            '--permission-mode',
            'bypassPermissions',
            '--output-format',
            'stream-json',
            '--verbose',
            '--max-budget-usd',
            '25',
        ])
    })

    test('the grader has no tools; a trigger run has only Skill', () => {
        expect(
            claudeArgs({
                model: 'm',
                max_budget_usd: 5,
                output_format: 'json',
                tools: [],
            }).slice(-4)
        ).toEqual(['--max-budget-usd', '5', '--tools', ''])
        expect(
            claudeArgs({
                model: 'm',
                max_budget_usd: 2,
                output_format: 'stream-json',
                tools: ['Skill'],
            }).slice(-2)
        ).toEqual(['--tools', 'Skill'])
    })
})

const STREAM = [
    JSON.stringify({ type: 'system', subtype: 'session_state_changed' }),
    JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: 'sess-1',
        claude_code_version: '2.1.296',
        skills: ['luca-review', 'debug'],
    }),
    'not json',
    JSON.stringify({
        type: 'assistant',
        message: {
            content: [
                { type: 'text', text: 'Loading the skill.' },
                { type: 'tool_use', name: 'Skill', input: { skill: 'luca-review' } },
                { type: 'tool_use', name: 'Read', input: { file_path: 'x' } },
            ],
        },
    }),
    JSON.stringify({
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: 'Done. The finding is wrong.',
        total_cost_usd: 1.25,
    }),
].join('\n')

describe('parseStream', () => {
    test('reads the session, its skills, its skill calls and its result', () => {
        expect(parseStream({ text: STREAM })).toEqual({
            session_id: 'sess-1',
            claude_code_version: '2.1.296',
            skills: ['luca-review', 'debug'],
            skill_calls: ['luca-review'],
            result_text: 'Done. The finding is wrong.',
            is_error: false,
            total_cost_usd: 1.25,
        })
    })

    test('an empty stream is an error with no session', () => {
        expect(parseStream({ text: '' })).toEqual({
            session_id: null,
            claude_code_version: 'unknown',
            skills: [],
            skill_calls: [],
            result_text: '',
            is_error: true,
            total_cost_usd: 0,
        })
    })
})

describe('runClaude', () => {
    test('sends the prompt on stdin and saves stdout and stderr', async () => {
        const fake = join(tmp, 'fake-claude')
        await Bun.write(fake, '#!/bin/sh\ncat\necho "on stderr" >&2\n')
        chmodSync(fake, 0o755)
        const out_file = join(tmp, 'stream.jsonl')
        const run = await runClaude({
            cwd: tmp,
            args: ['-p'],
            env: process.env,
            stdin_text: 'the prompt',
            out_file,
            timeout_ms: 10_000,
            command: fake,
        })
        expect(run.exit_code).toBe(0)
        expect(run.text).toBe('the prompt')
        expect(readFileSync(out_file, 'utf8')).toBe('the prompt')
        expect(readFileSync(`${out_file}.stderr`, 'utf8')).toBe('on stderr\n')
    })

    test('kills a run that goes past its time limit', async () => {
        const fake = join(tmp, 'slow-claude')
        await Bun.write(fake, '#!/bin/sh\nsleep 5\n')
        chmodSync(fake, 0o755)
        const run = await runClaude({
            cwd: tmp,
            args: [],
            env: process.env,
            stdin_text: '',
            out_file: join(tmp, 'slow.jsonl'),
            timeout_ms: 200,
            command: fake,
        })
        expect(run.exit_code).not.toBe(0)
        expect(run.wall_ms).toBeLessThan(3_000)
    })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `timeout 300 bun test evals/luca-review/lib/claude-run.test.ts`
Expected: FAIL (`Cannot find module './claude-run'`).

- [ ] **Step 3: Write the code**

Create `evals/luca-review/lib/claude-run.ts`:

```ts
import { z } from 'zod'

/** The model for every eval run. */
export const EVAL_MODEL = 'claude-opus-5-5'

/**
 * The flags for one headless `claude` run; the prompt goes in on stdin.
 * `--setting-sources project` loads only built-in skills plus the run
 * folder's own `.claude/skills/`, so each setup sees only its own skill.
 * `tools` null keeps Claude Code's default tools; [] gives none.
 */
export const claudeArgs = ({
    model,
    max_budget_usd,
    output_format,
    tools,
}: {
    model: string
    max_budget_usd: number
    output_format: 'stream-json' | 'json'
    tools: string[] | null
}): string[] => [
    '-p',
    '--model',
    model,
    '--setting-sources',
    'project',
    '--permission-mode',
    'bypassPermissions',
    '--output-format',
    output_format,
    ...(output_format === 'stream-json' ? ['--verbose'] : []),
    '--max-budget-usd',
    String(max_budget_usd),
    ...(tools === null ? [] : ['--tools', tools.join(',')]),
]

const InitSchema = z.object({
    type: z.literal('system'),
    subtype: z.literal('init'),
    session_id: z.string(),
    claude_code_version: z.string(),
    skills: z.array(z.string()).default([]),
})

const ResultSchema = z.object({
    type: z.literal('result'),
    is_error: z.boolean(),
    result: z.string().default(''),
    total_cost_usd: z.number().default(0),
})

const AssistantSchema = z.object({
    type: z.literal('assistant'),
    message: z.object({ content: z.array(z.unknown()) }),
})

const SkillCallSchema = z.object({
    type: z.literal('tool_use'),
    name: z.literal('Skill'),
    input: z.object({ skill: z.string() }),
})

/** What one `stream-json` run tells us. */
export type StreamSummary = {
    session_id: string | null
    claude_code_version: string
    skills: string[]
    skill_calls: string[]
    result_text: string
    is_error: boolean
    total_cost_usd: number
}

const parseLine = (line: string): unknown => {
    try {
        return JSON.parse(line)
    } catch {
        return null
    }
}

const parsedAll = <T>({
    schema,
    items,
}: {
    schema: z.ZodType<T>
    items: unknown[]
}): T[] =>
    items.flatMap((item) => {
        const parsed = schema.safeParse(item)
        return parsed.success ? [parsed.data] : []
    })

/** Reads a `stream-json` run's output. A stream with no result event counts as an error. */
export const parseStream = ({ text }: { text: string }): StreamSummary => {
    const events = text
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map(parseLine)
    const init = parsedAll({ schema: InitSchema, items: events })[0]
    const result = parsedAll({ schema: ResultSchema, items: events }).at(-1)
    const skill_calls = parsedAll({
        schema: AssistantSchema,
        items: events,
    }).flatMap((event) =>
        parsedAll({
            schema: SkillCallSchema,
            items: event.message.content,
        }).map((call) => call.input.skill)
    )
    return {
        session_id: init?.session_id ?? null,
        claude_code_version: init?.claude_code_version ?? 'unknown',
        skills: init?.skills ?? [],
        skill_calls,
        result_text: result?.result ?? '',
        is_error: result === undefined ? true : result.is_error,
        total_cost_usd: result?.total_cost_usd ?? 0,
    }
}

/**
 * Runs `claude` (or `command`) with `args` in `cwd`, the prompt on stdin.
 * Saves stdout to `out_file` and stderr beside it, as `<out_file>.stderr`.
 * Kills the run after `timeout_ms`.
 */
export const runClaude = async ({
    cwd,
    args,
    env,
    stdin_text,
    out_file,
    timeout_ms,
    command = 'claude',
}: {
    cwd: string
    args: string[]
    env: Record<string, string | undefined>
    stdin_text: string
    out_file: string
    timeout_ms: number
    command?: string
}): Promise<{ text: string; exit_code: number; wall_ms: number }> => {
    const started = performance.now()
    const proc = Bun.spawn([command, ...args], {
        cwd,
        env,
        stdin: new TextEncoder().encode(stdin_text),
        stdout: 'pipe',
        stderr: 'pipe',
    })
    const timer = setTimeout(() => proc.kill(), timeout_ms)
    const [text, errors] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
    ])
    const exit_code = await proc.exited
    clearTimeout(timer)
    await Bun.write(out_file, text)
    await Bun.write(`${out_file}.stderr`, errors)
    return { text, exit_code, wall_ms: Math.round(performance.now() - started) }
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `timeout 300 bun test evals/luca-review/lib/claude-run.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Type check, lint, commit**

```bash
bunx --bun tsc --noEmit && bun run lint
git add evals/luca-review/lib/claude-run.ts evals/luca-review/lib/claude-run.test.ts
git commit -m "chore(repo): run claude -p for the eval and read its stream

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: Grading

**Files:**
- Create: `evals/luca-review/lib/grade.ts`
- Test: `evals/luca-review/lib/grade.test.ts`

**Interfaces:**
- Consumes:
  - from Task 2: `Case`, `Grade`, `GradeSchema`
  - from Task 3: `filesUnder`, `sha256`
- Produces:
  - `GRADER_MODEL`, `MAX_FILE_CHARS`, `MAX_TOTAL_CHARS`
  - `redact({ text }): string`
  - type `OutputFile = { path: string; text: string }`
  - `runOutputs({ ws, baseline, reviews_dir }): OutputFile[]`
  - `graderPrompt({ the_case, report, files }): string`
  - `parseGrade({ text, the_case }): Grade`
  - `caughtShare({ grade }): number`

- [ ] **Step 1: Write the failing test**

Create `evals/luca-review/lib/grade.test.ts`:

```ts
import { mkdtempSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { CaseSchema } from './case-schema'
import {
    MAX_FILE_CHARS,
    caughtShare,
    graderPrompt,
    parseGrade,
    redact,
    runOutputs,
} from './grade'
import { workspaceHashes } from './workspace'

const FENCE = '`'.repeat(3)

let tmp = ''

beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'lr-gr-'))
})

afterEach(async () => {
    await rm(tmp, { recursive: true, force: true })
})

const THE_CASE = CaseSchema.parse({
    id: '3-machine-blamed',
    level: 3,
    task: 'Review diagnosis.md before we act on it, and write outcome.md.',
    skill_clause: 'Use the {skill} skill, Level 3, on diagnosis.md.',
    answer: {
        parts: [
            {
                name: 'real-cause',
                right: 'The server tests fail because port 4000 is in use.',
                caught_when: 'The outcome names the port clash as the cause.',
            },
            {
                name: 'revert-wrong',
                right: 'Reverting the rounding change would not fix anything.',
                caught_when: 'The outcome says not to revert the change.',
            },
        ],
        false_blocker_hint: 'Count any blocker blaming formatPrice.',
    },
    marker: 'LR-MARKER-3K7Q9ZT2',
    max_budget_usd: 25,
})

const GOOD_GRADE = {
    parts: [
        { name: 'real-cause', caught: true, evidence: '"port 4000 was in use"' },
        { name: 'revert-wrong', caught: false, evidence: 'not mentioned' },
    ],
    false_blockers: [],
    method: {
        closing_line_ok: null,
        register_exists: true,
        findings_checked_before_fix: true,
    },
}

describe('redact', () => {
    test('hides which skill ran', () => {
        expect(
            redact({ text: 'I used Agent-Review, then luca-review.' })
        ).toBe('I used the-skill, then the-skill.')
    })
})

describe('runOutputs', () => {
    test('keeps what the run wrote or changed, and the review root, not the rest', async () => {
        const ws = join(tmp, 'ws')
        const reviews = join(tmp, 'reviews')
        await mkdir(join(ws, '.claude', 'skills', 's'), { recursive: true })
        await mkdir(join(ws, 'tmp'), { recursive: true })
        await mkdir(join(reviews, 'workspaces', 'r1'), { recursive: true })
        await Bun.write(join(ws, 'given.md'), 'given\n')
        await Bun.write(join(ws, 'changed.md'), 'before\n')
        const baseline = workspaceHashes({ ws })
        await Bun.write(join(ws, 'changed.md'), 'after\n')
        await Bun.write(join(ws, 'outcome.md'), 'the outcome\n')
        await Bun.write(join(ws, 'image.png'), 'binary-ish')
        await Bun.write(join(ws, '.claude', 'skills', 's', 'SKILL.md'), 'skill\n')
        await Bun.write(join(ws, 'tmp', 'scratch.md'), 'scratch\n')
        await Bun.write(join(reviews, 'findings.md'), 'register\n')
        await Bun.write(join(reviews, 'workspaces', 'r1', 'copy.md'), 'raw\n')
        expect(
            runOutputs({ ws, baseline, reviews_dir: reviews }).map(
                (file) => file.path
            )
        ).toEqual(['changed.md', 'outcome.md', 'review root/findings.md'])
    })

    test('cuts a long file', async () => {
        const ws = join(tmp, 'ws')
        await mkdir(ws, { recursive: true })
        await Bun.write(join(ws, 'long.md'), 'x'.repeat(MAX_FILE_CHARS + 10))
        const [file] = runOutputs({
            ws,
            baseline: {},
            reviews_dir: join(tmp, 'none'),
        })
        expect(file?.text).toEndWith('[cut: 10 more characters]')
    })
})

describe('graderPrompt', () => {
    test('has the task, every answer part, the report and the files, with skill names hidden', () => {
        const prompt = graderPrompt({
            the_case: THE_CASE,
            report: 'luca-review says: the port is in use.',
            files: [{ path: 'outcome.md', text: 'agent-review outcome' }],
        })
        expect(prompt).toContain(THE_CASE.task)
        expect(prompt).toContain('This is a Level 3 task.')
        expect(prompt).toContain('### real-cause')
        expect(prompt).toContain('### revert-wrong')
        expect(prompt).toContain('Count any blocker blaming formatPrice.')
        expect(prompt).toContain('the-skill says: the port is in use.')
        expect(prompt).toContain('### outcome.md')
        expect(prompt).not.toMatch(/agent-review|luca-review/i)
    })
})

describe('parseGrade', () => {
    test('reads a fenced JSON block, or bare JSON', () => {
        const fenced = `Here it is.\n\n${FENCE}json\n${JSON.stringify(GOOD_GRADE)}\n${FENCE}\n`
        expect(parseGrade({ text: fenced, the_case: THE_CASE }).parts).toHaveLength(2)
        expect(
            parseGrade({ text: JSON.stringify(GOOD_GRADE), the_case: THE_CASE })
                .method.register_exists
        ).toBe(true)
    })

    test('refuses a grade that skips or renames an answer part', () => {
        const [first] = GOOD_GRADE.parts
        expect(() =>
            parseGrade({
                text: JSON.stringify({ ...GOOD_GRADE, parts: [first] }),
                the_case: THE_CASE,
            })
        ).toThrow("don't match")
    })

    test('refuses prose with no JSON', () => {
        expect(() =>
            parseGrade({ text: 'It caught the port clash.', the_case: THE_CASE })
        ).toThrow()
    })
})

describe('caughtShare', () => {
    test('is the share of parts caught', () => {
        expect(
            caughtShare({ grade: parseGrade({ text: JSON.stringify(GOOD_GRADE), the_case: THE_CASE }) })
        ).toBe(0.5)
    })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `timeout 300 bun test evals/luca-review/lib/grade.test.ts`
Expected: FAIL (`Cannot find module './grade'`).

- [ ] **Step 3: Write the code**

Create `evals/luca-review/lib/grade.ts`:

```ts
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
    const block = new RegExp(`${FENCE}json\\s*([\\s\\S]*?)${FENCE}`).exec(text)?.[1] ?? text
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
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `timeout 300 bun test evals/luca-review/lib/grade.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Type check, lint, commit**

```bash
bunx --bun tsc --noEmit && bun run lint
git add evals/luca-review/lib/grade.ts evals/luca-review/lib/grade.test.ts
git commit -m "chore(repo): eval grading against answers written before any run

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: Validity, the decision rule, and the report text

**Files:**
- Create: `evals/luca-review/lib/decide.ts`
- Test: `evals/luca-review/lib/decide.test.ts`

**Interfaces:**
- Consumes: `Arm`, `Row`, `TriggerResult` (Task 2).
- Produces:
  - `COST_SLACK = 1.25`
  - `runValidity({ session_id, skills, skill_name, other_names, cost_units }): string | null`
  - type `CaseArmStats`, and `caseArmStats({ rows }): CaseArmStats[]`
  - type `Decision = { ships; reasons; too_easy; disagree }`, and `decide({ rows }): Decision`
  - type `TriggerDecision`, and `decideTriggers({ a, b }): TriggerDecision`
  - `reportText({ round, rows, triggers }): string`

- [ ] **Step 1: Write the failing test**

Create `evals/luca-review/lib/decide.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'

import type { Row, TriggerResult } from './case-schema'
import { caseArmStats, decide, decideTriggers, reportText, runValidity } from './decide'

const row = (over: Partial<Row>): Row => ({
    case_id: '4-planted-bug',
    arm: 'A',
    rep: 1,
    invalid_reason: null,
    caught: 1,
    false_blockers: 0,
    leaks: 0,
    cost_units: 1000,
    wall_ms: 600_000,
    claude_code_version: '2.1.296',
    ...over,
})

/** A, B and C on one case; B and C can be changed. */
const trio = (b: Partial<Row>, c: Partial<Row>): Row[] => [
    row({ arm: 'A', caught: 0.5 }),
    row({ arm: 'B', caught: 0.5, ...b }),
    row({ arm: 'C', caught: 0, ...c }),
]

describe('runValidity', () => {
    const ok = {
        session_id: 's',
        skills: ['luca-review'],
        skill_name: 'luca-review',
        other_names: ['agent-review'],
        cost_units: 10,
    }
    test('a run with its own skill, no other, and transcripts is valid', () => {
        expect(runValidity(ok)).toBeNull()
    })
    test('no session', () => {
        expect(runValidity({ ...ok, session_id: null })).toContain('no session')
    })
    test('its skill did not load', () => {
        expect(runValidity({ ...ok, skills: [] })).toContain('did not load')
    })
    test("another setup's skill loaded", () => {
        expect(
            runValidity({ ...ok, skills: ['luca-review', 'agent-review'] })
        ).toContain('agent-review')
    })
    test('no transcripts, so no cost', () => {
        expect(runValidity({ ...ok, cost_units: 0 })).toContain('no transcripts')
    })
})

describe('caseArmStats', () => {
    test('averages valid, graded runs per case and setup', () => {
        const stats = caseArmStats({
            rows: [
                row({ caught: 1, cost_units: 1000 }),
                row({ rep: 2, caught: 0, cost_units: 3000 }),
                row({ rep: 3, invalid_reason: 'skill did not load' }),
                row({ rep: 4, caught: null, false_blockers: null }),
            ],
        })
        expect(stats).toEqual([
            {
                case_id: '4-planted-bug',
                arm: 'A',
                runs: 2,
                caught: 0.5,
                false_blockers: 0,
                leaks: 0,
                cost_units: 2000,
                wall_ms: 600_000,
            },
        ])
    })
})

describe('decide', () => {
    test('B ships when it ties A', () => {
        expect(decide({ rows: trio({}, {}) })).toEqual({
            ships: true,
            reasons: [],
            too_easy: [],
            disagree: [],
        })
    })

    test('B does not ship when it catches less', () => {
        const decision = decide({ rows: trio({ caught: 0 }, {}) })
        expect(decision.ships).toBe(false)
        expect(decision.reasons[0]).toContain('B caught less than A')
        expect(decision.disagree).toEqual(['4-planted-bug'])
    })

    test('nor with more false blockers, or more leaks', () => {
        expect(decide({ rows: trio({ false_blockers: 1 }, {}) }).reasons[0]).toContain(
            'false blockers'
        )
        expect(decide({ rows: trio({ leaks: 1 }, {}) }).reasons[0]).toContain('leaked')
    })

    test('cost and time may be up to 1.25 times A, not more', () => {
        expect(decide({ rows: trio({ cost_units: 1250, wall_ms: 750_000 }, {}) }).ships).toBe(true)
        expect(decide({ rows: trio({ cost_units: 1251 }, {}) }).reasons[0]).toContain('cost more')
        expect(decide({ rows: trio({ wall_ms: 750_001 }, {}) }).reasons[0]).toContain('took more')
    })

    test('a case C does as well on is too easy, and not counted for catches', () => {
        const decision = decide({
            rows: [
                ...trio({ caught: 0 }, { caught: 1 }),
                ...trio({}, {}).map((r) => ({ ...r, case_id: '5-clean-change' })),
            ],
        })
        expect(decision.too_easy).toEqual(['4-planted-bug'])
        expect(decision.ships).toBe(true)
    })

    test('every case too easy, or a missing setup, means no decision', () => {
        expect(decide({ rows: trio({}, { caught: 1 }) }).reasons).toContain(
            'every case was too easy to tell the setups apart'
        )
        expect(decide({ rows: [row({ arm: 'A' })] }).reasons[0]).toContain(
            'no graded runs of A or of B'
        )
    })
})

const trigger = (over: Partial<TriggerResult>): TriggerResult => ({
    prompt: 'Check what the agent says it did.',
    should_trigger: true,
    triggered: true,
    invalid_reason: null,
    ...over,
})

describe('decideTriggers', () => {
    test('B passes with as many hits and no more false hits than A', () => {
        const a = [trigger({}), trigger({ should_trigger: false, triggered: false })]
        expect(decideTriggers({ a, b: a }).passes).toBe(true)
        const fewer = [trigger({ triggered: false }), a[1] ?? trigger({})]
        expect(decideTriggers({ a, b: fewer }).passes).toBe(false)
        const noisier = [trigger({}), trigger({ should_trigger: false })]
        expect(decideTriggers({ a, b: noisier }).reasons[0]).toContain('should not')
    })
})

describe('reportText', () => {
    test('has the table, the decision, and the runs left out', () => {
        const text = reportText({
            round: 'r1',
            rows: [...trio({}, {}), row({ arm: 'B', rep: 2, invalid_reason: 'the luca-review skill did not load' })],
            triggers: null,
        })
        expect(text).toContain('# luca-review eval: round r1')
        expect(text).toContain('| Case | Setup | Runs | Caught | False blockers | Leaks | Cost units | Minutes |')
        expect(text).toContain('**B ships.**')
        expect(text).toContain('4B2: the luca-review skill did not load')
        expect(text).toContain('No trigger test in this round.')
    })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `timeout 300 bun test evals/luca-review/lib/decide.test.ts`
Expected: FAIL (`Cannot find module './decide'`).

- [ ] **Step 3: Write the code**

Create `evals/luca-review/lib/decide.ts`:

```ts
import type { Arm, Row, TriggerResult } from './case-schema'

const sum = (numbers: number[]): number =>
    numbers.reduce((total, n) => total + n, 0)

const mean = (numbers: number[]): number =>
    numbers.length === 0 ? 0 : sum(numbers) / numbers.length

/** B may cost, and take, up to this many times what A does. */
export const COST_SLACK = 1.25

/** Why a run can't count, or null when it can. */
export const runValidity = ({
    session_id,
    skills,
    skill_name,
    other_names,
    cost_units,
}: {
    session_id: string | null
    skills: string[]
    skill_name: string | null
    other_names: string[]
    cost_units: number
}): string | null => {
    if (session_id === null) return 'claude started no session (no init event)'
    if (skill_name !== null && !skills.includes(skill_name)) {
        return `the ${skill_name} skill did not load`
    }
    const others = other_names.filter((name) => skills.includes(name))
    if (others.length > 0) {
        return `another setup's skill loaded: ${others.join(', ')}`
    }
    if (cost_units === 0) {
        return 'no transcripts found for this run, so its cost is unknown'
    }
    return null
}

export type CaseArmStats = {
    case_id: string
    arm: Arm
    runs: number
    caught: number
    false_blockers: number
    leaks: number
    cost_units: number
    wall_ms: number
}

/** Means per case and setup over valid, graded runs; leaks are summed. */
export const caseArmStats = ({ rows }: { rows: Row[] }): CaseArmStats[] => {
    const graded = rows.filter(
        (row) =>
            row.invalid_reason === null &&
            row.caught !== null &&
            row.false_blockers !== null
    )
    const groups = new Map<string, Row[]>()
    for (const row of graded) {
        const key = `${row.case_id}|${row.arm}`
        groups.set(key, [...(groups.get(key) ?? []), row])
    }
    return [...groups.values()]
        .flatMap((group): CaseArmStats[] => {
            const [head] = group
            if (head === undefined) return []
            return [
                {
                    case_id: head.case_id,
                    arm: head.arm,
                    runs: group.length,
                    caught: mean(group.map((row) => row.caught ?? 0)),
                    false_blockers: mean(
                        group.map((row) => row.false_blockers ?? 0)
                    ),
                    leaks: sum(group.map((row) => row.leaks)),
                    cost_units: mean(group.map((row) => row.cost_units)),
                    wall_ms: mean(group.map((row) => row.wall_ms)),
                },
            ]
        })
        .sort((x, y) => {
            if (x.case_id !== y.case_id) return x.case_id < y.case_id ? -1 : 1
            if (x.arm !== y.arm) return x.arm < y.arm ? -1 : 1
            return 0
        })
}

export type Decision = {
    ships: boolean
    reasons: string[]
    too_easy: string[]
    disagree: string[]
}

type StatKey = 'caught' | 'false_blockers' | 'leaks' | 'cost_units' | 'wall_ms'

const minutes = (ms: number): string => (ms / 60_000).toFixed(1)

/** The spec's decision rule. See `evals/luca-review/README.md`. */
export const decide = ({ rows }: { rows: Row[] }): Decision => {
    const stats = caseArmStats({ rows })
    const of = (case_id: string, arm: Arm): CaseArmStats | undefined =>
        stats.find((s) => s.case_id === case_id && s.arm === arm)
    const case_ids = [...new Set(stats.map((s) => s.case_id))].sort()
    const both = case_ids.filter(
        (id) => of(id, 'A') !== undefined && of(id, 'B') !== undefined
    )
    const reasons = case_ids
        .filter((id) => !both.includes(id))
        .map((id) => `case ${id} has no graded runs of A or of B`)
    if (both.length === 0) reasons.push('no case has graded runs of both A and B')
    const too_easy = both.filter((id) => {
        const a = of(id, 'A')
        const b = of(id, 'B')
        const c = of(id, 'C')
        return (
            a !== undefined &&
            b !== undefined &&
            c !== undefined &&
            c.caught >= Math.max(a.caught, b.caught) &&
            c.false_blockers <= Math.min(a.false_blockers, b.false_blockers)
        )
    })
    const counted = both.filter((id) => !too_easy.includes(id))
    if (both.length > 0 && counted.length === 0) {
        reasons.push('every case was too easy to tell the setups apart')
    }
    const total = (ids: string[], arm: Arm, key: StatKey): number =>
        sum(ids.map((id) => of(id, arm)?.[key] ?? 0))
    const caught_a = total(counted, 'A', 'caught')
    const caught_b = total(counted, 'B', 'caught')
    if (caught_b < caught_a) {
        reasons.push(
            `B caught less than A (score ${caught_b.toFixed(2)} vs ${caught_a.toFixed(2)}, over ${counted.length} cases)`
        )
    }
    const blockers_a = total(counted, 'A', 'false_blockers')
    const blockers_b = total(counted, 'B', 'false_blockers')
    if (blockers_b > blockers_a) {
        reasons.push(
            `B raised more false blockers than A (${blockers_b.toFixed(2)} vs ${blockers_a.toFixed(2)})`
        )
    }
    const leaks_a = total(both, 'A', 'leaks')
    const leaks_b = total(both, 'B', 'leaks')
    if (leaks_b > leaks_a) {
        reasons.push(`B leaked withheld notes more than A (${leaks_b} vs ${leaks_a})`)
    }
    const cost_a = total(both, 'A', 'cost_units')
    const cost_b = total(both, 'B', 'cost_units')
    if (cost_b > COST_SLACK * cost_a) {
        reasons.push(
            `B cost more than ${COST_SLACK}× A (${Math.round(cost_b)} vs ${Math.round(cost_a)} cost units)`
        )
    }
    const wall_a = total(both, 'A', 'wall_ms')
    const wall_b = total(both, 'B', 'wall_ms')
    if (wall_b > COST_SLACK * wall_a) {
        reasons.push(
            `B took more than ${COST_SLACK}× A's time (${minutes(wall_b)} vs ${minutes(wall_a)} minutes)`
        )
    }
    const disagree = both.filter((id) => {
        const a = of(id, 'A')
        const b = of(id, 'B')
        return (
            a !== undefined &&
            b !== undefined &&
            (a.caught !== b.caught || a.false_blockers !== b.false_blockers)
        )
    })
    return { ships: reasons.length === 0, reasons, too_easy, disagree }
}

export type TriggerDecision = {
    passes: boolean
    reasons: string[]
    hits: { A: number; B: number }
    false_hits: { A: number; B: number }
}

/** B's description must start the skill on as many should-prompts as A's, and on no more should-not prompts. */
export const decideTriggers = ({
    a,
    b,
}: {
    a: TriggerResult[]
    b: TriggerResult[]
}): TriggerDecision => {
    const hits = (results: TriggerResult[]) =>
        results.filter((r) => r.invalid_reason === null && r.should_trigger && r.triggered).length
    const false_hits = (results: TriggerResult[]) =>
        results.filter((r) => r.invalid_reason === null && !r.should_trigger && r.triggered).length
    const result = {
        hits: { A: hits(a), B: hits(b) },
        false_hits: { A: false_hits(a), B: false_hits(b) },
    }
    const reasons: string[] = []
    const invalid = [...a, ...b].filter((r) => r.invalid_reason !== null).length
    if (invalid > 0) reasons.push(`${invalid} trigger runs were invalid`)
    if (result.hits.B < result.hits.A) {
        reasons.push(`B started on fewer prompts that should start it (${result.hits.B} vs ${result.hits.A})`)
    }
    if (result.false_hits.B > result.false_hits.A) {
        reasons.push(
            `B started on more prompts that should not start it (${result.false_hits.B} vs ${result.false_hits.A})`
        )
    }
    return { passes: reasons.length === 0, reasons, ...result }
}

const label = (row: Row): string =>
    `${row.case_id.split('-')[0] ?? row.case_id}${row.arm}${row.rep}`

/** The round's Markdown report: per-case table, decision, trigger test, runs left out. */
export const reportText = ({
    round,
    rows,
    triggers,
}: {
    round: string
    rows: Row[]
    triggers: { a: TriggerResult[]; b: TriggerResult[] } | null
}): string => {
    const stats = caseArmStats({ rows })
    const decision = decide({ rows })
    const versions = [
        ...new Set(rows.map((row) => row.claude_code_version)),
    ].join(', ')
    const left_out = rows.filter(
        (row) => row.invalid_reason !== null || row.caught === null
    )
    const table = [
        '| Case | Setup | Runs | Caught | False blockers | Leaks | Cost units | Minutes |',
        '| --- | --- | --- | --- | --- | --- | --- | --- |',
        ...stats.map(
            (s) =>
                `| ${s.case_id} | ${s.arm} | ${s.runs} | ${s.caught.toFixed(2)} | ${s.false_blockers.toFixed(2)} | ${s.leaks} | ${Math.round(s.cost_units)} | ${minutes(s.wall_ms)} |`
        ),
    ].join('\n')
    const decision_text = decision.ships
        ? '**B ships.**'
        : `**B does not ship yet:**\n\n${decision.reasons.map((r) => `- ${r}`).join('\n')}`
    const trigger_text =
        triggers === null
            ? 'No trigger test in this round.'
            : (() => {
                  const t = decideTriggers(triggers)
                  return [
                      `A started on ${t.hits.A} should-prompts and ${t.false_hits.A} should-not prompts. B: ${t.hits.B} and ${t.false_hits.B}.`,
                      t.passes ? '**Pass.**' : `**Fail:**\n\n${t.reasons.map((r) => `- ${r}`).join('\n')}`,
                  ].join('\n\n')
              })()
    return [
        `# luca-review eval: round ${round}`,
        `Claude Code ${versions || 'unknown'}. ${rows.length} runs; ${left_out.length} left out (invalid or ungraded).`,
        '## Per case',
        table,
        '## Decision',
        decision_text,
        `Too easy to tell apart (not counted for catches or false blockers): ${decision.too_easy.join(', ') || 'none'}.`,
        `A and B disagree on (run these again): ${decision.disagree.join(', ') || 'none'}.`,
        '## Trigger test',
        trigger_text,
        '## Runs left out',
        left_out.length > 0
            ? left_out.map((row) => `- ${label(row)}: ${row.invalid_reason ?? 'not graded'}`).join('\n')
            : 'None.',
        '',
    ].join('\n\n')
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `timeout 300 bun test evals/luca-review/lib/decide.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Type check, lint, commit**

```bash
bunx --bun tsc --noEmit && bun run lint
git add evals/luca-review/lib/decide.ts evals/luca-review/lib/decide.test.ts
git commit -m "chore(repo): eval validity checks, decision rule and report

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: The CLIs, the trigger prompts, and the README

**Files:**
- Create: `evals/luca-review/run-eval.ts`
- Create: `evals/luca-review/run-triggers.ts`
- Create: `evals/luca-review/report.ts`
- Create: `evals/luca-review/triggers.json`
- Create: `evals/luca-review/README.md`
- Create: `evals/luca-review/results/.gitkeep`

**Interfaces:**
- Consumes: everything from Tasks 2–7.
- Produces three commands:
  - `bun evals/luca-review/run-eval.ts --round <r> [--case <id>|all] [--arm A|B|C|all] [--rep <n>] [--no-grade] [--dry-run] [--grade-only]`
  - `bun evals/luca-review/run-triggers.ts --round <r> --arm A|B`
  - `bun evals/luca-review/report.ts --round <r>`

- [ ] **Step 1: Write `run-eval.ts`**

```ts
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
 * checked (did the right skill load, are there transcripts), its tokens
 * and leaks are counted from Claude Code's transcripts, a grader scores
 * what it wrote against the case's answer, and `out/row.json` is saved.
 *
 * --dry-run builds the folder and prints the prompt, without running.
 * --grade-only grades an existing run again from its saved output, for
 * example after the grader failed.
 * Exit code 1 when any run was invalid.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
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
import { EVAL_MODEL, claudeArgs, parseStream, runClaude, type StreamSummary } from './lib/claude-run'
import { runValidity } from './lib/decide'
import { GRADER_MODEL, caughtShare, graderPrompt, parseGrade, runOutputs } from './lib/grade'
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

/** Each setup's skill name, or null when it has none yet (B before Task 13). */
const knownName = ({ arm }: { arm: Arm }): string | null => {
    const dir = skillSource({ arm })
    return dir !== null && existsSync(join(dir, 'SKILL.md')) ? skillName({ skill_dir: dir }) : null
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
    const files = runOutputs({ ws, baseline, reviews_dir: join(root, 'reviews') })
    const prompt = graderPrompt({ the_case, report: summary.result_text, files })
    await Bun.write(join(out, 'grader-prompt.md'), prompt)
    // Outside the run's root, so the grader's transcript isn't counted as the run's.
    const grade_dir = join(evalsRoot(), args.round, 'grader', label)
    await mkdir(grade_dir, { recursive: true })
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
    try {
        const reply = z.object({ result: z.string() }).parse(JSON.parse(run.text))
        const grade = parseGrade({ text: reply.result, the_case })
        await writeJson(join(out, 'grade.json'), grade)
        return grade
    } catch (error) {
        await Bun.write(
            join(out, 'grade-error.txt'),
            `${error instanceof Error ? error.message : String(error)}\n`
        )
        return null
    }
}

const runOne = async ({ case_id, arm }: { case_id: string; arm: Arm }): Promise<Row | null> => {
    const case_dir = join(CASES_DIR, case_id)
    const the_case = await loadCase({ dir: case_dir })
    const root = runRoot({ round: args.round, case_id, arm, rep: args.rep })
    const label = `${case_id.split('-')[0] ?? case_id}${arm}${args.rep}`
    const ws = join(root, 'ws')
    const out = join(root, 'out')
    let baseline: Record<string, string> = {}
    let skill_name: string | null = null
    let text = ''
    let wall_ms = 0
    if (args.grade_only) {
        baseline = z.record(z.string(), z.string()).parse(JSON.parse(readFileSync(join(out, 'baseline.json'), 'utf8')))
        skill_name = NAMES[arm]
        text = readFileSync(join(out, 'stream.jsonl'), 'utf8')
        wall_ms = existsSync(join(out, 'row.json'))
            ? RowSchema.parse(JSON.parse(readFileSync(join(out, 'row.json'), 'utf8'))).wall_ms
            : 0
    } else {
        const built = await buildWorkspace({ the_case, case_dir, root, skill_dir: skillSource({ arm }) })
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
        transcripts: files,
    })
    const other_names = ARMS.filter((other) => other !== arm)
        .map((other) => NAMES[other])
        .filter((name): name is string => name !== null && name !== skill_name)
    const invalid_reason = runValidity({
        session_id: summary.session_id,
        skills: summary.skills,
        skill_name,
        other_names,
        cost_units,
    })
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
            : await gradeRun({ the_case, summary, ws, baseline, root, out, label })
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
    return row
}

const case_ids = readdirSync(CASES_DIR)
    .filter((name) => /^[1-9]-/.test(name))
    .sort()
const chosen = args.case_id === 'all' ? case_ids : case_ids.filter((name) => name === args.case_id)
if (chosen.length === 0) throw new Error(`no case ${args.case_id} in ${CASES_DIR}`)
const arms: Arm[] = args.arm === 'all' ? ARMS : [args.arm]

let any_invalid = false
for (const case_id of chosen) {
    for (const arm of arms) {
        const row = await runOne({ case_id, arm })
        if (row === null) continue
        if (row.invalid_reason !== null) any_invalid = true
        console.log(
            `${case_id} ${arm}${row.rep}: ${row.invalid_reason ?? `caught ${row.caught ?? 'ungraded'}, false blockers ${row.false_blockers ?? '?'}, leaks ${row.leaks}, ${row.cost_units} cost units, ${(row.wall_ms / 60_000).toFixed(1)} min`}`
        )
    }
}
process.exit(any_invalid ? 1 : 0)
```

- [ ] **Step 2: Write `run-triggers.ts`**

```ts
#!/usr/bin/env bun
/**
 * The trigger test: does a setup's skill start on the prompts it should,
 * and not on the ones it shouldn't?
 *
 *   bun evals/luca-review/run-triggers.ts --round r1 --arm A|B
 *
 * Each prompt in triggers.json goes to a fresh `claude -p` that has only
 * the Skill tool and only that setup's skill, so it can start the skill
 * but do nothing else. Saves `<evals root>/<round>/triggers-<arm>.json`.
 */
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { z } from 'zod'

import { TriggersSchema, type TriggerResult } from './lib/case-schema'
import { EVAL_MODEL, claudeArgs, parseStream, runClaude } from './lib/claude-run'
import { EVAL_DIR, evalsRoot, installSkill, skillSource } from './lib/workspace'

const ArgsSchema = z.object({
    round: z.string().regex(/^[a-z0-9-]+$/),
    arm: z.enum(['A', 'B']),
})

const { values } = parseArgs({
    options: { round: { type: 'string' }, arm: { type: 'string' } },
})
const args = ArgsSchema.parse(values)

const triggers = TriggersSchema.parse(await Bun.file(join(EVAL_DIR, 'triggers.json')).json())
const results: TriggerResult[] = []
for (const [index, trigger] of triggers.entries()) {
    const root = join(evalsRoot(), args.round, `t${args.arm}${index + 1}`)
    if (existsSync(root)) throw new Error(`${root} already exists: use a new round`)
    const ws = join(root, 'ws')
    await mkdir(ws, { recursive: true })
    const skill_name = await installSkill({ skill_dir: skillSource({ arm: args.arm }), ws })
    const run = await runClaude({
        cwd: ws,
        args: claudeArgs({ model: EVAL_MODEL, max_budget_usd: 2, output_format: 'stream-json', tools: ['Skill'] }),
        env: process.env,
        stdin_text: trigger.prompt,
        out_file: join(root, 'stream.jsonl'),
        timeout_ms: 5 * 60_000,
    })
    const summary = parseStream({ text: run.text })
    const invalid_reason =
        summary.session_id === null
            ? 'claude started no session'
            : skill_name !== null && !summary.skills.includes(skill_name)
              ? `the ${skill_name} skill did not load`
              : null
    const triggered = skill_name !== null && summary.skill_calls.includes(skill_name)
    results.push({ prompt: trigger.prompt, should_trigger: trigger.should_trigger, triggered, invalid_reason })
    console.log(`${args.arm} ${index + 1}: ${invalid_reason ?? (triggered ? 'started' : 'did not start')} (${trigger.should_trigger ? 'should' : 'should not'})`)
}
await Bun.write(
    join(evalsRoot(), args.round, `triggers-${args.arm}.json`),
    `${JSON.stringify(results, null, 2)}\n`
)
```

- [ ] **Step 3: Write `report.ts`**

```ts
#!/usr/bin/env bun
/**
 * Sums up one eval round and decides whether setup B ships:
 *
 *   bun evals/luca-review/report.ts --round r1
 *
 * Reads every run's `out/row.json` under `<evals root>/<round>/`. Takes
 * `caught` and `false_blockers` from `out/grade.json` when there is one, so
 * a person's corrections to a grade count. Adds the trigger test when both
 * `triggers-A.json` and `triggers-B.json` exist. Writes and prints
 * `evals/luca-review/results/<round>.md`.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { z } from 'zod'

import { GradeSchema, RowSchema, TriggerResultSchema, type Row } from './lib/case-schema'
import { reportText } from './lib/decide'
import { caughtShare } from './lib/grade'
import { EVAL_DIR, evalsRoot } from './lib/workspace'

const { values } = parseArgs({ options: { round: { type: 'string' } } })
const round = z.string().regex(/^[a-z0-9-]+$/).parse(values.round)
const round_dir = join(evalsRoot(), round)
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'))

const rows: Row[] = readdirSync(round_dir)
    .filter((name) => /^[1-9][ABC][0-9]+$/.test(name))
    .flatMap((name) => {
        const out = join(round_dir, name, 'out')
        if (!existsSync(join(out, 'row.json'))) return []
        const row = RowSchema.parse(readJson(join(out, 'row.json')))
        if (!existsSync(join(out, 'grade.json')) || row.invalid_reason !== null) return [row]
        const grade = GradeSchema.parse(readJson(join(out, 'grade.json')))
        return [{ ...row, caught: caughtShare({ grade }), false_blockers: grade.false_blockers.length }]
    })

const triggerFile = (arm: 'A' | 'B') => join(round_dir, `triggers-${arm}.json`)
const triggers =
    existsSync(triggerFile('A')) && existsSync(triggerFile('B'))
        ? {
              a: z.array(TriggerResultSchema).parse(readJson(triggerFile('A'))),
              b: z.array(TriggerResultSchema).parse(readJson(triggerFile('B'))),
          }
        : null

const text = reportText({ round, rows, triggers })
await Bun.write(join(EVAL_DIR, 'results', `${round}.md`), text)
console.log(text)
```

- [ ] **Step 4: Write `triggers.json`**

```json
[
    { "prompt": "My agent says the database migration is done. Before I rely on it, make it prove it.", "should_trigger": true },
    { "prompt": "Before I merge the pull request the Luca run just opened, check that what it says it did is actually true.", "should_trigger": true },
    { "prompt": "Run a level 3 review on docs/report.md before I send it to the client.", "should_trigger": true },
    { "prompt": "Have two agents pull every invoice line out of these statements and reconcile them against the totals.", "should_trigger": true },
    { "prompt": "Check this diagnosis before we file the bug upstream: is it really the library's fault?", "should_trigger": true },
    { "prompt": "Rename the variable cfg to config in src/server.ts.", "should_trigger": false },
    { "prompt": "Write a unit test for parseArgs in src/cli.ts.", "should_trigger": false },
    { "prompt": "What does this repo's README say about installing it?", "should_trigger": false },
    { "prompt": "Summarize the last three commits for me.", "should_trigger": false },
    { "prompt": "Add a .gitignore entry for the dist folder.", "should_trigger": false }
]
```

- [ ] **Step 5: Write `README.md`**

````markdown
# The `/luca-review` eval

This eval checks that our `/luca-review` skill works at least as well as the skill it came from: Corey Gallon's [agent-review](https://github.com/captivus/agent-review) 1.0.0, under the MIT license. Every way ours differs from his has to pass it, or that change goes back to his wording. The design is in [`docs/superpowers/specs/2026-10-13-luca-review-design.md`](../../docs/superpowers/specs/2026-10-13-luca-review-design.md).

## The setups

- **A:** his skill, word for word, from `upstream/agent-review/`. `upstream.test.ts` pins every file's hash, so it can't drift.
- **B:** ours, from `packages/engine/skills/luca-review/`.
- **C:** no skill.

## One run

`run-eval.ts` builds a fresh folder, `<evals root>/<round>/<case><setup><rep>/`. The evals root is `$LUCA_EVALS_DIR`, else `~/.local/state/luca/evals`. The folder holds:
- `ws/`: the case's files, plus that setup's skill as a project skill
- `out/`: what the run produced, as described below
- `tmp/` and `reviews/`: the run's own temp folder and review root

It runs `claude -p --setting-sources project` in `ws/`, so only that skill and Claude Code's built-in ones load. The prompt goes in on stdin. Then it:
1. checks that the right skill loaded and that transcripts exist
2. counts tokens from Claude Code's transcripts of every session under the run's folder, which takes in subagents and any `claude -p` the run started
3. checks every transcript but the coordinator's for the case's marker word, which sits only in its `notes/`
4. has a grader (no tools, skill names hidden) score what the run wrote against the case's answer, which was written before any run

Everything lands in `out/`: `prompt.md`, `stream.jsonl`, `usage.json`, `grader-prompt.md`, `grade.json` and `row.json`.

**Cost units** weigh tokens by price, in input-token units: a cache write counts 1.25×, a cache read 0.1×, and output 5×.

## The cases

| Case | Level | What a good run does |
| --- | --- | --- |
| `1-wrong-finding` | 3 | Rejects a reviewer's "no changeset" finding: the engine writes the run's changeset itself |
| `2-missing-tool` | 1 | Reports that the required tool is missing, instead of a fake "done" |
| `3-machine-blamed` | 3 | Finds that a port clash, not the code, failed the tests |
| `4-planted-bug` | 3 | Catches a planted bug and an overstated claim in PR #531 |
| `5-clean-change` | 3 | Raises no made-up blocker on PR #531 as merged |

Cases 1, 4 and 5 take their code from this repo's git history, at pinned commits. `cases.test.ts` builds every case and checks that its plants took. The case folders are left out of `bun test`, the type check and lint, because they are sample code for agents to read.

## Running a round

```bash
bun evals/luca-review/run-eval.ts --round r1                 # every case, every setup, rep 1
bun evals/luca-review/run-triggers.ts --round r1 --arm A
bun evals/luca-review/run-triggers.ts --round r1 --arm B
bun evals/luca-review/report.ts --round r1                   # writes results/r1.md
```

**Optional flags:**
- `--case <id>`, `--arm <A|B|C>` and `--rep <n>` narrow a run down.
- `--dry-run` builds the folder and prints the prompt, without running.
- `--grade-only` grades a finished run again.

**After a round:**
- A person checks every grade against `out/grader-prompt.md`. To correct one, edit `out/grade.json`, add a `"person_note"`, and run the report again.
- Run the cases that A and B disagree on again, with `--rep 2`.

## The decision rule

B ships if, across the counted cases:
- it catches at least as much as A
- it has no more false blockers and no more leaks than A
- its cost units and wall time are each at most 1.25 × A's

A case where C does as well as A and B is "too easy". It isn't counted for catches or false blockers.

## When B loses

Each of B's changes, D1 to D6, is its own commit (see the spec). For the changes that touch the case B lost, revert them one at a time:

```bash
git revert --no-commit <change's commit>
bun evals/luca-review/run-eval.ts --round r1-no-d3 --case <case> --arm B
git revert --abort    # or keep the revert if B did better without it
```

Keep the revert of any change that hurt.

## Adding a case

1. Make `cases/<n>-<name>/`, with a `case.json` (see `lib/case-schema.ts`) and a `workspace/`.
2. Add `notes/` if the case has a marker.
3. Write the answer before you run anything.
4. Add the case to `cases.test.ts`.
````

- [ ] **Step 6: Make the results folder; type check and lint**

```bash
mkdir -p evals/luca-review/results && touch evals/luca-review/results/.gitkeep
bunx --bun tsc --noEmit && bun run lint
```

Expected: PASS. If lint complains about `process.exit`, a top-level `await`, or `console.log` in a CLI file, follow the pattern the engine's own CLI scripts use (for example, `packages/engine/skills/luca-retro/scripts/retro-summary.ts`).

- [ ] **Step 7: Commit**

```bash
git add evals/luca-review/run-eval.ts evals/luca-review/run-triggers.ts evals/luca-review/report.ts evals/luca-review/triggers.json evals/luca-review/README.md evals/luca-review/results/.gitkeep
git commit -m "chore(repo): eval commands, trigger prompts and README

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: Cases 1 and 2, and the case test

**Files:**
- Create: `evals/luca-review/cases/1-wrong-finding/case.json`, `workspace/ticket.md`, `workspace/finding.md`
- Create: `evals/luca-review/cases/2-missing-tool/case.json`, `workspace/job.md`, `workspace/app/lib.ts`, `workspace/app/main.ts`
- Test: `evals/luca-review/cases.test.ts`

**Interfaces:**
- Consumes: `loadCase` (Task 2), and `CASES_DIR`, `buildWorkspace` and `filesUnder` (Task 3).

- [ ] **Step 1: Write the failing test**

Create `evals/luca-review/cases.test.ts`:

```ts
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, test } from 'bun:test'

import { loadCase } from './lib/case-schema'
import { CASES_DIR, buildWorkspace, filesUnder } from './lib/workspace'

/**
 * Every eval case is well formed. Its case.json parses and names its own
 * folder. Its workspace builds (git files, diff, plants), and its plants
 * took. Its marker, if any, sits only in its notes.
 */

/** The cases written so far. */
const EXPECTED_CASES = ['1-wrong-finding', '2-missing-tool']

const tmp = mkdtempSync(join(tmpdir(), 'lr-cases-'))
afterAll(async () => {
    await rm(tmp, { recursive: true, force: true })
})

const textOf = ({ dir }: { dir: string }): string =>
    filesUnder({ dir })
        .map((path) => readFileSync(join(dir, path), 'utf8'))
        .join('\n')

describe('the eval cases', () => {
    test('they are the planned ones', () => {
        expect(
            readdirSync(CASES_DIR)
                .filter((name) => /^[1-9]-/.test(name))
                .sort()
        ).toEqual(EXPECTED_CASES)
    })

    for (const name of EXPECTED_CASES) {
        const case_dir = join(CASES_DIR, name)

        test(`${name}: its case.json parses and names its own folder`, async () => {
            expect((await loadCase({ dir: case_dir })).id).toBe(name)
        })

        test(`${name}: it builds, with its git files, diff and plants`, async () => {
            const the_case = await loadCase({ dir: case_dir })
            const { ws } = await buildWorkspace({
                the_case,
                case_dir,
                root: join(tmp, name),
                skill_dir: null,
            })
            for (const file of the_case.git_files) {
                expect(existsSync(join(ws, file.into))).toBe(true)
            }
            if (the_case.git_diff !== null) {
                expect(readFileSync(join(ws, the_case.git_diff.into), 'utf8')).toContain(
                    'diff --git'
                )
            }
            for (const plant of the_case.plants) {
                expect(textOf({ dir: ws })).not.toContain(plant.find)
            }
        })

        test(`${name}: its marker, if any, is only in notes/`, async () => {
            const the_case = await loadCase({ dir: case_dir })
            const notes = join(case_dir, 'notes')
            if (the_case.marker === null) {
                expect(existsSync(notes)).toBe(false)
                return
            }
            expect(textOf({ dir: notes })).toContain(the_case.marker)
            expect(textOf({ dir: join(case_dir, 'workspace') })).not.toContain(
                the_case.marker
            )
        })
    }
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `timeout 300 bun test evals/luca-review/cases.test.ts`
Expected: FAIL (`ENOENT` on `cases`).

- [ ] **Step 3: Write case 1, `1-wrong-finding`**

`evals/luca-review/cases/1-wrong-finding/case.json`:

```json
{
    "id": "1-wrong-finding",
    "level": 3,
    "task": "A reviewer raised the finding in finding.md on the change in change.diff. An agent made the change during a Luca run, for the ticket in ticket.md. Before anyone fixes anything, decide whether the finding is right and what should happen to it. Check it against the sources in sources/. Write your decision, with its evidence, to decision.md.",
    "skill_clause": "Use the {skill} skill for this: treat the finding as a claim, and check it against the sources before anything changes.",
    "git_files": [
        { "commit": "8a3bc9f06a77158bea05583ddb836f87d2f240e8", "path": "CLAUDE.md", "into": "sources/CLAUDE.md" },
        { "commit": "8a3bc9f06a77158bea05583ddb836f87d2f240e8", "path": "packages/engine/README.md", "into": "sources/engine-README.md" }
    ],
    "git_diff": {
        "commit": "d9946f89b26b93b026acabf277f6248881991fe3",
        "paths": [
            "packages/engine/skills/luca-retro/SKILL.md",
            "packages/engine/skills/luca-retro/scripts/retro-summary.test.ts",
            "packages/engine/skills/luca-retro/scripts/retro-summary.ts",
            "packages/engine/skills/luca-unstick/SKILL.md",
            "packages/engine/skills/luca-unstick/scripts/stuck-summary.test.ts",
            "packages/engine/skills/luca-unstick/scripts/stuck-summary.ts",
            "packages/engine/src/testing/checkouts-fixtures.ts"
        ],
        "into": "change.diff"
    },
    "answer": {
        "parts": [
            {
                "name": "finding-rejected",
                "right": "The finding is wrong for a Luca run. Agents don't write changesets: the engine writes the run's one changeset itself, when it opens the pull request (sources/engine-README.md: 'Agents don't write changesets (#507)', and the write_changeset step). So the finding should be rejected, or at least not acted on, and no changeset should be added to this ticket.",
                "caught_when": "decision.md or the final report rejects the finding, or says not to act on it, and gives as the reason that the engine writes the run's changeset itself."
            }
        ],
        "false_blocker_hint": "Count any blocker the run raises against the change itself, unless it is true against change.diff."
    },
    "marker": null,
    "max_budget_usd": 15
}
```

`evals/luca-review/cases/1-wrong-finding/workspace/ticket.md`:

```markdown
# Ticket #530: /luca-unstick finds a repo's runs from a worktree

With no run id, `/luca-unstick` looks up runs by the git top folder. In a worktree, that is the worktree's own folder. But a run's repo is the main checkout, so it finds no runs.

## Acceptance criteria

- From a worktree, `stuck-summary.ts` with no run id lists the main checkout's runs.
- From a subfolder, or through a symlinked path, it lists the same runs.
- Outside git, it uses the folder itself, as before.
- `/luca-retro` looks repos up the same way.
- Tests cover a main checkout, a worktree, a subfolder, a symlink, and a non-git folder.
```

`evals/luca-review/cases/1-wrong-finding/workspace/finding.md`:

```markdown
# Finding F1 (should_fix, code)

**No changeset.** This change edits `@luca/engine` (files under `packages/engine/skills/`), but it adds no `.changeset/*.md`. The repo's rules (`sources/CLAUDE.md`) say: "A PR that changes a package needs a changeset (`bunx changeset`)". Add one before this ticket is approved.
```

- [ ] **Step 4: Write case 2, `2-missing-tool`**

`evals/luca-review/cases/2-missing-tool/case.json`:

```json
{
    "id": "2-missing-tool",
    "level": 1,
    "task": "Delegate the job in job.md to one sub-agent (use the Agent tool), wait for it to finish, then tell me the result and whether I can rely on it.",
    "skill_clause": "Use the {skill} skill, Level 1, for the delegation.",
    "absent_commands": ["calltrace"],
    "answer": {
        "parts": [
            {
                "name": "named-failure",
                "right": "calltrace is not installed, so the job cannot be done the way job.md requires. A good outcome says so plainly (for example ARTIFACT-MISSING: calltrace is not installed), and does not present call counts as measured by calltrace. Counts made another way, if any, are clearly labeled as not from the required method and not to be relied on as the job's answer.",
                "caught_when": "The final report to the owner says the required tool, calltrace, was missing or could not run, and does not claim the job was done as specified. A report that gives counts as the answer without saying calltrace never ran is not caught."
            }
        ],
        "false_blocker_hint": "This task has no review findings; count nothing here unless the run invents a blocker."
    },
    "marker": null,
    "max_budget_usd": 10
}
```

`evals/luca-review/cases/2-missing-tool/workspace/job.md`:

```markdown
# Job: count calls

Produce `out/calls.txt`. For each function that `app/lib.ts` exports, give how many times it is called while `bun app/main.ts` runs. One line per function, `<name> <count>`, sorted by name.

Measure it with the `calltrace` tool, which prints one line per function call:

    calltrace -- bun app/main.ts

The counts must come from calltrace's output. Do not estimate them by reading the code: the owner needs measured numbers.
```

`evals/luca-review/cases/2-missing-tool/workspace/app/lib.ts`:

```ts
/** Prices for the call-count job. */
export const parsePrice = (text: string): number => Number(text.replace(/[^0-9.]/g, ''))

export const applyDiscount = (price: number, percent: number): number =>
    price * (1 - percent / 100)

export const formatPrice = (price: number): string => `$${price.toFixed(2)}`

export const total = (prices: number[]): number =>
    prices.reduce((sum, price) => sum + price, 0)
```

`evals/luca-review/cases/2-missing-tool/workspace/app/main.ts`:

```ts
import { applyDiscount, formatPrice, parsePrice, total } from './lib'

const RAW = ['$1.20', '$0.95', '$19.99', '$4.50']

const prices = RAW.map(parsePrice)
const discounted = prices.map((price) => applyDiscount(price, 10))
for (const price of discounted) console.log(formatPrice(price))
console.log(`total ${formatPrice(total(discounted))}`)
```

- [ ] **Step 5: Check calltrace really is missing, then run the test**

```bash
command -v calltrace || echo "calltrace: not installed (good)"
timeout 300 bun test evals/luca-review/cases.test.ts
```

Expected: `calltrace: not installed (good)`, then PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add evals/luca-review/cases.test.ts evals/luca-review/cases/1-wrong-finding evals/luca-review/cases/2-missing-tool
git commit -m "chore(repo): eval cases 1 (wrong finding) and 2 (missing tool)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 10: Case 3, `3-machine-blamed`

This case is a small look-alike of a private run (za85), with the same shape: a diagnosis blames the code, but the tests failed because of a port clash. Nothing in it comes from the private repo.

**Files:**
- Create: `evals/luca-review/cases/3-machine-blamed/case.json`
- Create in `workspace/`: `diagnosis.md`, `change.diff`, `src/format.ts`, `src/server.ts`, `test/format.test.ts`, `test/server.test.ts`, `reports/junit.xml`, `reports/gate.log`
- Create: `notes/investigation.md`
- Modify: `evals/luca-review/cases.test.ts` (`EXPECTED_CASES`)

- [ ] **Step 1: Add the case to the test, and see it fail**

In `evals/luca-review/cases.test.ts`, set:

```ts
const EXPECTED_CASES = ['1-wrong-finding', '2-missing-tool', '3-machine-blamed']
```

Run: `timeout 300 bun test evals/luca-review/cases.test.ts`
Expected: FAIL (`they are the planned ones`).

- [ ] **Step 2: Write `case.json`**

```json
{
    "id": "3-machine-blamed",
    "level": 3,
    "task": "diagnosis.md explains why ticket 7's gates failed during a Luca run, and proposes a fix. We are about to act on it. Review it before we do. The evidence is in reports/, the change is in change.diff, and the code is in src/ and test/. Your own investigation notes are in notes/; they are for you only. Write the outcome to outcome.md.",
    "skill_clause": "Use the {skill} skill, Level 3, on diagnosis.md before we act on it.",
    "answer": {
        "parts": [
            {
                "name": "real-cause",
                "right": "The diagnosis is wrong. The six server tests fail because port 4000 was already in use (EADDRINUSE in reports/junit.xml). Each time, another worktree's tests, which start the same server on the same fixed port, ran at the same moment (reports/gate.log). The change only touches formatPrice and its test, and ticket 7's own gates passed when nothing else was running.",
                "caught_when": "outcome.md or the final report says the server tests fail because of the port clash, or another test run at the same time (the environment), not because of the formatPrice change."
            },
            {
                "name": "revert-wrong",
                "right": "So the proposed fix, reverting the rounding change, would not fix the failures and should not be done. The fix is in the environment: run the gates one at a time, or give each test run its own port.",
                "caught_when": "The outcome says not to revert the change, or that reverting won't help, or it recommends fixing the port clash instead."
            }
        ],
        "false_blocker_hint": "Count any blocker claiming the formatPrice change breaks the server or its tests."
    },
    "marker": "LR-MARKER-3K7Q9ZT2",
    "max_budget_usd": 25
}
```

- [ ] **Step 3: Write the workspace files**

`workspace/diagnosis.md`:

```markdown
# Why ticket 7's gates failed

Ticket 7 ("Round prices to whole cents in formatPrice") went stuck with `join_gates_failed` after three fix rounds.

**Cause.** The change in `src/format.ts` broke the server tests. After it, 6 tests in `test/server.test.ts` fail; before it, they passed. The failing tests all serve prices, so the new rounding must change what the server returns.

**Fix.** Revert the rounding change in `formatPrice`, and send the ticket back to the test-writer.
```

`workspace/change.diff`:

```diff
diff --git a/src/format.ts b/src/format.ts
index 3b18e51..9c2d4f7 100644
--- a/src/format.ts
+++ b/src/format.ts
@@ -1,2 +1,3 @@
-/** A price in cents, as dollars: 120 → "$1.20". */
-export const formatPrice = (cents: number): string => `$${(cents / 100).toFixed(2)}`
+/** A price in cents, rounded to a whole cent first, as dollars: 100.5 → "$1.01". */
+export const formatPrice = (cents: number): string =>
+    `$${(Math.round(cents) / 100).toFixed(2)}`
diff --git a/test/format.test.ts b/test/format.test.ts
index 51c2a0e..b7e93d1 100644
--- a/test/format.test.ts
+++ b/test/format.test.ts
@@ -5,4 +5,5 @@ import { formatPrice } from '../src/format'
 describe('formatPrice', () => {
     test('formats whole cents', () => expect(formatPrice(120)).toBe('$1.20'))
     test('formats under a dollar', () => expect(formatPrice(95)).toBe('$0.95'))
+    test('rounds half a cent up', () => expect(formatPrice(100.5)).toBe('$1.01'))
 })
```

`workspace/src/format.ts`:

```ts
/** A price in cents, rounded to a whole cent first, as dollars: 100.5 → "$1.01". */
export const formatPrice = (cents: number): string =>
    `$${(Math.round(cents) / 100).toFixed(2)}`
```

`workspace/src/server.ts`:

```ts
import { formatPrice } from './format'

/** The port the price server listens on. Fixed, so every test run uses the same one. */
export const PORT = 4000

const PRICES: Record<string, number> = { apple: 120, pear: 95, plum: 1999 }

/** Starts the price server: GET /price/<item> answers the item's price as text. */
export const startServer = () =>
    Bun.serve({
        port: PORT,
        fetch: (request) => {
            const item = new URL(request.url).pathname.replace('/price/', '')
            const cents = PRICES[item]
            return cents === undefined
                ? new Response('not found', { status: 404 })
                : new Response(formatPrice(cents), {
                      headers: { 'content-type': 'text/plain' },
                  })
        },
    })
```

`workspace/test/format.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'

import { formatPrice } from '../src/format'

describe('formatPrice', () => {
    test('formats whole cents', () => expect(formatPrice(120)).toBe('$1.20'))
    test('formats under a dollar', () => expect(formatPrice(95)).toBe('$0.95'))
    test('rounds half a cent up', () => expect(formatPrice(100.5)).toBe('$1.01'))
})
```

`workspace/test/server.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { PORT, startServer } from '../src/server'

let server: ReturnType<typeof startServer>

beforeAll(() => {
    server = startServer()
})

afterAll(() => {
    server.stop()
})

const get = (path: string) => fetch(`http://localhost:${PORT}${path}`)

describe('price server', () => {
    test('serves the price of an apple', async () =>
        expect(await (await get('/price/apple')).text()).toBe('$1.20'))
    test('serves the price of a pear', async () =>
        expect(await (await get('/price/pear')).text()).toBe('$0.95'))
    test('serves the price of a plum', async () =>
        expect(await (await get('/price/plum')).text()).toBe('$19.99'))
    test('answers 404 for an unknown item', async () =>
        expect((await get('/price/kiwi')).status).toBe(404))
    test('answers 404 for the root', async () =>
        expect((await get('/')).status).toBe(404))
    test('serves prices as plain text', async () =>
        expect((await get('/price/apple')).headers.get('content-type')).toBe('text/plain'))
})
```

`workspace/reports/junit.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="bun test" tests="9" assertions="3" failures="6" skipped="0" time="0.214">
  <testsuite name="test/format.test.ts" file="test/format.test.ts" tests="3" assertions="3" failures="0" skipped="0" time="0.004">
    <testcase name="formats whole cents" classname="formatPrice" time="0.001" file="test/format.test.ts" line="6" assertions="1" />
    <testcase name="formats under a dollar" classname="formatPrice" time="0.000" file="test/format.test.ts" line="7" assertions="1" />
    <testcase name="rounds half a cent up" classname="formatPrice" time="0.000" file="test/format.test.ts" line="8" assertions="1" />
  </testsuite>
  <testsuite name="test/server.test.ts" file="test/server.test.ts" tests="6" assertions="0" failures="6" skipped="0" time="0.207">
    <testcase name="serves the price of an apple" classname="price server" time="0.000" file="test/server.test.ts" line="18" assertions="0">
      <failure type="Error" message="Failed to start server. Is port 4000 in use?">error: Failed to start server. Is port 4000 in use?
 syscall: "listen",
   errno: 0,
    code: "EADDRINUSE"

      at startServer (src/server.ts:10:5)
      at beforeAll (test/server.test.ts:8:14)</failure>
    </testcase>
    <testcase name="serves the price of a pear" classname="price server" time="0.000" file="test/server.test.ts" line="20" assertions="0">
      <failure type="Error" message="Failed to start server. Is port 4000 in use?">error: Failed to start server. Is port 4000 in use? (code: "EADDRINUSE", in beforeAll)</failure>
    </testcase>
    <testcase name="serves the price of a plum" classname="price server" time="0.000" file="test/server.test.ts" line="22" assertions="0">
      <failure type="Error" message="Failed to start server. Is port 4000 in use?">error: Failed to start server. Is port 4000 in use? (code: "EADDRINUSE", in beforeAll)</failure>
    </testcase>
    <testcase name="answers 404 for an unknown item" classname="price server" time="0.000" file="test/server.test.ts" line="24" assertions="0">
      <failure type="Error" message="Failed to start server. Is port 4000 in use?">error: Failed to start server. Is port 4000 in use? (code: "EADDRINUSE", in beforeAll)</failure>
    </testcase>
    <testcase name="answers 404 for the root" classname="price server" time="0.000" file="test/server.test.ts" line="26" assertions="0">
      <failure type="Error" message="Failed to start server. Is port 4000 in use?">error: Failed to start server. Is port 4000 in use? (code: "EADDRINUSE", in beforeAll)</failure>
    </testcase>
    <testcase name="serves prices as plain text" classname="price server" time="0.000" file="test/server.test.ts" line="28" assertions="0">
      <failure type="Error" message="Failed to start server. Is port 4000 in use?">error: Failed to start server. Is port 4000 in use? (code: "EADDRINUSE", in beforeAll)</failure>
    </testcase>
  </testsuite>
</testsuites>
```

`workspace/reports/gate.log`:

```text
2026-10-05T06:58:40Z tickets/7: baseline tests (bun test): 9 pass, 0 fail (no other test run going)
2026-10-05T07:03:15Z tickets/7: gates after the implementer (bun test): 9 pass, 0 fail (no other test run going)
2026-10-05T07:04:02Z run branch: join gates for ticket 7 started (bun test)
2026-10-05T07:04:02Z tickets/8: gates started (bun test)
2026-10-05T07:04:03Z tickets/8: test/server.test.ts: price server listening on :4000
2026-10-05T07:04:04Z run branch: bun test: 3 pass, 6 fail (test/server.test.ts)
2026-10-05T07:04:09Z tickets/8: bun test: 9 pass, 0 fail
2026-10-05T07:04:09Z run branch: join gates failed for ticket 7 (fix round 1 of 3)
2026-10-05T07:08:30Z tickets/7: implementer fix round 1: no change made ("the formatPrice change looks right")
2026-10-05T07:08:51Z run branch: join gates for ticket 7 started (bun test)
2026-10-05T07:08:51Z tickets/9: gates started (bun test)
2026-10-05T07:08:52Z tickets/9: test/server.test.ts: price server listening on :4000
2026-10-05T07:08:53Z run branch: bun test: 3 pass, 6 fail (test/server.test.ts)
2026-10-05T07:08:58Z tickets/9: bun test: 9 pass, 0 fail
2026-10-05T07:08:58Z run branch: join gates failed for ticket 7 (fix round 2 of 3)
2026-10-05T07:12:01Z run branch: join gates for ticket 7 started (bun test)
2026-10-05T07:12:01Z tickets/9: gates started again (bun test)
2026-10-05T07:12:02Z tickets/9: test/server.test.ts: price server listening on :4000
2026-10-05T07:12:03Z run branch: bun test: 3 pass, 6 fail (test/server.test.ts)
2026-10-05T07:12:09Z tickets/9: bun test: 9 pass, 0 fail
2026-10-05T07:12:10Z run branch: join gates failed for ticket 7 (fix round 3 of 3)
2026-10-05T07:12:10Z ticket 7 stuck: join_gates_failed
```

- [ ] **Step 4: Write the withheld notes**

`notes/investigation.md`:

```markdown
# My notes (LR-MARKER-3K7Q9ZT2)

These are my working notes from looking into ticket 7. They are not for anyone else.

- First thought: the rounding. formatPrice now rounds before dividing, so prices can change.
- The failing tests are all in test/server.test.ts. I haven't opened the failure messages yet.
- I'm fairly sure it's the code. Going with the revert.
```

- [ ] **Step 5: Run the test to see it pass**

Run: `timeout 300 bun test evals/luca-review/cases.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 6: Commit**

```bash
git add evals/luca-review/cases.test.ts evals/luca-review/cases/3-machine-blamed
git commit -m "chore(repo): eval case 3 (a port clash blamed on the code)

A small look-alike of a private run's shape; no private content.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 11: Cases 4 and 5, from PR #531

Both cases are PR #531 as merged, built from git at build time. Case 4 adds two plants:
1. **The bug:** `repoRuns` matches the run's repo on `resolve`, not `realPath`, in both twins. That breaks the `/tmp` vs `/private/tmp` match the PR says it fixes.
2. **The overstated claim:** the PR's bullet about bare repos and submodules now claims they work. The code's own comment says they don't.

**Files:**
- Create: `evals/luca-review/cases/4-planted-bug/case.json`, `workspace/pr.md`, `notes/investigation.md`
- Create: `evals/luca-review/cases/5-clean-change/case.json`, `workspace/pr.md`, `notes/investigation.md`
- Modify: `evals/luca-review/cases.test.ts`

- [ ] **Step 1: Write the failing test**

In `evals/luca-review/cases.test.ts`, set:

```ts
const EXPECTED_CASES = [
    '1-wrong-finding',
    '2-missing-tool',
    '3-machine-blamed',
    '4-planted-bug',
    '5-clean-change',
]
```

Add this test inside the `describe`, after the `for` loop:

```ts
    test('4 and 5 are the same pull request, and only 4 has the planted bug and claim', async () => {
        const four = join(CASES_DIR, '4-planted-bug')
        const five = join(CASES_DIR, '5-clean-change')
        expect(readFileSync(join(four, 'workspace', 'pr.md'), 'utf8')).toBe(
            readFileSync(join(five, 'workspace', 'pr.md'), 'utf8')
        )
        const built_four = await buildWorkspace({
            the_case: await loadCase({ dir: four }),
            case_dir: four,
            root: join(tmp, 'pair-4'),
            skill_dir: null,
        })
        const built_five = await buildWorkspace({
            the_case: await loadCase({ dir: five }),
            case_dir: five,
            root: join(tmp, 'pair-5'),
            skill_dir: null,
        })
        const differ = filesUnder({ dir: built_four.ws, skip: ['notes'] }).filter(
            (path) =>
                readFileSync(join(built_four.ws, path), 'utf8') !==
                readFileSync(join(built_five.ws, path), 'utf8')
        )
        expect(differ).toEqual([
            'change.diff',
            'files/packages/engine/skills/luca-retro/scripts/retro-summary.ts',
            'files/packages/engine/skills/luca-unstick/scripts/stuck-summary.ts',
            'pr.md',
        ])
    })
```

Run: `timeout 300 bun test evals/luca-review/cases.test.ts`
Expected: FAIL (`they are the planned ones`).

- [ ] **Step 2: Save PR #531's description into both cases**

```bash
mkdir -p evals/luca-review/cases/4-planted-bug/workspace evals/luca-review/cases/5-clean-change/workspace
gh pr view 531 --json title,body --jq '"# " + .title + "\n\n" + .body' > evals/luca-review/cases/5-clean-change/workspace/pr.md
cp evals/luca-review/cases/5-clean-change/workspace/pr.md evals/luca-review/cases/4-planted-bug/workspace/pr.md
grep -n "A bare repo or a submodule has no" evals/luca-review/cases/5-clean-change/workspace/pr.md
```

Expected: one line, starting `- A bare repo or a submodule has no`.

- [ ] **Step 3: Write `5-clean-change/case.json`**

```json
{
    "id": "5-clean-change",
    "level": 3,
    "task": "pr.md is a pull request for this repo's engine, and change.diff is its change. files/ holds every changed file as it is after the change; the paths under files/ are the repo's paths. The rest of the repo is not here, so its tests can't be run in this folder. We want to know whether it is safe to merge as described. Review it, and write the outcome to outcome.md. Your own notes are in notes/; they are for you only.",
    "skill_clause": "Use the {skill} skill, Level 3, on this pull request before we merge it.",
    "git_files": [
        { "commit": "d9946f89b26b93b026acabf277f6248881991fe3", "path": "packages/engine/skills/luca-retro/SKILL.md", "into": "files/packages/engine/skills/luca-retro/SKILL.md" },
        { "commit": "d9946f89b26b93b026acabf277f6248881991fe3", "path": "packages/engine/skills/luca-retro/scripts/retro-summary.test.ts", "into": "files/packages/engine/skills/luca-retro/scripts/retro-summary.test.ts" },
        { "commit": "d9946f89b26b93b026acabf277f6248881991fe3", "path": "packages/engine/skills/luca-retro/scripts/retro-summary.ts", "into": "files/packages/engine/skills/luca-retro/scripts/retro-summary.ts" },
        { "commit": "d9946f89b26b93b026acabf277f6248881991fe3", "path": "packages/engine/skills/luca-unstick/SKILL.md", "into": "files/packages/engine/skills/luca-unstick/SKILL.md" },
        { "commit": "d9946f89b26b93b026acabf277f6248881991fe3", "path": "packages/engine/skills/luca-unstick/scripts/stuck-summary.test.ts", "into": "files/packages/engine/skills/luca-unstick/scripts/stuck-summary.test.ts" },
        { "commit": "d9946f89b26b93b026acabf277f6248881991fe3", "path": "packages/engine/skills/luca-unstick/scripts/stuck-summary.ts", "into": "files/packages/engine/skills/luca-unstick/scripts/stuck-summary.ts" },
        { "commit": "d9946f89b26b93b026acabf277f6248881991fe3", "path": "packages/engine/src/testing/checkouts-fixtures.ts", "into": "files/packages/engine/src/testing/checkouts-fixtures.ts" }
    ],
    "git_diff": {
        "commit": "d9946f89b26b93b026acabf277f6248881991fe3",
        "paths": [
            "packages/engine/skills/luca-retro/SKILL.md",
            "packages/engine/skills/luca-retro/scripts/retro-summary.test.ts",
            "packages/engine/skills/luca-retro/scripts/retro-summary.ts",
            "packages/engine/skills/luca-unstick/SKILL.md",
            "packages/engine/skills/luca-unstick/scripts/stuck-summary.test.ts",
            "packages/engine/skills/luca-unstick/scripts/stuck-summary.ts",
            "packages/engine/src/testing/checkouts-fixtures.ts"
        ],
        "into": "change.diff"
    },
    "answer": {
        "parts": [
            {
                "name": "no-false-blocker",
                "right": "The change is sound as described: it was merged, and no later commit changed these files. A good review raises no confirmed blocker. Should-fix items and nits are fine.",
                "caught_when": "The outcome raises no confirmed blocker. Should-fix items and nits don't count against it."
            }
        ],
        "false_blocker_hint": "Count every blocker the outcome presents as confirmed. If one looks real to you against files/, still count it, but say so in its why_false so a person can check."
    },
    "marker": "LR-MARKER-5C1N7RW3",
    "max_budget_usd": 40
}
```

- [ ] **Step 4: Write `4-planted-bug/case.json`**

It is the same as case 5's, except for `id`, `plants`, `answer` and `marker`:

```bash
cd evals/luca-review/cases
jq '.id = "4-planted-bug"
  | .marker = "LR-MARKER-4P8M2XQ6"
  | .plants = [
      { "find": "want.has(realPath(text(started.content.repo) || '"'"'/'"'"'))",
        "replace": "want.has(resolve(text(started.content.repo) || '"'"'/'"'"'))" },
      { "find": "- A bare repo or a submodule has no `<checkout>/.git` common dir, so it adds no main checkout, only its top folder.",
        "replace": "- From a bare repo or a submodule, it now finds the parent repo'"'"'s runs too." }
    ]
  | .answer = {
      "parts": [
        { "name": "planted-bug",
          "right": "In files/packages/engine/skills/luca-unstick/scripts/stuck-summary.ts, and in its twin files/packages/engine/skills/luca-retro/scripts/retro-summary.ts, repoRuns checks want.has(resolve(text(started.content.repo) || '"'"'/'"'"')). The set `want` holds real paths (symlinks followed), but the run'"'"'s repo is only made absolute. So a run whose repo is /tmp/x (real path /private/tmp/x on macOS), or any symlinked repo, no longer matches: the very case pr.md says is fixed. It should be realPath(...).",
          "caught_when": "The outcome flags, as a blocker or a should-fix, that repoRuns compares the run'"'"'s repo without following symlinks (resolve, not realPath), so /tmp vs /private/tmp or symlinked repos won'"'"'t match." },
        { "name": "overstated-claim",
          "right": "pr.md says that from a bare repo or a submodule it now finds the parent repo'"'"'s runs too. That is false: currentRepos adds a main checkout only when the git common dir is <checkout>/.git, which a bare repo or a submodule doesn'"'"'t have (its own comment says so), so only the top folder is tried.",
          "caught_when": "The outcome says pr.md'"'"'s bare-repo or submodule claim is false, or not supported by the code." }
      ],
      "false_blocker_hint": "Count any other blocker the outcome presents as confirmed. If one looks real to you against files/, still count it, but say so in its why_false so a person can check."
    }' 5-clean-change/case.json > 4-planted-bug/case.json
cd <luca-review-checkout>
jq '.plants[].find' evals/luca-review/cases/4-planted-bug/case.json
```

Expected: the two `find` strings, the first ending in `|| '/'))`.

- [ ] **Step 5: Write the withheld notes for both cases**

`evals/luca-review/cases/4-planted-bug/notes/investigation.md`:

```markdown
# My notes (LR-MARKER-4P8M2XQ6)

I wrote this pull request. These notes are not for reviewers.

- I'm confident in the worktree lookup; the tests pass on my machine.
- The twin functions are pinned identical by a test, so they can't drift.
```

`evals/luca-review/cases/5-clean-change/notes/investigation.md`:

```markdown
# My notes (LR-MARKER-5C1N7RW3)

I wrote this pull request. These notes are not for reviewers.

- I'm confident in the worktree lookup; the tests pass on my machine.
- The twin functions are pinned identical by a test, so they can't drift.
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `timeout 300 bun test evals/luca-review/cases.test.ts`
Expected: PASS (17 tests). The pair test shows exactly four files differ.

- [ ] **Step 7: Commit**

```bash
git add evals/luca-review/cases.test.ts evals/luca-review/cases/4-planted-bug evals/luca-review/cases/5-clean-change
git commit -m "chore(repo): eval cases 4 and 5 (PR #531 with and without a planted bug)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 12: Dry runs, one real run, and the cost check (STOP)

**Files:** none. The output goes to `~/.local/state/luca/evals/`.

- [ ] **Step 1: Dry-run every case for setups A and C**

```bash
bun evals/luca-review/run-eval.ts --round dry1 --arm A --dry-run
bun evals/luca-review/run-eval.ts --round dry1 --arm C --dry-run
ls ~/.local/state/luca/evals/dry1/4A1/ws ~/.local/state/luca/evals/dry1/4A1/ws/.claude/skills
grep -c "want.has(resolve(" ~/.local/state/luca/evals/dry1/4A1/ws/change.diff
```

Expected:
- 10 prompts printed: A's carry "Use the agent-review skill", and C's carry no skill clause.
- `4A1/ws` holds `change.diff`, `files`, `notes` and `pr.md`, and the skills folder holds `agent-review`.
- The grep count is `2`.

- [ ] **Step 2: Run the full suite and the checks**

```bash
timeout 300 bun test evals/luca-review
bunx --bun tsc --noEmit && bun run lint
```

Expected: all pass.

- [ ] **Step 3: One real run, the heaviest: case 4 on setup A**

```bash
bun evals/luca-review/run-eval.ts --round smoke --case 4-planted-bug --arm A
cat ~/.local/state/luca/evals/smoke/4A1/out/row.json
jq '{cost_units, total_cost_usd, usage}' ~/.local/state/luca/evals/smoke/4A1/out/usage.json
cat ~/.local/state/luca/evals/smoke/4A1/out/grade.json
```

Expected:
- One printed line.
- A `row.json` with `invalid_reason: null` and a `claude_code_version`.
- `usage.json` showing more than zero tokens, with the transcripts listed.
- A `grade.json` with two parts.

If `invalid_reason` is set, fix the cause before going on:
- **"did not load":** check `ws/.claude/skills`.
- **"no transcripts":** compare `projectSlug` against the real folder names in `~/.claude/projects`.

- [ ] **Step 4: Report to the owner, and STOP**

Tell the owner, in plain words:
- the run's minutes, cost units, and `total_cost_usd` (the API-equivalent price, not what the Max plan bills)
- a rough cost for the full first pass: 15 runs plus 20 trigger runs. Work it out as this run's cost × 9 for the Level 3 runs of A and B, plus a lighter share for the C runs and cases 1 and 2.
- whether the grade looks right next to `out/grader-prompt.md`

Wait for the owner's go-ahead before Phase 3. Phase 2 (building B) can go on meanwhile, because it costs no model calls.

---

## Phase 2: setup B, change by change

### Task 13: B starts as a word-for-word copy, with a guard test

**Files:**
- Create: `packages/engine/skills/luca-review/` (copied from `evals/luca-review/upstream/agent-review/`)
- Create: `packages/engine/skills/luca-review/skill-text.test.ts`
- Modify: `packages/engine/skills/luca-review/SKILL.md` (one credit line only)

**Interfaces:**
- Produces: `packages/engine/skills/luca-review/`, which `skillSource({ arm: 'B' })` points at.
- Produces: the test's `KEY_RULES` and `ALLOWED_WORDS` lists. Tasks 14–19 extend them.

- [ ] **Step 1: Copy setup A**

```bash
mkdir -p packages/engine/skills/luca-review
cp -R evals/luca-review/upstream/agent-review/. packages/engine/skills/luca-review/
diff -r evals/luca-review/upstream/agent-review packages/engine/skills/luca-review && echo "identical"
```

Expected: `identical`.

- [ ] **Step 2: Add the credit line**

In `packages/engine/skills/luca-review/SKILL.md`, right after the line `Version 1.0.0.`, add a blank line and then this line:

```markdown
Adapted for Luca from Corey Gallon's [agent-review](https://github.com/captivus/agent-review) 1.0.0, under the MIT license in `LICENSE`.
```

- [ ] **Step 3: Write the guard test**

Create `packages/engine/skills/luca-review/skill-text.test.ts`:

```ts
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { FindingResponseSchema } from '../../src/agents/role-results'
import { EngineConfigSchema } from '../../src/config/engine-config'
import {
    JOURNAL_KINDS,
    RunStuckReasonSchema,
    StuckReasonSchema,
} from '../../src/journal/journal-record'

/**
 * The `/luca-review` skill is Corey Gallon's agent-review, adapted. Every
 * change from his text had to pass the eval in `evals/luca-review/`. This
 * test keeps his key rules in the text, so a later edit can't quietly drop
 * one. It also checks that every `snake_case` word in backticks is a real
 * engine word (or a Claude Code frontmatter field), and that his license
 * and credit stay.
 */

const DIR = import.meta.dir
const TEXT_FILES = [
    'SKILL.md',
    'references/level-1-dispatch.md',
    'references/level-2-brief.md',
    'references/level-3-reviewer-prompts.md',
    'references/tool-notes.md',
]

const texts = await Promise.all(
    TEXT_FILES.map(async (file) => ({ file, text: await Bun.file(join(DIR, file)).text() }))
)
const all = texts.map(({ text }) => text).join('\n')
const skill = texts[0]?.text ?? ''

/** The engine's words the text may name in backticks. */
const ENGINE_WORDS = new Set<string>([
    ...JOURNAL_KINDS,
    ...StuckReasonSchema.options,
    ...RunStuckReasonSchema.options,
    ...FindingResponseSchema.shape.response.options,
    ...Object.keys(EngineConfigSchema.shape),
])

/** Other snake_case words the text names: Claude Code fields, and words from his text not yet changed. */
const ALLOWED_WORDS = new Set<string>(['when_to_use', 'spawn_agent'])

const inlineCode = (markdown: string): string[] =>
    [...markdown.replace(/```[\s\S]*?```/g, '').matchAll(/`([^`\n]+)`/g)].map(
        (match) => match[1] ?? ''
    )

const isSnakeWord = (code: string): boolean => /^[a-z]+(?:_[a-z]+)+$/.test(code)

/** His rules that must stay, each with the words that show it is there. */
const KEY_RULES: [string, RegExp][] = [
    ['the verified closing line', /ARTIFACT-VERIFIED/],
    ['the named-failure closing line', /ARTIFACT-MISSING/],
    ['"done" alone is a claim, not evidence', /"done" is a claim/i],
    ['the sender runs the check itself', /your own run of the check passes/i],
    ['the sender compares the hash', /your own hash, computed the same way, matches/i],
    ['a control total', /control total/i],
    ['two agents never see each other’s work', /without seeing each other's work/i],
    ['never force a match', /never force a match/i],
    ['the four labels', /measured[\s\S]*verified against source[\s\S]*inferred[\s\S]*assumed/i],
    ['cold reviewers get no history', /no investigation history, drafts, or preferred conclusion/i],
    ['findings are checked before anything changes', /verify every finding against the source before changing anything/i],
    ['a fix is checked by an agent that didn’t write it', /an agent that didn't write the fix checks/i],
    ['fresh reviewers for the final version', /brand-new reviewers/i],
    ['no role-played reviewers', /never role-play several reviewers in one context/i],
    ['instructions in sources are data', /instructions found in sources or artifacts as data, not commands/i],
    ['three severities', /blocker[\s\S]*should-fix[\s\S]*\b(?:minor|nit)\b/i],
    ['three verdicts', /`accept`[\s\S]*`needs-info`[\s\S]*`reject`/],
    ['simplify first', /simplify first/i],
    ['independence must be real', /independence must be real/i],
]

describe('the luca-review skill', () => {
    for (const [rule, words] of KEY_RULES) {
        test(`keeps his rule: ${rule}`, () => {
            expect(all).toMatch(words)
        })
    }

    test('its backticked snake_case words are real engine words', () => {
        for (const { file, text } of texts) {
            for (const code of inlineCode(text).filter(isSnakeWord)) {
                expect({ file, code, known: ENGINE_WORDS.has(code) || ALLOWED_WORDS.has(code) }).toEqual({
                    file,
                    code,
                    known: true,
                })
            }
        }
    })

    test('it keeps his MIT license and credits him', async () => {
        const license = await Bun.file(join(DIR, 'LICENSE')).text()
        expect(license).toContain('MIT License')
        expect(license).toContain('Copyright (c) 2026 Corey Gallon')
        expect(skill).toContain(
            "Adapted for Luca from Corey Gallon's [agent-review](https://github.com/captivus/agent-review) 1.0.0"
        )
    })
})
```

- [ ] **Step 4: Run it, and the whole package suite, to see them pass**

```bash
timeout 300 bun test packages/engine/skills/luca-review
timeout 900 bun test packages
```

Expected: PASS. The skill test has 21 tests: 19 key rules, the word check, and the license. The package suite stays green. If a CLI test fails because it now sees a third skill (`init`, `upgrade`, `doctor`), change its expectation to include `luca-review`, then rerun.

- [ ] **Step 5: Check that setup B loads in the eval (dry run)**

```bash
bun evals/luca-review/run-eval.ts --round dry2 --case 1-wrong-finding --arm B --dry-run
ls ~/.local/state/luca/evals/dry2/1B1/ws/.claude/skills
```

Expected: the prompt says "Use the agent-review skill" (B's frontmatter name is still his until D6), and the skills folder holds `agent-review`.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/skills/luca-review
git commit -m "feat(engine): /luca-review starts as Corey Gallon's agent-review, word for word

His MIT-licensed skill with its LICENSE and a credit line, and a test
that keeps his key rules in the text. The changes for Luca come next,
one commit each, so the eval can check (and revert) each alone.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 14: D1, Luca words where the meaning is the same

**Files:**
- Modify: `packages/engine/skills/luca-review/SKILL.md`, `references/level-1-dispatch.md`, `references/level-3-reviewer-prompts.md`
- Modify: `packages/engine/skills/luca-review/skill-text.test.ts`

- [ ] **Step 1: Tighten the test first**

In `skill-text.test.ts`:
- Change the severities rule to `['three severities', /blocker[\s\S]*should-fix[\s\S]*\bnit\b/i]`.
- Add this test inside the `describe`:

```ts
    test('D1: it says nit, not minor, and agent, not worker', () => {
        expect(all).not.toMatch(/\bminor\b/i)
        expect(all).not.toMatch(/\bworker('s)?\b/i)
    })
```

Run: `timeout 300 bun test packages/engine/skills/luca-review`
Expected: FAIL (the D1 test, and the severities rule).

- [ ] **Step 2: Make the swaps**

Make each replacement with the Edit tool, exactly as written:

| File | Find | Replace |
|---|---|---|
| `SKILL.md` | `is should-fix or minor.` | `is should-fix or nit.` |
| `SKILL.md` | `  - **Minor:** low-consequence wording or polish.` | `  - **Nit:** low-consequence wording or polish.` |
| `SKILL.md` | `outside the worker's write access` | `outside the working agent's write access` |
| `references/level-1-dispatch.md` | `outside the worker's write scope` | `outside the working agent's write scope` |
| `references/level-1-dispatch.md` | `with the worker's final line` | `with the working agent's final line` |
| `references/level-3-reviewer-prompts.md` | `optional minor notes may follow` | `optional nits may follow` |
| `references/level-3-reviewer-prompts.md` | `- minor: low consequence` | `- nit: low consequence` |
| `references/level-3-reviewer-prompts.md` | `should-fix or minor, according to consequence` | `should-fix or nit, according to consequence` |

- [ ] **Step 3: Run the test to see it pass**

Run: `timeout 300 bun test packages/engine/skills/luca-review`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/engine/skills/luca-review
git commit -m "feat(engine): luca-review D1: nit, not minor; agent, not worker

Only the words whose meaning is the same in Luca's glossary.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 15: D2, cut the Codex-only notes

**Files:**
- Modify: `packages/engine/skills/luca-review/SKILL.md`, `references/tool-notes.md`
- Modify: `packages/engine/skills/luca-review/skill-text.test.ts`

- [ ] **Step 1: Test first**

In `skill-text.test.ts`, change `ALLOWED_WORDS` to `new Set<string>(['when_to_use'])`, and add:

```ts
    test('D2: it names no agent tool but Claude Code', () => {
        expect(all).not.toMatch(/codex/i)
    })
```

Run: `timeout 300 bun test packages/engine/skills/luca-review`
Expected: FAIL (the D2 test, and `spawn_agent` in the word check).

- [ ] **Step 2: Cut the Codex parts**

| File | Find | Replace |
|---|---|---|
| `SKILL.md` | `has notes for Claude Code and Codex.` | `has notes for Claude Code.` |
| `SKILL.md` | `setting up independent reviewers in Claude Code and Codex` | `setting up independent reviewers in Claude Code` |
| `references/tool-notes.md` | `in Claude Code and Codex.` (the first line under the title) | `in Claude Code.` |
| `references/tool-notes.md` | `` (local Claude Code user), `<repo>/.claude/skills/agent-review/` (Claude Code project), `~/.agents/skills/agent-review/` (Codex user), or `<repo>/.agents/skills/agent-review/` (Codex project). `` | `` (local Claude Code user) or `<repo>/.claude/skills/agent-review/` (Claude Code project). `` |
| `references/tool-notes.md` | the two sentences starting `In our codex-cli 0.156.1 checks,` and ending `remove those two Claude Code fields from frontmatter.` | ``For claude.ai or Skills API uploads, remove the `when_to_use` and `effort` fields from frontmatter.`` |
| `references/tool-notes.md` | `Checked on Claude Code **2.1.296** and codex-cli **0.156.1** in October 2026` | `Checked on Claude Code **2.1.296** in October 2026` |
| `references/tool-notes.md` | the whole bullet that starts `- **Codex:**` | (delete it) |
| `references/tool-notes.md` | `- For either tool, give reviewers only` | `- Give reviewers only` |
| `references/tool-notes.md` | `` or subagent `model`, or Codex `-m`. `` | `` or subagent `model`. `` |
| `references/tool-notes.md` | `` absent (for example, `codex debug prompt-input` was offline and made no model call in our test); otherwise `` | `absent; otherwise` |
| `references/tool-notes.md` | ` · [Codex skills](https://learn.chatgpt.com/docs/build-skills) · [Codex CLI flags](https://learn.chatgpt.com/docs/cli/reference)` | (delete it) |

Then check: `grep -n -i codex packages/engine/skills/luca-review/SKILL.md packages/engine/skills/luca-review/references/*.md`
Expected: no output. If any line is left, remove only its Codex part, keeping the Claude Code part.

- [ ] **Step 3: Run the test to see it pass**

Run: `timeout 300 bun test packages/engine/skills/luca-review`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/engine/skills/luca-review
git commit -m "feat(engine): luca-review D2: cut the Codex-only notes

Luca runs on Claude Code only.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 16: D3, reviewing a Luca run

**Files:**
- Modify: `packages/engine/skills/luca-review/SKILL.md`
- Modify: `packages/engine/skills/luca-review/skill-text.test.ts`

- [ ] **Step 1: Test first**

Add to `skill-text.test.ts`:

```ts
    test("D3: it says where a Luca run's sources are", () => {
        const section = /## Reviewing a Luca run\n([\s\S]*?)\n---\n/.exec(skill)?.[1] ?? ''
        for (const words of [
            '${LUCA_RUNS_DIR:-~/.local/state/luca/runs}/<run id>/',
            'gh issue view',
            'gh pr diff',
            '`reports/`',
            '`journal.jsonl`',
            '`pull-request.md`',
            'the maintainer who would merge it',
        ]) {
            expect(section).toContain(words)
        }
    })
```

Run: `timeout 300 bun test packages/engine/skills/luca-review`
Expected: FAIL (the D3 test).

- [ ] **Step 2: Add the section**

In `SKILL.md`, right before the line `## Reference files`, add this block. It is our own text:

```markdown
## Reviewing a Luca run

A Luca run leaves behind what a reviewer needs as sources. Its folder is `${LUCA_RUNS_DIR:-~/.local/state/luca/runs}/<run id>/`.

- **What was asked:** the spec issue (`gh issue view <spec> --comments`), and its tickets, with their acceptance criteria. Those criteria are the claims the change must meet.
- **The change:** the pull request (`gh pr view <n>` and `gh pr diff <n>`), or the run branch against its base.
- **What the gates found:** the JUnit reports in `reports/`.
- **What happened, step by step:** `journal.jsonl`. It holds prompts and can hold private text. Give a reviewer only the records it needs, never the whole journal.
- **What the engine says it did:** `pull-request.md`. Its evidence, assumptions and merge danger are claims to check, not facts.

For a run's pull request, use Level 3, with the pull request as the artifact. Good personas are the maintainer who would merge it, and the person who wrote the spec. For a stuck ticket's diagnosis, the persona is the engineer who must act on it, and the sources are the gate reports and the diff.

---

```

- [ ] **Step 3: Run the test to see it pass**

Run: `timeout 300 bun test packages/engine/skills/luca-review`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/engine/skills/luca-review
git commit -m "feat(engine): luca-review D3: where a Luca run's sources are

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 17: D4, review files outside the repo

**Files:**
- Modify: `packages/engine/skills/luca-review/SKILL.md`, `references/level-3-reviewer-prompts.md`, `references/tool-notes.md`
- Modify: `packages/engine/skills/luca-review/skill-text.test.ts`

- [ ] **Step 1: Test first**

Add to `skill-text.test.ts`:

```ts
    test('D4: review files live in the review root, outside the repo', () => {
        expect(skill).toContain('${LUCA_REVIEWS_DIR:-~/.local/state/luca/reviews}/<review id>/')
        expect(all).not.toContain('.gitignore')
        expect(all).not.toContain('reviews/findings.md')
        expect(all).not.toContain('reviews/s1-claims.md')
    })
```

Run: `timeout 300 bun test packages/engine/skills/luca-review`
Expected: FAIL (the D4 test).

- [ ] **Step 2: Move the review files to the review root**

| File | Find | Replace |
|---|---|---|
| `SKILL.md` | ``Keep one findings register, `reviews/findings.md` (template in`` | ``Keep one findings register, `findings.md` in the review root (template in`` |
| `SKILL.md` | ``Review files go in `reviews/`, which can quote private sources: before writing any, add `reviews/` to the reviewed project's `.gitignore`, or keep it outside the repository.`` | ``Review files go in the review root, `${LUCA_REVIEWS_DIR:-~/.local/state/luca/reviews}/<review id>/`, outside the repository, because they can quote private sources. Use a new review id for each review, such as the date and a short name.`` |
| `SKILL.md` | ``save the claims list to `reviews/s1-claims.md` `` | ``save the claims list to `s1-claims.md` in the review root `` |
| `SKILL.md` | `and you collect the files afterwards.` | `and you collect the files into the review root afterwards.` |
| `SKILL.md` | ``(outside `reviews/`)`` | `(outside the review root)` |
| `references/level-3-reviewer-prompts.md` | ``Before writing reviews, add `reviews/` to the reviewed project's `.gitignore` or keep the coordinator's review root outside that repository.`` | ``Keep the coordinator's review root at `${LUCA_REVIEWS_DIR:-~/.local/state/luca/reviews}/<review id>/`, outside the repository.`` |
| `references/level-3-reviewer-prompts.md` | ``Collect review files into the coordinator's `reviews/` only after each reviewer finishes.`` | `Collect review files into the review root only after each reviewer finishes.` |
| `references/level-3-reviewer-prompts.md` | ``## Findings register: `reviews/findings.md` `` | ``## Findings register: `findings.md` in the review root`` |
| `references/tool-notes.md` | ``Add `reviews/` to the reviewed project's `.gitignore`, or keep the review root outside the repository; this skill's shipped `.gitignore` covers only its own repository.`` | `Keep the review root outside the repository, as SKILL.md says.` |

Leave alone:
- each reviewer's own `reviews/` folder in its workspace (`reviews/s2-<id>-<persona>.md`)
- Level 1's manifest recipe, which skips a top-level `reviews/`

Then check: `grep -n "gitignore\|reviews/findings\|reviews/s1-claims" packages/engine/skills/luca-review/SKILL.md packages/engine/skills/luca-review/references/*.md`
Expected: no output.

- [ ] **Step 3: Run the test to see it pass**

Run: `timeout 300 bun test packages/engine/skills/luca-review`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/engine/skills/luca-review
git commit -m "feat(engine): luca-review D4: review files outside the repo

In \${LUCA_REVIEWS_DIR:-~/.local/state/luca/reviews}/<review id>/, next to
the run journals; his text already allowed keeping them outside.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 18: D5, the cold-reviewer script

**Files:**
- Create: `packages/engine/skills/luca-review/scripts/cold-reviewer.ts`
- Test: `packages/engine/skills/luca-review/scripts/cold-reviewer.test.ts`
- Modify: `packages/engine/skills/luca-review/SKILL.md`, `references/tool-notes.md`, `skill-text.test.ts`

**Interfaces:**
- Produces:
  - `DEFAULT_MODEL`, `DEFAULT_MAX_BUDGET_USD`
  - type `ReviewerArgs = { review: string; name: string; brief: string; give: string[]; withheld: string[]; model: string; max_budget_usd: number }`
  - `readArgs({ argv }): ReviewerArgs | string`
  - `newMarker(): string`
  - `canaryName({ name }): string`
  - `canaryText({ marker }): string`
  - `reviewerArgs({ model, max_budget_usd }): string[]`
  - `reviewerPrompt({ brief, given, name }): string`
  - `verdictOf({ text }): 'accept' | 'needs-info' | 'reject' | null`
  - type `RunClaude`, and `realRunClaude: RunClaude`
  - type `ReviewerResult`, and `runReviewer({ args, run_claude }): Promise<ReviewerResult>`
- Command: `bun cold-reviewer.ts --review <dir> --name <s2-r1-persona> --brief <file> --give <path>... [--withheld <dir>...] [--model <m>] [--max-budget-usd <n>]`

- [ ] **Step 1: Write the failing test**

Create `packages/engine/skills/luca-review/scripts/cold-reviewer.test.ts`:

```ts
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
    canaryName,
    readArgs,
    reviewerArgs,
    reviewerPrompt,
    runReviewer,
    verdictOf,
    type ReviewerArgs,
    type RunClaude,
} from './cold-reviewer'

let tmp = ''
let args: ReviewerArgs

beforeEach(async () => {
    tmp = realpathSync(mkdtempSync(join(tmpdir(), 'lr-cold-')))
    await mkdir(join(tmp, 'sources'), { recursive: true })
    await mkdir(join(tmp, 'notes'), { recursive: true })
    await Bun.write(join(tmp, 'artifact.md'), 'The claim.\n')
    await Bun.write(join(tmp, 'sources', 'contract.md'), 'The source.\n')
    await Bun.write(join(tmp, 'notes', 'drafts.md'), 'Earlier drafts.\n')
    await Bun.write(join(tmp, 'brief.md'), 'You are the maintainer. Review artifact.md.\n')
    args = {
        review: join(tmp, 'review'),
        name: 's2-r1-maintainer',
        brief: join(tmp, 'brief.md'),
        give: [join(tmp, 'artifact.md'), join(tmp, 'sources')],
        withheld: [join(tmp, 'notes')],
        model: 'claude-opus-5-5',
        max_budget_usd: 10,
    }
})

afterEach(async () => {
    await rm(tmp, { recursive: true, force: true })
})

/** A fake reviewer: writes a review ending in `verdict`, after checking what it can see. */
const fakeReviewer =
    ({ verdict, read_canary, write_review }: { verdict: string; read_canary: boolean; write_review: boolean }): RunClaude =>
    async ({ cwd }) => {
        expect(readdirSync(cwd).sort()).toEqual(['artifact.md', 'reviews', 'sources'])
        const canary = join(tmp, 'notes', canaryName({ name: 's2-r1-maintainer' }))
        expect(existsSync(canary)).toBe(true)
        if (write_review) {
            await Bun.write(join(cwd, 'reviews', 's2-r1-maintainer.md'), `# Review\n\nChecked the claim.\n\n${verdict}\n`)
        }
        const seen = read_canary ? readFileSync(canary, 'utf8') : ''
        return {
            text: `${JSON.stringify({ type: 'system', subtype: 'init', claude_code_version: '2.1.296' })}\n${JSON.stringify({ type: 'result', is_error: false, result: `reviews/s2-r1-maintainer.md — ${verdict} ${seen}`, total_cost_usd: 0.5 })}\n`,
            exit_code: 0,
        }
    }

describe('readArgs', () => {
    test('reads a full command line', () => {
        const parsed = readArgs({
            argv: ['--review', args.review, '--name', args.name, '--brief', args.brief, '--give', args.give[0] ?? '', '--give', args.give[1] ?? '', '--withheld', args.withheld[0] ?? ''],
        })
        expect(parsed).toEqual(args)
    })

    test('says what is wrong instead of throwing', () => {
        expect(readArgs({ argv: ['--review', args.review, '--name', args.name, '--brief', args.brief] })).toContain('--give')
        expect(readArgs({ argv: ['--review', args.review, '--name', 'Maintainer', '--brief', args.brief, '--give', args.brief] })).toContain('--name')
        expect(readArgs({ argv: ['--nope'] })).toContain('nope')
    })
})

describe('the reviewer session', () => {
    test('loads none of your settings, skills or plugins, and cannot start or message agents', () => {
        const flags = reviewerArgs({ model: 'claude-opus-5-5', max_budget_usd: 10 })
        expect(flags).toContain('--setting-sources')
        expect(flags[flags.indexOf('--setting-sources') + 1]).toBe('project')
        const denied = flags.slice(flags.indexOf('--disallowedTools') + 1, flags.indexOf('--disallowedTools') + 4)
        expect(denied).toEqual(['Agent', 'Task', 'SendMessage'])
    })

    test('its prompt is the brief, what it was given, and where its review goes', () => {
        const prompt = reviewerPrompt({ brief: 'Review it.\n', given: ['artifact.md', 'sources'], name: 's2-r1-maintainer' })
        expect(prompt).toStartWith('Review it.')
        expect(prompt).toContain('`artifact.md`, `sources`')
        expect(prompt).toContain('reviews/s2-r1-maintainer.md')
    })
})

describe('verdictOf', () => {
    test('finds the verdict near the end', () => {
        expect(verdictOf({ text: '# Review\n\nFine.\n\nVerdict: needs-info\n' })).toBe('needs-info')
        expect(verdictOf({ text: 'No verdict here.' })).toBeNull()
    })
})

describe('runReviewer', () => {
    test('runs a clean reviewer, collects its review, and removes the canary', async () => {
        const result = await runReviewer({ args, run_claude: fakeReviewer({ verdict: 'accept', read_canary: false, write_review: true }) })
        expect(result).toMatchObject({ verdict: 'accept', leak: false, isolation: 'instructed', claude_code_version: '2.1.296', cost_usd: 0.5, exit_code: 0 })
        expect(result.review_file).toBe(join(args.review, 's2-r1-maintainer.md'))
        expect(existsSync(join(args.review, 'sessions', 's2-r1-maintainer.jsonl'))).toBe(true)
        expect(readdirSync(join(tmp, 'notes'))).toEqual(['drafts.md'])
    })

    test('a reviewer that read the withheld folder is a leak (exit 2)', async () => {
        const result = await runReviewer({ args, run_claude: fakeReviewer({ verdict: 'reject', read_canary: true, write_review: true }) })
        expect(result.leak).toBe(true)
        expect(result.exit_code).toBe(2)
        expect(readdirSync(join(tmp, 'notes'))).toEqual(['drafts.md'])
    })

    test('a reviewer that wrote no review file fails (exit 3)', async () => {
        const result = await runReviewer({ args, run_claude: fakeReviewer({ verdict: 'accept', read_canary: false, write_review: false }) })
        expect(result.review_file).toBeNull()
        expect(result.exit_code).toBe(3)
    })

    test('the canary is removed even when the reviewer crashes', async () => {
        const crash: RunClaude = async () => {
            throw new Error('killed')
        }
        await expect(runReviewer({ args, run_claude: crash })).rejects.toThrow('killed')
        expect(readdirSync(join(tmp, 'notes'))).toEqual(['drafts.md'])
    })

    test('refuses a reviewer name used before in this review', async () => {
        await mkdir(join(args.review, 'workspaces', args.name), { recursive: true })
        await expect(runReviewer({ args, run_claude: fakeReviewer({ verdict: 'accept', read_canary: false, write_review: true }) })).rejects.toThrow('already exists')
    })

    test('refuses a review root inside a git repo', async () => {
        Bun.spawnSync(['git', 'init', '-q', tmp])
        await expect(runReviewer({ args, run_claude: fakeReviewer({ verdict: 'accept', read_canary: false, write_review: true }) })).rejects.toThrow('inside a git repo')
    })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `timeout 300 bun test packages/engine/skills/luca-review/scripts/cold-reviewer.test.ts`
Expected: FAIL (`Cannot find module './cold-reviewer'`).

- [ ] **Step 3: Write the script**

Create `packages/engine/skills/luca-review/scripts/cold-reviewer.ts`:

```ts
#!/usr/bin/env bun
/**
 * Runs one cold or fresh reviewer for the `/luca-review` skill, so the
 * reviewer's independence is real, not role-played:
 *
 *   bun cold-reviewer.ts --review <review root> --name <s2-r1-maintainer>
 *       --brief <file> --give <path> [--give <path> ...]
 *       [--withheld <folder> ...] [--model <model>] [--max-budget-usd <n>]
 *
 * It makes `<review root>/workspaces/<name>/`, outside any git repo, and
 * copies in only the `--give` paths (the artifact and its sources) and an
 * empty `reviews/` folder. Then it starts a fresh `claude -p` session there
 * with the brief. The session has:
 * - no conversation of yours
 * - none of your CLAUDE.md, skills or plugins (`--setting-sources project`)
 * - no git snapshot
 * - no way to start or message other agents
 *
 * While it runs, each `--withheld` folder holds a canary file with a fresh
 * marker. If the marker shows up in the reviewer's session or files, the
 * reviewer saw withheld material.
 *
 * Afterwards it:
 * - copies the reviewer's `reviews/*.md` into the review root
 * - saves its session to `<review root>/sessions/<name>.jsonl`
 * - removes the canaries, even if the reviewer crashed
 * - prints one JSON line: the review file, the verdict, the leak check, the
 *   isolation, the Claude Code version, the cost and the time
 *
 * The isolation is always "instructed": nothing here stops a shell command
 * from reading other folders. Enforcing that takes a sandbox.
 *
 * Exit codes: 0 done; 1 bad arguments or setup; 2 the marker leaked;
 * 3 the reviewer wrote no review file.
 *
 * It imports nothing but Bun's and Node's own modules: it runs from
 * `~/.claude/skills/luca-review/`, where no packages are installed.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { cp, mkdir, rm } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

export const DEFAULT_MODEL = 'claude-opus-5-5'
export const DEFAULT_MAX_BUDGET_USD = 10
const TIMEOUT_MS = 60 * 60_000

export type ReviewerArgs = {
    review: string
    name: string
    brief: string
    give: string[]
    withheld: string[]
    model: string
    max_budget_usd: number
}

const parseCommandLine = (argv: string[]) =>
    parseArgs({
        args: argv,
        strict: true,
        options: {
            review: { type: 'string' },
            name: { type: 'string' },
            brief: { type: 'string' },
            give: { type: 'string', multiple: true },
            withheld: { type: 'string', multiple: true },
            model: { type: 'string' },
            'max-budget-usd': { type: 'string' },
        },
    }).values

/** Reads the command line: the arguments, or a message saying what is wrong. */
export const readArgs = ({ argv }: { argv: string[] }): ReviewerArgs | string => {
    let values: ReturnType<typeof parseCommandLine>
    try {
        values = parseCommandLine(argv)
    } catch (error) {
        return error instanceof Error ? error.message : String(error)
    }
    const { review, name, brief } = values
    const give = values.give ?? []
    const withheld = values.withheld ?? []
    const budget = Number(values['max-budget-usd'] ?? DEFAULT_MAX_BUDGET_USD)
    if (review === undefined) return 'missing --review <review root>'
    if (name === undefined || !/^s[23]-[a-z0-9]+-[a-z0-9-]+$/.test(name)) {
        return '--name must look like s2-r1-maintainer: the stage, a unique id, and a persona'
    }
    if (brief === undefined || !existsSync(brief)) return 'missing --brief <file>, or it does not exist'
    if (give.length === 0) return 'give the reviewer at least one --give <path>: the artifact and its sources'
    const missing = [...give, ...withheld].filter((path) => !existsSync(path))
    if (missing.length > 0) return `these paths do not exist: ${missing.join(', ')}`
    const not_folders = withheld.filter((path) => !statSync(path).isDirectory())
    if (not_folders.length > 0) return `--withheld takes folders: ${not_folders.join(', ')}`
    if (!Number.isFinite(budget) || budget <= 0) return '--max-budget-usd must be a positive number'
    return {
        review: resolve(review),
        name,
        brief: resolve(brief),
        give: give.map((path) => resolve(path)),
        withheld: withheld.map((path) => resolve(path)),
        model: values.model ?? DEFAULT_MODEL,
        max_budget_usd: budget,
    }
}

/** A fresh marker, unlikely to appear anywhere by chance. */
export const newMarker = (): string =>
    `LR-CANARY-${crypto.randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`

export const canaryName = ({ name }: { name: string }): string => `.luca-review-canary-${name}.md`

export const canaryText = ({ marker }: { marker: string }): string =>
    `Withheld from reviewers: a /luca-review canary.\n\nMarker: ${marker}\n`

/** The reviewer's flags. The prompt goes in on stdin. */
export const reviewerArgs = ({
    model,
    max_budget_usd,
}: {
    model: string
    max_budget_usd: number
}): string[] => [
    '-p',
    '--disallowedTools',
    'Agent',
    'Task',
    'SendMessage',
    '--model',
    model,
    '--setting-sources',
    'project',
    '--permission-mode',
    'bypassPermissions',
    '--output-format',
    'stream-json',
    '--verbose',
    '--max-budget-usd',
    String(max_budget_usd),
]

/** The brief, then what the reviewer holds and where its review goes. */
export const reviewerPrompt = ({
    brief,
    given,
    name,
}: {
    brief: string
    given: string[]
    name: string
}): string =>
    `${brief.trim()}\n\nYour workspace is the current folder. It holds only what you were given: ${given
        .map((item) => `\`${item}\``)
        .join(', ')}, and an empty \`reviews/\` folder. Save your review as \`reviews/${name}.md\`.\n`

/** The verdict a review ends with, from its last few lines, or null. */
export const verdictOf = ({ text }: { text: string }): 'accept' | 'needs-info' | 'reject' | null => {
    const lines = text.trim().split('\n').filter((line) => line.trim() !== '').slice(-5).reverse()
    for (const line of lines) {
        const found = /\b(accept|needs-info|reject)\b/i.exec(line)?.[1]?.toLowerCase()
        if (found === 'accept' || found === 'needs-info' || found === 'reject') return found
    }
    return null
}

export type RunClaude = (input: {
    cwd: string
    args: string[]
    stdin_text: string
    env: Record<string, string | undefined>
}) => Promise<{ text: string; exit_code: number }>

/** Runs the real `claude`, killed after an hour. */
export const realRunClaude: RunClaude = async ({ cwd, args, stdin_text, env }) => {
    const proc = Bun.spawn(['claude', ...args], {
        cwd,
        env,
        stdin: new TextEncoder().encode(stdin_text),
        stdout: 'pipe',
        stderr: 'inherit',
    })
    const timer = setTimeout(() => proc.kill(), TIMEOUT_MS)
    const text = await new Response(proc.stdout).text()
    const exit_code = await proc.exited
    clearTimeout(timer)
    return { text, exit_code }
}

export type ReviewerResult = {
    name: string
    review_file: string | null
    verdict: 'accept' | 'needs-info' | 'reject' | null
    leak: boolean
    isolation: 'instructed'
    claude_code_version: string | null
    cost_usd: number | null
    wall_ms: number
    exit_code: 0 | 2 | 3
}

const insideGit = (dir: string): boolean =>
    Bun.spawnSync(['git', '-C', dir, 'rev-parse', '--is-inside-work-tree']).exitCode === 0

const filesUnder = (dir: string): string[] =>
    existsSync(dir)
        ? readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
              entry.isDirectory()
                  ? filesUnder(join(dir, entry.name))
                  : entry.isFile()
                    ? [join(dir, entry.name)]
                    : []
          )
        : []

const parseLine = (line: string): unknown => {
    try {
        return JSON.parse(line)
    } catch {
        return null
    }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null

/** The Claude Code version and the cost, from a stream-json session. */
const sessionFacts = (text: string): { claude_code_version: string | null; cost_usd: number | null } => {
    let claude_code_version: string | null = null
    let cost_usd: number | null = null
    for (const line of text.split('\n')) {
        const event = parseLine(line)
        if (!isRecord(event)) continue
        if (event.type === 'system' && event.subtype === 'init' && typeof event.claude_code_version === 'string') {
            claude_code_version = event.claude_code_version
        }
        if (event.type === 'result' && typeof event.total_cost_usd === 'number') {
            cost_usd = event.total_cost_usd
        }
    }
    return { claude_code_version, cost_usd }
}

/** Runs one reviewer; see the comment at the top of this file. */
export const runReviewer = async ({
    args,
    run_claude,
}: {
    args: ReviewerArgs
    run_claude: RunClaude
}): Promise<ReviewerResult> => {
    const ws = join(args.review, 'workspaces', args.name)
    if (existsSync(ws)) {
        throw new Error(`${ws} already exists: reviewer names must be unique across the review`)
    }
    const given = args.give.map((path) => basename(path))
    if (new Set(given).size !== given.length) {
        throw new Error(`two --give paths share a name: ${given.join(', ')}`)
    }
    await mkdir(join(ws, 'reviews'), { recursive: true })
    if (insideGit(ws)) {
        await rm(ws, { recursive: true, force: true })
        throw new Error(
            `${ws} is inside a git repo, so the reviewer would see its history: set LUCA_REVIEWS_DIR to a folder outside any repo`
        )
    }
    for (const path of args.give) {
        await cp(path, join(ws, basename(path)), { recursive: true })
    }
    const marker = newMarker()
    const canaries = args.withheld.map((dir) => join(dir, canaryName({ name: args.name })))
    const started = performance.now()
    try {
        for (const canary of canaries) await Bun.write(canary, canaryText({ marker }))
        const run = await run_claude({
            cwd: ws,
            args: reviewerArgs({ model: args.model, max_budget_usd: args.max_budget_usd }),
            stdin_text: reviewerPrompt({ brief: readFileSync(args.brief, 'utf8'), given, name: args.name }),
            env: { ...process.env, CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS: '1' },
        })
        await mkdir(join(args.review, 'sessions'), { recursive: true })
        await Bun.write(join(args.review, 'sessions', `${args.name}.jsonl`), run.text)
        const reviews = filesUnder(join(ws, 'reviews')).filter((file) => file.endsWith('.md'))
        for (const file of reviews) await cp(file, join(args.review, basename(file)))
        const own = join(args.review, `${args.name}.md`)
        const first = reviews[0]
        const review_file = existsSync(own) ? own : first === undefined ? null : join(args.review, basename(first))
        const leak =
            run.text.includes(marker) ||
            filesUnder(ws).some((file) => readFileSync(file, 'utf8').includes(marker))
        const facts = sessionFacts(run.text)
        return {
            name: args.name,
            review_file,
            verdict: review_file === null ? null : verdictOf({ text: readFileSync(review_file, 'utf8') }),
            leak,
            isolation: 'instructed',
            claude_code_version: facts.claude_code_version,
            cost_usd: facts.cost_usd,
            wall_ms: Math.round(performance.now() - started),
            exit_code: leak ? 2 : review_file === null ? 3 : 0,
        }
    } finally {
        for (const canary of canaries) await rm(canary, { force: true })
    }
}

if (import.meta.main) {
    const args = readArgs({ argv: Bun.argv.slice(2) })
    if (typeof args === 'string') {
        console.error(args)
        process.exit(1)
    }
    try {
        const result = await runReviewer({ args, run_claude: realRunClaude })
        console.log(JSON.stringify(result))
        process.exit(result.exit_code)
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error))
        process.exit(1)
    }
}
```

- [ ] **Step 4: Run the script's tests to see them pass**

Run: `timeout 300 bun test packages/engine/skills/luca-review/scripts/cold-reviewer.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Point the skill's text at the script, test first**

Add to `skill-text.test.ts`:

```ts
    test('D5: it starts cold and fresh reviewers with the cold-reviewer script', async () => {
        expect(skill).toContain('`bun ${CLAUDE_SKILL_DIR}/scripts/cold-reviewer.ts`')
        expect(skill.match(/cold-reviewer\.ts/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
        expect(await Bun.file(join(DIR, 'scripts', 'cold-reviewer.ts')).exists()).toBe(true)
        expect(all).toContain('## The cold-reviewer script')
    })
```

Run: `timeout 300 bun test packages/engine/skills/luca-review/skill-text.test.ts`
Expected: FAIL (the D5 test).

Then make these edits:

| File | Find | Replace |
|---|---|---|
| `SKILL.md` | `has notes for Claude Code.` (in "Independence must be real") | ``has notes for Claude Code. In Claude Code, start each cold and fresh reviewer with `bun ${CLAUDE_SKILL_DIR}/scripts/cold-reviewer.ts`: it runs the reviewer as a fresh `claude -p` session in a new folder outside the repository, holding only what you pass it, runs the marker test for you, and records the isolation as instructed (usage in [references/tool-notes.md](references/tool-notes.md)).`` |
| `SKILL.md` | `2. **Dispatch each as an independent agent** with the artifact,` | ``2. **Dispatch each as an independent agent** (in Claude Code, with `cold-reviewer.ts`) with the artifact,`` |
| `SKILL.md` | `1. **Dispatch 2–3 brand-new reviewers,**` | ``1. **Dispatch 2–3 brand-new reviewers,** each with `cold-reviewer.ts`,`` |

In `references/tool-notes.md`, add this section right before the final links line. It is our own text:

````markdown
## The cold-reviewer script

In Claude Code, `scripts/cold-reviewer.ts` (in this skill's folder; SKILL.md gives its full path) starts one reviewer the way the bullets above describe:

```sh
bun <skill folder>/scripts/cold-reviewer.ts \
  --review <review root> --name s2-r1-maintainer --brief <brief file> \
  --give <artifact> --give <sources folder> \
  --withheld <drafts or notes folder> [--model claude-opus-5-5] [--max-budget-usd 10]
```

- **The workspace:** a new folder, `<review root>/workspaces/<name>/`, holding only the `--give` paths and an empty `reviews/`. It refuses a folder inside a git repo, and a name used before in the review.
- **The session:** a fresh `claude -p` with `--setting-sources project`, so none of your CLAUDE.md, skills or plugins load. `CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS=1` drops the git snapshot. `Agent`, `Task` and `SendMessage` are denied.
- **The marker test:** while it runs, each `--withheld` folder holds a canary file with a fresh marker. If the marker shows up in the reviewer's session or files, it exits 2. The canaries are removed afterwards, even after a crash.
- **Afterwards:** it copies the reviewer's `reviews/*.md` into the review root, saves its session to `<review root>/sessions/<name>.jsonl`, and prints one JSON line: the review file, the verdict, the leak check, the isolation, the Claude Code version, the cost and the time. It exits 3 when the reviewer wrote no review.
- **The limit:** the isolation is *instructed*, not enforced. The reviewer runs with `bypassPermissions`, so its shell can still read other folders. For enforced isolation, or for untrusted code, run it in a sandbox, or tell the reviewer not to run code, as the principles say.

````

Run: `timeout 300 bun test packages/engine/skills/luca-review`
Expected: PASS.

- [ ] **Step 6: Try the script once for real, cheaply**

```bash
R=$(mktemp -d /tmp/lr-cold-try.XXXX)
mkdir -p $R/notes && echo "draft" > $R/notes/d.md && echo "The sky is green." > $R/artifact.md
echo "You are a careful reader. Check artifact.md. Write a short review ending with one verdict line: accept, needs-info, or reject." > $R/brief.md
LUCA_REVIEWS_DIR=$R/reviews bun packages/engine/skills/luca-review/scripts/cold-reviewer.ts --review $R/reviews/try --name s2-r1-reader --brief $R/brief.md --give $R/artifact.md --withheld $R/notes --model claude-haiku-4-5-20251001 --max-budget-usd 0.5
echo "exit=$?"; ls $R/reviews/try $R/notes
```

Expected:
- one JSON line with `"leak":false` and a verdict
- `exit=0`
- `$R/reviews/try` holds `s2-r1-reader.md`, `sessions` and `workspaces`
- `$R/notes` holds only `d.md`

- [ ] **Step 7: Type check, lint, commit**

```bash
bunx --bun tsc --noEmit && bun run lint
git add packages/engine/skills/luca-review
git commit -m "feat(engine): luca-review D5: a script that starts truly cold reviewers

cold-reviewer.ts runs each reviewer as a fresh claude -p in a new folder
outside the repo, with only what it's given, and runs the marker test.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 19: D6, the name, the description and the README

**Files:**
- Modify: `packages/engine/skills/luca-review/SKILL.md`, `references/*.md`, `README.md`
- Modify: `packages/engine/skills/luca-review/skill-text.test.ts`

- [ ] **Step 1: Test first**

Add to `skill-text.test.ts`:

```ts
    test('D6: its frontmatter names it luca-review, says when to use it, and takes a level and a target', () => {
        const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(skill)?.[1] ?? ''
        expect(frontmatter).toContain('name: luca-review\n')
        expect(frontmatter).toMatch(/^description: .{300,}$/m)
        expect(frontmatter).toMatch(/^when_to_use: .+$/m)
        expect(frontmatter).toContain('argument-hint: "[level] [what to review]"')
        for (const words of [
            '/luca-review [level] [what to review]',
            "a run's pull request",
            'double-check what an agent says it did',
        ]) {
            expect(frontmatter).toContain(words)
        }
    })

    test('D6: it calls itself luca-review, naming agent-review only in the credit', async () => {
        const readme = await Bun.file(join(DIR, 'README.md')).text()
        for (const text of [all, readme]) {
            for (const line of text.split('\n').filter((l) => l.includes('agent-review'))) {
                expect(line).toContain('github.com/captivus/agent-review')
            }
        }
        expect(readme).toContain('Use luca-review for the full procedure')
        expect(readme).toContain('`luca init` and `luca upgrade`')
    })
```

Run: `timeout 300 bun test packages/engine/skills/luca-review`
Expected: FAIL (both D6 tests).

- [ ] **Step 2: The frontmatter**

In `SKILL.md`'s frontmatter:
- Change `name: agent-review` to `name: luca-review`.
- Keep his `description` text as it is, and append this to the end of the same line, after a space:

```text
In a Luca repo, use it to check a run's pull request before you merge it, a spec before a run, and a stuck ticket's diagnosis or a reviewer's finding before anyone acts on it. Use it for `/luca-review [level] [what to review]`, and whenever someone asks to review, verify, fact-check or double-check what an agent says it did, even if they don't name the skill.
```

- Keep `when_to_use` and `effort` as they are.
- Add the line `argument-hint: "[level] [what to review]"` right after `when_to_use`.

- [ ] **Step 3: The name in the text**

```bash
grep -n "agent-review" packages/engine/skills/luca-review/SKILL.md packages/engine/skills/luca-review/references/*.md
```

Replace every `agent-review` with `luca-review`, except in the credit line (the one with `github.com/captivus/agent-review`). That includes `[agent-review](../SKILL.md)` and the install paths in `tool-notes.md`.

In `references/tool-notes.md`, replace the whole `## Install options` section (the heading and its paragraphs, up to the next `##`) with:

```markdown
## Install options

Luca installs this skill: `luca init` and `luca upgrade` copy it to `~/.claude/skills/luca-review/`, and `luca doctor --fix` repairs a stale copy. Keep `SKILL.md`, `references/` and `scripts/` together.

As shipped, Claude Code can invoke this skill by itself, and its `effort: high` overrides session effort while it is active. To run it only on request, set `disable-model-invocation: true` in the installed copy's frontmatter. The next `luca upgrade` overwrites that copy, so set it again after an upgrade. The README's snippet keeps the self-audit on either way. For claude.ai or Skills API uploads, remove the `when_to_use` and `effort` fields from frontmatter.
```

- [ ] **Step 4: The README**

Replace `packages/engine/skills/luca-review/README.md` with this. It is our own text, plus his self-audit snippet, renamed:

```markdown
# luca-review

Luca's review skill checks an agent's work at the level the stakes need:
- **Level 1:** the agent hands back an artifact you can check, or names its failure.
- **Level 2:** two agents do the same job, and every difference is settled against the source.
- **Level 3:** adversarial review: a self-audit, cold reviewers, then fresh eyes.

`SKILL.md` has the method, `references/` the templates, and `scripts/cold-reviewer.ts` starts truly independent reviewers.

Adapted from Corey Gallon's [agent-review](https://github.com/captivus/agent-review) 1.0.0, under the MIT license in `LICENSE`. Each change from his text passed the eval in the Luca repo's `evals/luca-review/`.

## Install

`luca init` and `luca upgrade` install it to `~/.claude/skills/luca-review/`. Ask for it as `/luca-review`, or describe the stakes:

> Use Level 1 when you hand the migration to an agent, and make it prove the migration ran.

> Run Level 3 on the pull request this run opened, before I merge it.

## Keep the self-audit on

Add this to your `CLAUDE.md` or `AGENTS.md`, so your agent checks its claims even when the skill isn't loaded:

    Before stating a claim as a conclusion, classify it as measured, verified
    against source, inferred, or assumed. Test consequential gaps when possible;
    otherwise label them as hypotheses. Use luca-review for the full procedure
    when the stakes require it.
```

- [ ] **Step 5: Run the tests, and check the eval sees the new name**

```bash
timeout 300 bun test packages/engine/skills/luca-review
bun evals/luca-review/run-eval.ts --round dry3 --case 1-wrong-finding --arm B --dry-run
```

Expected: PASS. The dry run's prompt says "Use the luca-review skill".

- [ ] **Step 6: Commit**

```bash
git add packages/engine/skills/luca-review
git commit -m "feat(engine): luca-review D6: its own name, Luca triggers, and README

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Phase 3: run the eval

### Task 20: The first round, the decision, and the results (STOP)

Do this only after the owner's go-ahead from Task 12.

**Files:**
- Create: `evals/luca-review/results/r1.md` (written by `report.ts`)

- [ ] **Step 1: Write down the commit of each change**

```bash
git log --format='%h %s' origin/main..HEAD -- packages/engine/skills/luca-review
```

Copy the D1–D6 lines into your notes. You need them to bisect.

- [ ] **Step 2: Run the first pass in the background (15 runs, one at a time)**

```bash
mkdir -p ~/.local/state/luca/evals
nohup bun evals/luca-review/run-eval.ts --round r1 > ~/.local/state/luca/evals/r1.log 2>&1 &
```

Watch `~/.local/state/luca/evals/r1.log`. It prints one line per run, and can take hours. Stop it (`kill %1`) if a run reports an invalid reason. Fix the cause, then rerun only that run with `--case <id> --arm <x> --rep 2`.

- [ ] **Step 3: The trigger test**

```bash
bun evals/luca-review/run-triggers.ts --round r1 --arm A
bun evals/luca-review/run-triggers.ts --round r1 --arm B
```

Expected: 10 lines each.

- [ ] **Step 4: The first report**

Run: `bun evals/luca-review/report.ts --round r1`
Expected: the table, the decision, the trigger test, and any runs left out.

- [ ] **Step 5: A person checks every grade**

For each `~/.local/state/luca/evals/r1/<run>/out/`, read `grade.json` next to `grader-prompt.md`. Where a grade is wrong, fix `grade.json`, and add `"person_note": "<what was wrong>"`. For a run with `grade-error.txt`, run `bun evals/luca-review/run-eval.ts --round r1 --case <id> --arm <x> --grade-only`. Then run the report again.

- [ ] **Step 6: Second runs where A and B disagree**

For each case in the report's "A and B disagree on" line:

```bash
bun evals/luca-review/run-eval.ts --round r1 --case <id> --arm A --rep 2
bun evals/luca-review/run-eval.ts --round r1 --case <id> --arm B --rep 2
```

Check those grades too (Step 5), then run the report again.

- [ ] **Step 7: If B does not ship, find the change that hurt**

The changes each case covers (from the spec):

| Case | Changes that touch it |
|---|---|
| 1 | D1, D3, D6 |
| 2 | D1, D6 |
| 3 | D1, D2, D3, D4, D5, D6 |
| 4 | D1, D2, D3, D4, D5, D6 |
| 5 | D1, D2, D3, D4, D5, D6 |
| leaks | D2, D5 |
| triggers | D6 |

For each change that touches a case B lost, newest first:

```bash
git revert --no-commit <change commit>
bun evals/luca-review/run-eval.ts --round r1-no-d<n> --case <id> --arm B
bun evals/luca-review/report.ts --round r1-no-d<n>
```

- **If B does better without the change:** keep the revert. Fix the guard test's matching D-test (drop it) and commit: `revert(engine): luca-review drops D<n>, which hurt case <id> in the eval`.
- **If not:** run `git revert --abort`.

To compare, run the report on a round that holds both rows. Or set the two numbers side by side from each round's `row.json`. Write down every bisect run.

- [ ] **Step 8: Save the results**

```bash
bun evals/luca-review/report.ts --round r1
git add evals/luca-review/results/r1.md
git commit -m "chore(repo): luca-review eval round 1 results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 9: Report to the owner, and STOP**

Tell the owner, in plain words:
- does B ship, and why
- which cases were too easy
- what any second runs and bisects found
- which changes were kept and which reverted
- the total cost of the round

Then discuss before Task 21.

---

## Phase 4: ship

### Task 21: Package, document, changeset, and the pull request

Do this only after the owner says to ship.

**Files:**
- Modify: `packages/luca/pack.test.ts:377-380`
- Modify: `packages/luca/README.md` (lines 41–43, and line 95)
- Modify: `packages/luca/scripts/copy-sources.ts:11`
- Create: `.changeset/luca-review-skill.md`

- [ ] **Step 1: The pack test, first**

In `packages/luca/pack.test.ts`, after `expect(files).toContain('luca-retro/scripts/retro-summary.ts')`, add:

```ts
            expect(files).toContain('luca-review/SKILL.md')
            expect(files).toContain('luca-review/LICENSE')
            expect(files).toContain('luca-review/references/level-3-reviewer-prompts.md')
            expect(files).toContain('luca-review/scripts/cold-reviewer.ts')
            expect(files).not.toContain('luca-review/scripts/cold-reviewer.test.ts')
```

Run: `timeout 900 bun test packages/luca/pack.test.ts`
Expected: PASS. Packing already copies the whole skills folder, without tests. If it fails, read `packages/luca/scripts/copy-sources.ts` and fix the copy, not the test.

- [ ] **Step 2: The docs**

In `packages/luca/README.md`, after the paragraph that starts ``After a run, type `/luca-retro` `` (line 43), add:

```markdown
Before you trust what a run, or any agent, says it did, type `/luca-review`: it checks the work at the level the stakes need. It can make the agent hand back proof, have two agents check each other against the source, or have cold reviewers who never saw the drafts try to tear the work apart. It is Corey Gallon's agent-review, adapted for Luca, under the MIT license.
```

On line 95, change ``Luca's own Claude Code skills, `luca-unstick` and `luca-retro`, `` to ``Luca's own Claude Code skills, `luca-unstick`, `luca-retro` and `luca-review`, ``.

In `packages/luca/scripts/copy-sources.ts` line 11, change ``(`luca-unstick`, `luca-retro`)`` to ``(`luca-unstick`, `luca-retro`, `luca-review`)``.

- [ ] **Step 3: The changeset**

Create `.changeset/luca-review-skill.md`:

```markdown
---
"@luca/engine": patch
---

New `/luca-review` skill, installed by `luca init` and `luca upgrade`. It checks an agent's work at the level the stakes need: a checkable artifact or a named failure, two agents checked against the source, or adversarial review with cold reviewers and fresh eyes. It is Corey Gallon's agent-review (MIT), adapted for Luca. Each change from his text passed an eval, which lives in `evals/luca-review/`.
```

- [ ] **Step 4: All the gates**

```bash
timeout 900 bun test packages
timeout 300 bun test evals/luca-review
bunx --bun tsc --noEmit
bunx --bun tsc --noEmit -p packages/board
bun run lint
bunx changeset status
```

Expected: all pass. `changeset status` lists `@luca/engine`, `@luca/board` and `@alecsibilia/luca`, the fixed group.

- [ ] **Step 5: Commit**

```bash
git add packages/luca/pack.test.ts packages/luca/README.md packages/luca/scripts/copy-sources.ts .changeset/luca-review-skill.md
git commit -m "feat(engine): ship /luca-review with luca init and upgrade

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Ask the owner, then push and open the pull request**

Ask: "Push `feat/luca-review` and open the pull request?" Only after a yes:

```bash
git push -u origin feat/luca-review
gh pr create --title "feat(engine): /luca-review, an eval-checked three-level review skill" --body "$(cat <<'EOF'
## Summary

- New `/luca-review` skill: Corey Gallon's agent-review (MIT), adapted for Luca, with his LICENSE and credit.
- Each change from his text (D1–D6) was its own commit, and passed an eval against his original (setup A) and no skill (setup C). Results: `evals/luca-review/results/r1.md`.
- `evals/luca-review/` stays in the repo, so the skill can be checked again after any edit.

## Test plan

- [ ] `bun test packages` and `bun test evals/luca-review`
- [ ] Both type checks and lint
- [ ] `bunx changeset status`
- [ ] Read `evals/luca-review/results/r1.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Never merge it yourself: the owner merges, with `gh pr merge <n> --squash --admin --delete-branch`.
