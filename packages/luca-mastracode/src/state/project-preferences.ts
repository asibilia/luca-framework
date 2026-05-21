/**
 * Project preferences schema.
 *
 * SECURITY NOTE: Content of this file is repo-local but is DERIVED FROM GIT
 * OUTPUT during luca-init probe (branch names, commit messages, PR titles).
 * In repos cloned from external sources, those strings are UNTRUSTED.
 *
 * The schema enforces a character allowlist on every free-form field that
 * flows into the `muninnInstruction` string consumed by the LLM agent (see
 * tools/project-preferences.ts buildMuninnInstruction). Do not relax these
 * regexes / max-lengths without a security review — they are the blast-radius
 * cap on prompt-injection from a malicious git history.
 *
 * See REVIEW-1.md MUST-FIX-2/3 for the original finding.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { z } from 'zod'

import { atomicWriteSync } from '../util/atomic-write.js'
import { planningRoot } from '../util/phase-paths.js'

export const SectionName = z.enum([
    'branching',
    'commits',
    'pr',
    'release',
    'tracker',
])
export type SectionName = z.infer<typeof SectionName>

/**
 * Character allowlist for free-form preference strings that flow into the
 * `muninnInstruction` text consumed by the LLM agent. Permits letters,
 * digits, spaces and tabs, and the structural punctuation needed for
 * branch / commit / PR title templates. Excludes quote chars, backticks,
 * line terminators (CR/LF/FF/VT), other control chars, and shell
 * metacharacters.
 *
 * NOTE: we intentionally use ` \t` instead of `\s`. `\s` permits `\n`,
 * `\r`, `\f`, `\v`, which would let an attacker inject a fresh line into
 * the JSON blob handed to the LLM. PR #227 Copilot feedback.
 *
 * Phase C addition: `#` is allowed because issue-link templates
 * (`Closes #{issue}`, `Refs #N`) and conventional commit-trailer
 * prefixes (`Closes #`) require it. `#` is not a control char nor a
 * shell metachar that closes the JSON blob — it stays inside string
 * literals and the 64-char cap bounds blast radius.
 */
const SAFE_FREEFORM = z
    .string()
    .max(64)
    .regex(/^[\w #\t{}/,.():-]*$/)

/**
 * Zod refinement: source string must compile as a JS RegExp AND must not
 * contain nested quantifiers, which can produce catastrophic backtracking
 * (ReDoS) when iterated against attacker-controlled input.
 *
 * NOTE: nested quantifiers prohibited (ReDoS guard). Patterns like
 * `(a+)+`, `(.+)*`, `(\\d{2,}){2,}` are rejected. Length cap alone is
 * insufficient — worst-case patterns are short.
 *
 * Used for branchTypes[].match and BaseRule.pattern.
 */
const RegexSource = z
    .string()
    .min(1)
    .max(128)
    .refine(
        (v) => {
            try {
                new RegExp(v)
                return true
            } catch {
                return false
            }
        },
        { message: 'must be a valid regex source' }
    )
    .refine(
        // Detects a quantifier-terminator (+ * }) immediately followed by ')'
        // and then another quantifier-starter (+ * {). This catches the
        // canonical catastrophic-backtracking shapes `(a+)+`, `(.+)*`,
        // `(\d{2,}){2,}` while leaving non-nested patterns like `\d+`,
        // `.*`, and `\d{2,}` untouched.
        (v) => !/[+*}]\)[+*{]/.test(v),
        { message: 'nested quantifiers prohibited (ReDoS guard)' }
    )

/**
 * BaseRule: how to resolve a base or PR-base branch for a branch-type rule.
 *  - kind: 'static'                       → use `value`
 *  - kind: 'current-branch-if-matches'    → use currentBranch if it matches `pattern`, else `fallback`
 *  - kind: 'ask'                          → user must confirm at apply time; resolver sets needsConfirmation=true and uses `fallback` if present
 */
const BaseRule = z.object({
    kind: z.enum(['static', 'current-branch-if-matches', 'ask']),
    value: SAFE_FREEFORM.optional(),
    pattern: RegexSource.optional(),
    fallback: z.union([SAFE_FREEFORM, z.literal('ask')]).optional(),
})

/**
 * BranchTypeRule: one entry in `branchTypes[]`.
 * NOTE: rules are evaluated in declared order, first-match wins.
 *       A catch-all `^.*$` at index 0 hijacks all tickets — author rules
 *       most-specific-first.
 */
const BranchTypeRule = z.object({
    match: RegexSource,
    template: SAFE_FREEFORM,
    base: BaseRule,
    prBase: BaseRule,
    role: z.enum(['feature', 'release', 'rc']).optional(),
})

const BranchingSection = z
    .object({
        types: z
            .array(SAFE_FREEFORM)
            .default([
                'feat',
                'fix',
                'refactor',
                'chore',
                'docs',
                'test',
                'style',
            ]),
        template: SAFE_FREEFORM.default('{type}/{issue}-{slug}'),
        defaultBranch: SAFE_FREEFORM.default('main'),
        guardedBranches: z.array(SAFE_FREEFORM).min(1).default(['main']),
        branchTypes: z.array(BranchTypeRule).optional(),
        fallback: BranchTypeRule.optional(),
        confirmBaseBeforeCreate: z.boolean().default(false),
    })
    .prefault({})

const CommitsSection = z
    .object({
        convention: z.enum(['conventional', 'none']).default('conventional'),
        scopes: z.array(SAFE_FREEFORM).default([]),
        /**
         * Allowed commit-message types (e.g. ['feat','fix','refactor',...]).
         * Distinct from `branching.types` which governs branch-name prefix:
         * branching.types and commits.types MAY differ for squash-merge repos
         * where every PR squashes to a single `feat:` commit regardless of
         * branch type. When commits.types is unset, prose may fall back to
         * branching.types.
         */
        types: z.array(SAFE_FREEFORM).max(20).optional(),
        /** Commit-message trailer conventions. */
        trailers: z
            .object({
                coAuthor: z.boolean(),
                issueRef: SAFE_FREEFORM,
            })
            .optional(),
        /** Conventional max length for the commit subject line (default 72). */
        subjectMaxLength: z.number().int().min(20).max(200).default(72),
    })
    .prefault({})

const PrSection = z
    .object({
        titleFormat: SAFE_FREEFORM.default('{type}({scope}): {description}'),
        baseBranch: SAFE_FREEFORM.default('main'),
        /**
         * Preferred PR title template — supersedes `titleFormat` when present.
         * `titleFormat` is retained for backward compatibility; consumers may
         * still set only `titleFormat`. When both are set, `titleTemplate`
         * wins. Renaming `titleFormat → titleTemplate` is a future cleanup.
         *
         * Tokens are consumer-defined (e.g. {type}, {scope}, {version},
         * {issue}, {description}). The framework does not interpret them;
         * skills/instructions render them in their own template engine.
         */
        titleTemplate: SAFE_FREEFORM.optional(),
        /** Up to 5 example titles for the agent to pattern-match against. */
        titleExamples: z.array(SAFE_FREEFORM).max(5).optional(),
        /** Patterns rejected in PR titles (e.g. (#issue) misuse). */
        forbidden: z
            .array(
                z.object({
                    pattern: RegexSource,
                    reason: SAFE_FREEFORM,
                })
            )
            .max(10)
            .optional(),
        /** PR body template key (e.g. 'what-why-how-testplan'). Skill renders. */
        bodyTemplate: SAFE_FREEFORM.optional(),
        /** Whether PRs default to draft status. */
        draftByDefault: z.boolean().optional(),
    })
    .prefault({})

const ReleaseSection = z
    .object({
        tool: z
            .enum(['changesets', 'none', 'semantic-release'])
            .default('none'),
        versionBump: z
            .record(z.string(), z.enum(['major', 'minor', 'patch']))
            .default({
                feat: 'minor',
                fix: 'patch',
                chore: 'patch',
                refactor: 'patch',
            }),
    })
    .prefault({})

const TrackerSection = z
    .object({
        kind: z.enum(['github', 'linear', 'jira', 'none']).default('github'),
        issuePrefix: SAFE_FREEFORM.default(''),
        /**
         * Issue-link template used in PR bodies (e.g. 'Closes #{issue}',
         * 'Fixes JIRA-{issue}'). Distinct from `commits.trailers.issueRef`
         * which is the commit-message trailer prefix; consumers may use the
         * same string for both, but they are conceptually independent.
         */
        linkFormat: SAFE_FREEFORM.optional(),
    })
    .prefault({})

export const ProjectPreferencesSchema = z
    .object({
        schemaVersion: z.literal(1).default(1),
        branching: BranchingSection,
        commits: CommitsSection,
        pr: PrSection,
        release: ReleaseSection,
        tracker: TrackerSection,
    })
    .prefault({})

export type ProjectPreferences = z.infer<typeof ProjectPreferencesSchema>

/**
 * Re-exports for fixture/test use. Suffix convention matches
 * `ProjectPreferencesSchema` so consumers can spot Zod schemas at a glance.
 */
export const RegexSourceSchema = RegexSource
export const BaseRuleSchema = BaseRule
export const BranchTypeRuleSchema = BranchTypeRule

/** Hardcoded defaults matching today's behavior. Returned by consult() when fallback:true and no prefs file. */
export const DEFAULT_PREFERENCES: ProjectPreferences =
    ProjectPreferencesSchema.parse({})

/** `.planning/preferences.json` — repo-local cache of project preferences. */
export function PREFERENCES_PATH(): string {
    return join(planningRoot(), 'preferences.json')
}

/** Load preferences from .planning/preferences.json. Returns null if file missing/invalid. */
export function loadProjectPreferences(): ProjectPreferences | null {
    const p = PREFERENCES_PATH()
    if (!existsSync(p)) return null
    try {
        const raw = JSON.parse(readFileSync(p, 'utf-8'))
        return ProjectPreferencesSchema.parse(raw)
    } catch {
        return null
    }
}

/** Write preferences to .planning/preferences.json (atomic). */
export function writeProjectPreferences(prefs: ProjectPreferences): void {
    const p = PREFERENCES_PATH()
    atomicWriteSync(p, JSON.stringify(prefs, null, 2) + '\n')
}
