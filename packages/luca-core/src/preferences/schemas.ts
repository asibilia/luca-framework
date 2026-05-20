/**
 * Project preferences schema.
 *
 * The preferences object lives inside .luca/config.json under the
 * `preferences` key. It captures repo-local conventions (branch naming,
 * commit format, PR templates, release tooling, issue tracker) so the
 * agent emits work that matches the project's existing style.
 *
 * SECURITY NOTE: Preference values flow into instruction strings handed
 * to the LLM agent (commit-message templates, branch-name templates, PR
 * titles). In repos cloned from external sources, those values are
 * UNTRUSTED — the strings can be seeded from git history. The schema
 * enforces a character allowlist on every free-form field that feeds
 * into agent instructions. Do not relax these regexes or max-lengths
 * without a security review — they are the blast-radius cap on
 * prompt-injection from a malicious source.
 *
 * Ported from packages/luca-mastracode/src/state/project-preferences.ts
 * during the 5B.3 batch. The shape is identical so existing fixtures
 * port cleanly; the difference is the storage location
 * (.planning/preferences.json → .luca/config.json#preferences).
 */
import { z } from 'zod'

/**
 * Character allowlist for free-form preference strings that flow into
 * agent instructions. Permits letters, digits, spaces and tabs, and the
 * structural punctuation needed for branch / commit / PR title
 * templates. Excludes quote chars, backticks, line terminators (CR/LF/FF/VT),
 * other control chars, and shell metacharacters.
 *
 * Intentionally uses ` \t` instead of `\s` — `\s` would permit `\n`,
 * `\r`, `\f`, `\v`, letting an attacker inject a fresh line into the
 * JSON blob handed to the LLM. `#` is allowed because issue-link
 * templates (`Closes #{issue}`) and conventional commit-trailer prefixes
 * (`Closes #`) require it. The 64-char cap bounds blast radius.
 */
export const SAFE_FREEFORM_SCHEMA = z
    .string()
    .max(64)
    .regex(/^[\w #\t{}/,.():\-]*$/)

/**
 * Zod refinement: source string must compile as a JS RegExp AND must not
 * contain nested quantifiers, which can produce catastrophic
 * backtracking (ReDoS) when iterated against attacker-controlled input.
 *
 * Detects a quantifier-terminator (+ * }) immediately followed by `)`
 * and then another quantifier-starter (+ * {). Catches `(a+)+`, `(.+)*`,
 * `(\d{2,}){2,}` while leaving non-nested patterns like `\d+`, `.*`, and
 * `\d{2,}` untouched. Length cap alone is insufficient — worst-case
 * patterns are short.
 */
export const REGEX_SOURCE_SCHEMA = z
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
        { message: 'must be a valid regex source' },
    )
    .refine((v) => !/[+*}]\)[+*{]/.test(v), {
        message: 'nested quantifiers prohibited (ReDoS guard)',
    })

/**
 * BaseRule: how to resolve a base or PR-base branch for a branch-type
 * rule.
 *  - kind: 'static'                    → use `value`
 *  - kind: 'current-branch-if-matches' → use currentBranch if it matches
 *                                        `pattern`, else `fallback`
 *  - kind: 'ask'                       → user must confirm at apply time
 */
export const BaseRuleSchema = z.object({
    kind: z.enum(['static', 'current-branch-if-matches', 'ask']),
    value: SAFE_FREEFORM_SCHEMA.optional(),
    pattern: REGEX_SOURCE_SCHEMA.optional(),
    fallback: z.union([SAFE_FREEFORM_SCHEMA, z.literal('ask')]).optional(),
})

/**
 * BranchTypeRule: one entry in `branchTypes[]`.
 *
 * Rules are evaluated in declared order, first-match wins. A catch-all
 * `^.*$` at index 0 hijacks all tickets — author rules most-specific-first.
 */
export const BranchTypeRuleSchema = z.object({
    match: REGEX_SOURCE_SCHEMA,
    template: SAFE_FREEFORM_SCHEMA,
    base: BaseRuleSchema,
    prBase: BaseRuleSchema,
    role: z.enum(['feature', 'release', 'rc']).optional(),
})

const BranchingSectionSchema = z
    .object({
        types: z
            .array(SAFE_FREEFORM_SCHEMA)
            .default([
                'feat',
                'fix',
                'refactor',
                'chore',
                'docs',
                'test',
                'style',
            ]),
        template: SAFE_FREEFORM_SCHEMA.default('{type}/{issue}-{slug}'),
        defaultBranch: SAFE_FREEFORM_SCHEMA.default('main'),
        guardedBranches: z
            .array(SAFE_FREEFORM_SCHEMA)
            .min(1)
            .default(['main']),
        branchTypes: z.array(BranchTypeRuleSchema).optional(),
        fallback: BranchTypeRuleSchema.optional(),
        confirmBaseBeforeCreate: z.boolean().default(false),
    })
    .prefault({})

const CommitsSectionSchema = z
    .object({
        convention: z.enum(['conventional', 'none']).default('conventional'),
        scopes: z.array(SAFE_FREEFORM_SCHEMA).default([]),
        /**
         * Allowed commit-message types. Distinct from `branching.types` —
         * branching.types governs branch-name prefix; commits.types
         * governs commit-message prefix. They MAY differ for squash-merge
         * repos where every PR squashes to a single `feat:` commit
         * regardless of branch type. Falls back to branching.types when
         * unset.
         */
        types: z.array(SAFE_FREEFORM_SCHEMA).max(20).optional(),
        trailers: z
            .object({
                coAuthor: z.boolean(),
                issueRef: SAFE_FREEFORM_SCHEMA,
            })
            .optional(),
        subjectMaxLength: z.number().int().min(20).max(200).default(72),
    })
    .prefault({})

const PrSectionSchema = z
    .object({
        titleFormat: SAFE_FREEFORM_SCHEMA.default(
            '{type}({scope}): {description}',
        ),
        baseBranch: SAFE_FREEFORM_SCHEMA.default('main'),
        /**
         * Preferred PR title template — supersedes `titleFormat` when
         * present. `titleFormat` is retained for backward compatibility.
         * When both are set, `titleTemplate` wins.
         */
        titleTemplate: SAFE_FREEFORM_SCHEMA.optional(),
        titleExamples: z.array(SAFE_FREEFORM_SCHEMA).max(5).optional(),
        forbidden: z
            .array(
                z.object({
                    pattern: REGEX_SOURCE_SCHEMA,
                    reason: SAFE_FREEFORM_SCHEMA,
                }),
            )
            .max(10)
            .optional(),
        bodyTemplate: SAFE_FREEFORM_SCHEMA.optional(),
        draftByDefault: z.boolean().optional(),
    })
    .prefault({})

const ReleaseSectionSchema = z
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

const TrackerSectionSchema = z
    .object({
        kind: z.enum(['github', 'linear', 'jira', 'none']).default('github'),
        issuePrefix: SAFE_FREEFORM_SCHEMA.default(''),
        /**
         * Issue-link template used in PR bodies. Distinct from
         * `commits.trailers.issueRef` (the commit-message trailer
         * prefix) — consumers may use the same string for both, but
         * they are conceptually independent.
         */
        linkFormat: SAFE_FREEFORM_SCHEMA.optional(),
    })
    .prefault({})

export const ProjectPreferencesSchema = z
    .object({
        schemaVersion: z.literal(1).default(1),
        branching: BranchingSectionSchema,
        commits: CommitsSectionSchema,
        pr: PrSectionSchema,
        release: ReleaseSectionSchema,
        tracker: TrackerSectionSchema,
    })
    .prefault({})

export type ProjectPreferences = z.infer<typeof ProjectPreferencesSchema>

export const SectionName = z.enum([
    'branching',
    'commits',
    'pr',
    'release',
    'tracker',
])
export type SectionName = z.infer<typeof SectionName>

/**
 * Hardcoded defaults — returned by readers when no preferences are set.
 * Use ProjectPreferencesSchema.parse({}) at runtime when freshness
 * matters; this constant is captured at module-load for callers that
 * just need a reference value.
 */
export const DEFAULT_PREFERENCES: ProjectPreferences =
    ProjectPreferencesSchema.parse({})
