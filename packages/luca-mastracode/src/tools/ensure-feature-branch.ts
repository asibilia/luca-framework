import { execFileSync } from 'node:child_process'

import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import {
    DEFAULT_PREFERENCES,
    loadProjectPreferences,
    type ProjectPreferences,
} from '../state/project-preferences.js'
import { readLucaState, writeLucaState } from '../state/luca-store.js'
import { renderTemplate } from '../util/branch-template.js'
import { slugifySegment } from '../util/phase-paths.js'

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

/**
 * Strict git ref-name validator. Rejects characters/sequences that abuse
 * git's own argument parsing even when invoked via execFileSync array form
 * (no shell). See git-check-ref-format(1) for the canonical rules.
 *
 * Allowlist: ASCII letters, digits, dot, underscore, hyphen, slash.
 * Forbidden: leading hyphen (would be parsed as a CLI flag), '..' sequence,
 * '@{' (reflog selector), and any character outside the allowlist.
 */
const SafeRefName = z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9._\-\/]+$/, 'must contain only [a-zA-Z0-9._\\-/]')
    .refine((v) => !v.startsWith('-'), { message: 'must not start with "-"' })
    .refine((v) => !v.includes('..'), { message: 'must not contain ".."' })
    .refine((v) => !v.includes('@{'), { message: 'must not contain "@{"' })

// ---------------------------------------------------------------------------
// Git helpers — thin, sync, never throw above this layer
// ---------------------------------------------------------------------------

interface GitResult {
    ok: boolean
    stdout: string
    stderr: string
}

interface GitOptions {
    /** Timeout in milliseconds. Pass to bound network-touching commands. */
    timeoutMs?: number
}

function git(args: readonly string[], opts: GitOptions = {}): GitResult {
    try {
        const stdout = execFileSync('git', args, {
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'pipe'],
            ...(opts.timeoutMs !== undefined
                ? { timeout: opts.timeoutMs, killSignal: 'SIGTERM' as const }
                : {}),
        })
        return { ok: true, stdout: stdout.trim(), stderr: '' }
    } catch (err) {
        const e = err as {
            stdout?: Buffer
            stderr?: Buffer
            message?: string
            code?: string
            signal?: string
        }
        const timedOut =
            e.code === 'ETIMEDOUT' ||
            e.signal === 'SIGTERM' ||
            e.signal === 'SIGKILL'
        return {
            ok: false,
            stdout: e.stdout?.toString().trim() ?? '',
            stderr:
                e.stderr?.toString().trim() ??
                e.message ??
                (timedOut ? 'git command timed out' : 'git command failed'),
        }
    }
}

function isInsideGitRepo(): boolean {
    // `git rev-parse --is-inside-work-tree` can exit 0 while printing "false"
    // when run inside a `.git/` directory or a bare repo. Validate the stdout
    // so non-worktrees are correctly rejected before we touch any branch state.
    const r = git(['rev-parse', '--is-inside-work-tree'])
    return r.ok && r.stdout === 'true'
}

function currentBranch(): string {
    // Returns empty string for detached HEAD.
    const r = git(['branch', '--show-current'])
    return r.ok ? r.stdout : ''
}

function defaultBranch(): string {
    // Prefer origin/HEAD; fall back to common conventions.
    const sym = git(['symbolic-ref', 'refs/remotes/origin/HEAD'])
    if (sym.ok && sym.stdout.startsWith('refs/remotes/origin/')) {
        return sym.stdout.slice('refs/remotes/origin/'.length)
    }
    // Last-resort fallbacks — order matches industry preference.
    for (const candidate of ['main', 'master', 'trunk']) {
        if (git(['show-ref', '--verify', `refs/heads/${candidate}`]).ok) {
            return candidate
        }
    }
    return 'main'
}

function branchExistsLocal(name: string): boolean {
    return git(['show-ref', '--verify', `refs/heads/${name}`]).ok
}

/**
 * Check whether `<name>` exists on `origin`. Bounded by a timeout so an
 * unreachable remote can't hang the pipeline for ~75 s on TCP retries.
 * Returns `false` on timeout — callers see "no remote collision" rather than
 * a hang. The local-collision check still fires, so this fail-open is safe.
 */
function branchExistsRemote(name: string): boolean {
    const REMOTE_LS_TIMEOUT_MS = 5_000
    const r = git(['ls-remote', '--heads', 'origin', name], {
        timeoutMs: REMOTE_LS_TIMEOUT_MS,
    })
    return r.ok && r.stdout.length > 0
}

// ---------------------------------------------------------------------------
// Naming
// ---------------------------------------------------------------------------

const BRANCH_TYPES = [
    'feat',
    'fix',
    'refactor',
    'chore',
    'docs',
    'test',
    'style',
] as const
type BranchType = (typeof BRANCH_TYPES)[number]

/**
 * Conservative kebab-case slug. Strips anything that isn't alphanumeric or
 * a separator, collapses runs, trims length. Never returns an empty string —
 * falls back to "work" so we always have a usable branch suffix.
 */
function slugify(input: string): string {
    const cleaned = input
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60)
    return cleaned.length > 0 ? cleaned : 'work'
}

function buildBranchName({
    type,
    issueNumber,
    slug,
}: {
    type: BranchType
    issueNumber?: number
    slug: string
}): string {
    const cleanSlug = slugify(slug)
    return issueNumber !== undefined
        ? `${type}/${issueNumber}-${cleanSlug}`
        : `${type}/${cleanSlug}`
}

// ---------------------------------------------------------------------------
// Preference-driven branch resolution (Wave 2)
//
// resolveBranching() is a PURE function that maps preferences + ticket/intent
// onto a concrete branch plan: name, base, prBase, and whether the user must
// confirm before apply() mutates git. It never touches the filesystem or the
// process — caller passes in currentBranch/defaultBranch.
// ---------------------------------------------------------------------------

type BaseRulePref = NonNullable<
    NonNullable<ProjectPreferences['branching']>['branchTypes']
>[number]['base']
type BranchTypeRulePref = NonNullable<
    NonNullable<ProjectPreferences['branching']>['branchTypes']
>[number]

interface ResolvedBaseRule {
    value: string | undefined
    /**
     * True only when the rule resolved to an `ask` outcome (i.e. the human
     * must confirm before apply runs). Replaces the previous 4-value
     * `kindUsed` discriminant which was only ever consumed via `=== 'ask'`.
     */
    isAsk: boolean
}

/**
 * Resolve a single BaseRule against the live branch context.
 *
 * Returns the literal branch name to use (or `undefined` when the rule
 * forces a confirmation prompt) plus a `kindUsed` tag the caller uses to
 * flip `needsConfirmation`. See BaseRule schema in project-preferences.ts.
 */
function resolveBaseRule(
    rule: BaseRulePref | undefined,
    currentBranch: string,
    defaultBranch: string,
): ResolvedBaseRule {
    if (!rule) {
        return { value: defaultBranch, isAsk: false }
    }
    if (rule.kind === 'static') {
        return { value: rule.value ?? defaultBranch, isAsk: false }
    }
    if (rule.kind === 'current-branch-if-matches') {
        if (rule.pattern) {
            try {
                if (new RegExp(rule.pattern).test(currentBranch)) {
                    return { value: currentBranch, isAsk: false }
                }
            } catch {
                // Schema validates regex source, but be defensive at runtime.
            }
        }
        if (rule.fallback === 'ask') {
            return { value: undefined, isAsk: true }
        }
        if (typeof rule.fallback === 'string') {
            return { value: rule.fallback, isAsk: false }
        }
        // No fallback declared → force confirmation rather than silently
        // defaulting; the human must pick a base.
        return { value: undefined, isAsk: true }
    }
    // kind === 'ask'
    if (typeof rule.fallback === 'string' && rule.fallback !== 'ask') {
        // Static fallback present, but original rule.kind is 'ask' so the
        // human still must confirm before apply commits.
        return { value: rule.fallback, isAsk: true }
    }
    return { value: undefined, isAsk: true }
}

/** Built-in fallback rule when preferences are absent. Mirrors legacy create-action behavior. */
function builtInFallbackRule(defaultBranch: string): BranchTypeRulePref {
    return {
        match: '.*',
        template: '{type}/{issue}-{slug}',
        base: { kind: 'static', value: defaultBranch },
        prBase: { kind: 'static', value: defaultBranch },
        role: 'feature',
    }
}

export interface ResolveInput {
    ticketId?: string
    intent?: string
    currentBranch: string
    defaultBranch: string
    preferences?: ProjectPreferences | null
    /** Override for branch type when the rule's role doesn't pin it. */
    type?: string
    /** Pre-computed slug; bypasses intent/ticket slugification. */
    slug?: string
}

export interface ResolveResult {
    branchName: string
    base: string | undefined
    prBase: string | undefined
    role?: 'feature' | 'release' | 'rc'
    needsConfirmation: boolean
    matchedRule?: 'branchType' | 'fallback' | 'tool-default'
    matchedIndex?: number
    notes: string[]
}

/**
 * Pure resolver: maps preferences + ticket/intent onto a concrete branch plan.
 *
 * Algorithm:
 *  1. Pick a rule: first `branchTypes[]` whose `match` regex hits ticketId,
 *     else `fallback`, else built-in tool default.
 *  2. Compute slug from `input.slug` || slugifySegment(intent) || slugifySegment(ticketId).
 *  3. Compute type from `input.type` || rule.role-derived || 'feat'.
 *  4. Render branch name via renderTemplate(rule.template, {type, issue, slug}).
 *  5. Resolve base/prBase via resolveBaseRule(); aggregate `needsConfirmation`.
 */
export function resolveBranching(input: ResolveInput): ResolveResult {
    const notes: string[] = []
    const branching = input.preferences?.branching
    const branchTypes = branching?.branchTypes ?? []
    const fallback = branching?.fallback
    const builtIn = builtInFallbackRule(input.defaultBranch)

    let rule: BranchTypeRulePref = builtIn
    let matchedRule: ResolveResult['matchedRule'] = 'tool-default'
    let matchedIndex: number | undefined

    if (input.ticketId && branchTypes.length > 0) {
        for (let i = 0; i < branchTypes.length; i++) {
            const candidate = branchTypes[i]!
            try {
                if (new RegExp(candidate.match).test(input.ticketId)) {
                    rule = candidate
                    matchedRule = 'branchType'
                    matchedIndex = i
                    notes.push(
                        `branchTypes[${i}] matched ticketId='${input.ticketId}' (pattern=${candidate.match})`,
                    )
                    break
                }
            } catch {
                notes.push(
                    `branchTypes[${i}] regex compile failed; skipped (pattern=${candidate.match})`,
                )
            }
        }
    }
    if (matchedRule === 'tool-default' && fallback) {
        rule = fallback
        matchedRule = 'fallback'
        notes.push('used preferences.branching.fallback rule')
    }
    if (matchedRule === 'tool-default') {
        notes.push('no preferences match — used built-in tool defaults')
    }

    // Slug computation: explicit override > intent > ticketId > 'work'.
    let slug = input.slug
    if (!slug || slug.length === 0) {
        if (input.intent && input.intent.length > 0) {
            slug = slugifySegment(input.intent)
        }
    }
    if (!slug || slug.length === 0) {
        slug = slugifySegment(input.ticketId ?? 'work')
    }
    if (slug.length === 0) slug = 'work'

    // Type computation: explicit override > 'feat'.
    // NOTE: role does not currently differentiate the conventional-commit type prefix.
    // All roles default to 'feat' since 'release' and 'rc' branch names already
    // carry their semantics in the template (e.g. '{issue}--release'). If a future
    // project wants 'release/...' or 'rc/...' prefixes, override input.type explicitly.
    const role = rule.role
    const type = input.type ?? 'feat'

    let branchName: string
    try {
        branchName = renderTemplate(rule.template, {
            type,
            issue: input.ticketId,
            slug,
        })
    } catch (err) {
        notes.push(
            `template render failed (${(err as Error).message}); falling back to '<type>/<issue>-<slug>'`,
        )
        branchName = input.ticketId
            ? `${type}/${input.ticketId}-${slug}`
            : `${type}/${slug}`
    }

    const baseResolved = resolveBaseRule(
        rule.base,
        input.currentBranch,
        input.defaultBranch,
    )
    const prBaseResolved = resolveBaseRule(
        rule.prBase,
        input.currentBranch,
        input.defaultBranch,
    )

    const askTriggered = baseResolved.isAsk || prBaseResolved.isAsk
    const confirmFlag = branching?.confirmBaseBeforeCreate === true
    const needsConfirmation = confirmFlag || askTriggered

    if (askTriggered) notes.push('one or more BaseRule resolved to kind=ask')
    if (confirmFlag)
        notes.push('preferences.branching.confirmBaseBeforeCreate=true')

    return {
        branchName,
        base: baseResolved.value,
        prBase: prBaseResolved.value,
        role,
        needsConfirmation,
        matchedRule,
        ...(matchedIndex !== undefined ? { matchedIndex } : {}),
        notes,
    }
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export const ENSURE_FEATURE_BRANCH_ACTIONS = [
    'status',
    'create',
    'rename',
    'assert-not-default',
    'consult',
    'resolve',
    'apply',
] as const

export const ensureFeatureBranchTool = createTool({
    id: 'ensure-feature-branch',
    description:
        'Manage the feature branch for the current pipeline run. Architect Step 1 calls action="create" to switch off the default branch onto `<type>/<issue>-<slug>` before any planning or execution. Executor and finalize use action="status" to verify the run is on a non-default branch before committing or opening a PR. Branch name and issue number are persisted to luca-state.json (branchName, issueNumber).',
    inputSchema: z.object({
        action: z
            .enum(ENSURE_FEATURE_BRANCH_ACTIONS)
            .describe(
                '"status" inspects the current branch (no side effects, adds `role`). "assert-not-default" hard-fails if HEAD is on the default or guarded branch. "consult" returns the merged branching preferences. "resolve" computes a branch plan from preferences (pure, no git mutation). "apply" executes a resolve result (creates branch + persists state). "create" / "rename" are the legacy direct-mutation paths.'
            ),
        // Legacy fields (create/rename). `type` is a free-form string at the
        // top level so resolve/apply can pass arbitrary types from preferences;
        // create/rename validate against BRANCH_TYPES inside execute().
        type: z
            .string()
            .optional()
            .describe(
                'Conventional-commit type prefix used as the branch namespace. Required for "create" / "rename" (must be one of feat/fix/refactor/chore/docs/test/style). Optional for "resolve" as an override.'
            ),
        issueNumber: z
            .number()
            .int()
            .positive()
            .optional()
            .describe(
                'GitHub issue number to embed in the branch name. Optional — branches without an issue are allowed.'
            ),
        slug: z
            .string()
            .min(1)
            .optional()
            .describe(
                'Short kebab-cased description for the branch suffix. Required for "create" and "rename". Will be slugified defensively.'
            ),
        force: z
            .boolean()
            .default(false)
            .describe(
                'For "create"/"apply": if true, switch to a fresh branch even when already on a non-default feature branch. Default false (idempotent no-op).'
            ),
        // Resolve inputs.
        ticketId: z
            .string()
            .max(64)
            .regex(/^[A-Za-z0-9_\-./]+$/)
            .optional()
            .describe(
                'For "resolve": ticket id (e.g. PT-12458) used to match `branching.branchTypes[].match` regexes. Also embedded in the branch template as {issue}.'
            ),
        intent: z
            .string()
            .max(256)
            .optional()
            .describe(
                'For "resolve": free-form intent string used to derive the branch slug when `slug` is not provided.'
            ),
        // Apply inputs.
        resolution: z
            .object({
                branchName: SafeRefName,
                base: SafeRefName.optional(),
                prBase: SafeRefName.optional(),
                needsConfirmation: z.boolean(),
                role: z.enum(['feature', 'release', 'rc']).optional(),
            })
            .passthrough()
            .optional()
            .describe(
                'For "apply": the result of a prior "resolve" call. Must include branchName/base/prBase/needsConfirmation.'
            ),
        confirmedBase: SafeRefName
            .optional()
            .describe(
                'For "apply": user-confirmed base branch when resolution.needsConfirmation=true.'
            ),
        confirmedPrBase: SafeRefName
            .optional()
            .describe(
                'For "apply": user-confirmed PR base branch (defaults to confirmedBase ?? resolution.prBase).'
            ),
    }),
    execute: async (inputData) => {
        const {
            action,
            type,
            issueNumber,
            slug,
            force,
            ticketId,
            intent,
            resolution,
            confirmedBase,
            confirmedPrBase,
        } = inputData

        if (!isInsideGitRepo()) {
            return {
                ok: false as const,
                status: 'no-git' as const,
                message:
                    'Not inside a git work tree — cannot manage feature branches.',
            }
        }

        const current = currentBranch()
        const def = defaultBranch()

        // ── status ──────────────────────────────────────────────────
        if (action === 'status') {
            if (current === '') {
                return {
                    ok: false as const,
                    status: 'detached' as const,
                    currentBranch: '',
                    defaultBranch: def,
                    message:
                        'HEAD is detached — no current branch. The orchestrator must check out or create a feature branch before committing.',
                }
            }
            if (current === def) {
                return {
                    ok: false as const,
                    status: 'on-default' as const,
                    currentBranch: current,
                    defaultBranch: def,
                    role: 'default' as const,
                    message: `Refusing to proceed: HEAD is on the default branch '${current}'. Architect Step 1 must run \`ensureFeatureBranch\` with action="create" first.`,
                }
            }
            // Wave-2 enrichment: classify non-default branches as guarded /
            // role-from-rule / feature. Existing string status values are
            // preserved; `role` is the new additive field.
            const prefs = loadProjectPreferences()
            const guardedList =
                prefs?.branching?.guardedBranches &&
                prefs.branching.guardedBranches.length > 0
                    ? prefs.branching.guardedBranches
                    : ['main']
            let role: 'default' | 'guarded' | 'feature' | 'release' | 'rc' =
                'feature'
            if (guardedList.includes(current) && current !== def) {
                role = 'guarded'
            } else if (
                prefs?.branching?.branchTypes &&
                prefs.branching.branchTypes.length > 0
            ) {
                for (const r of prefs.branching.branchTypes) {
                    try {
                        if (new RegExp(r.match).test(current) && r.role) {
                            role = r.role
                            break
                        }
                    } catch {
                        // ignore broken regex; schema validates source
                    }
                }
            }
            return {
                ok: true as const,
                status: 'on-feature' as const,
                currentBranch: current,
                defaultBranch: def,
                role,
                message: `On feature branch '${current}' (default: '${def}').`,
            }
        }

        // ── assert-not-default ──────────────────────────────────────
        if (action === 'assert-not-default') {
            const prefs = loadProjectPreferences()
            const guardedList =
                prefs?.branching?.guardedBranches &&
                prefs.branching.guardedBranches.length > 0
                    ? prefs.branching.guardedBranches
                    : ['main']
            if (current === '') {
                return {
                    ok: false as const,
                    status: 'detached' as const,
                    currentBranch: '',
                    defaultBranch: def,
                    message:
                        'HEAD is detached — refusing. Check out a feature branch first.',
                }
            }
            if (current === def) {
                return {
                    ok: false as const,
                    status: 'on-default' as const,
                    currentBranch: current,
                    defaultBranch: def,
                    message: `On default branch '${def}' — refusing.`,
                }
            }
            if (guardedList.includes(current)) {
                return {
                    ok: false as const,
                    status: 'on-guarded' as const,
                    currentBranch: current,
                    defaultBranch: def,
                    guardedBranches: guardedList,
                    message: `On guarded branch '${current}' — refusing.`,
                }
            }
            return {
                ok: true as const,
                status: 'safe' as const,
                currentBranch: current,
                defaultBranch: def,
                message: `Branch '${current}' is safe (not default, not guarded).`,
            }
        }

        // ── consult ─────────────────────────────────────────────────
        if (action === 'consult') {
            const prefs = loadProjectPreferences()
            // Drift-free defaults: re-use DEFAULT_PREFERENCES.branching so a
            // schema change in project-preferences.ts auto-propagates here.
            // The live-git defaultBranch override stays — the schema default
            // is 'main' but the actual repo may differ.
            const merged = prefs?.branching ?? {
                ...DEFAULT_PREFERENCES.branching,
                defaultBranch: def,
            }
            return {
                ok: true as const,
                status: 'consulted' as const,
                branching: merged,
                source: prefs ? 'preferences' : ('tool-defaults' as const),
            }
        }

        // ── resolve ─────────────────────────────────────────────────
        if (action === 'resolve') {
            const prefs = loadProjectPreferences()
            const result = resolveBranching({
                ...(ticketId !== undefined ? { ticketId } : {}),
                ...(intent !== undefined ? { intent } : {}),
                currentBranch: current,
                defaultBranch: def,
                preferences: prefs,
                ...(type !== undefined ? { type } : {}),
                ...(slug !== undefined ? { slug } : {}),
            })
            return {
                ok: true as const,
                status: 'resolved' as const,
                currentBranch: current,
                defaultBranch: def,
                ...result,
            }
        }

        // ── apply ───────────────────────────────────────────────────
        if (action === 'apply') {
            if (!resolution) {
                return {
                    ok: false as const,
                    status: 'invalid-args' as const,
                    currentBranch: current,
                    defaultBranch: def,
                    message:
                        'action="apply" requires `resolution` from a prior `resolve` call.',
                }
            }
            // Confirmation gate: refuse when resolution demands user input
            // and no confirmedBase was supplied (or the resolver couldn't
            // even compute a fallback base).
            if (
                resolution.needsConfirmation &&
                (resolution.base === undefined || confirmedBase === undefined)
            ) {
                return {
                    ok: false as const,
                    status: 'needs-confirmation' as const,
                    currentBranch: current,
                    defaultBranch: def,
                    resolution,
                    message:
                        'apply requires `confirmedBase` token; resolution.needsConfirmation=true.',
                }
            }
            const finalBase = confirmedBase ?? resolution.base
            if (finalBase === undefined) {
                return {
                    ok: false as const,
                    status: 'invalid-args' as const,
                    currentBranch: current,
                    defaultBranch: def,
                    message:
                        'apply could not determine a base branch (resolution.base undefined and no confirmedBase).',
                }
            }
            const finalPrBase =
                confirmedPrBase ?? resolution.prBase ?? finalBase
            const target = resolution.branchName

            if (current === '') {
                return {
                    ok: false as const,
                    status: 'detached' as const,
                    currentBranch: '',
                    defaultBranch: def,
                    message:
                        'HEAD is detached — cannot apply a feature branch from an unintended commit.',
                }
            }
            // Idempotent already-on-target.
            if (current === target && !force) {
                writeLucaState({
                    branchName: target,
                    baseBranch: finalBase,
                    prBase: finalPrBase,
                    ...(issueNumber !== undefined ? { issueNumber } : {}),
                })
                return {
                    ok: true as const,
                    status: 'already-on-feature' as const,
                    currentBranch: target,
                    defaultBranch: def,
                    branchName: target,
                    baseBranch: finalBase,
                    prBase: finalPrBase,
                    message: `Already on '${target}'. State updated.`,
                    created: false,
                }
            }
            if (branchExistsLocal(target)) {
                return {
                    ok: false as const,
                    status: 'local-collision' as const,
                    currentBranch: current,
                    defaultBranch: def,
                    proposedBranch: target,
                    message: `Local branch '${target}' already exists.`,
                }
            }
            if (branchExistsRemote(target)) {
                return {
                    ok: false as const,
                    status: 'remote-collision' as const,
                    currentBranch: current,
                    defaultBranch: def,
                    proposedBranch: target,
                    message: `Remote branch '${target}' already exists on origin.`,
                }
            }
            // Switch to base before branching so the new branch's parent is
            // exactly `finalBase` — not the prior feature branch's tip.
            if (current !== finalBase) {
                const toBase = git(['switch', finalBase])
                if (!toBase.ok) {
                    return {
                        ok: false as const,
                        status: 'git-error' as const,
                        currentBranch: current,
                        defaultBranch: def,
                        proposedBranch: target,
                        message: `git switch ${finalBase} failed (could not move to base before branching): ${toBase.stderr}`,
                    }
                }
            }
            const switched = git(['switch', '-c', target])
            if (!switched.ok) {
                return {
                    ok: false as const,
                    status: 'git-error' as const,
                    currentBranch: current,
                    defaultBranch: def,
                    proposedBranch: target,
                    message: `git switch -c failed: ${switched.stderr}`,
                }
            }
            // INVARIANT: state write happens AFTER successful git mutation.
            writeLucaState({
                branchName: target,
                baseBranch: finalBase,
                prBase: finalPrBase,
                ...(issueNumber !== undefined ? { issueNumber } : {}),
            })
            return {
                ok: true as const,
                status: 'applied' as const,
                currentBranch: target,
                defaultBranch: def,
                branchName: target,
                baseBranch: finalBase,
                prBase: finalPrBase,
                message: `Created and switched to '${target}' from '${finalBase}' (prBase='${finalPrBase}').`,
                created: true,
            }
        }

        // ── create ──────────────────────────────────────────────────
        if (action === 'create') {
            if (!type || !slug) {
                return {
                    ok: false as const,
                    status: 'invalid-args' as const,
                    currentBranch: current,
                    defaultBranch: def,
                    message:
                        'action="create" requires both `type` and `slug`. Optional: `issueNumber`.',
                }
            }
            if (!(BRANCH_TYPES as readonly string[]).includes(type)) {
                return {
                    ok: false as const,
                    status: 'invalid-args' as const,
                    currentBranch: current,
                    defaultBranch: def,
                    message: `action="create" requires \`type\` ∈ ${BRANCH_TYPES.join('|')}. Got '${type}'.`,
                }
            }
            const branchType = type as BranchType

            // Detached HEAD is a hard stop — never create branches off an
            // unintended commit. Documented in architect.md as a stop condition.
            if (current === '') {
                return {
                    ok: false as const,
                    status: 'detached' as const,
                    currentBranch: '',
                    defaultBranch: def,
                    message:
                        'HEAD is detached — cannot create a feature branch from an unintended commit. Check out the default branch first.',
                }
            }

            // Already on a feature branch and not forcing → idempotent no-op.
            if (current !== '' && current !== def && !force) {
                // Persist whatever state we can infer, but don't overwrite
                // an existing branchName mismatch silently — surface it.
                const state = readLucaState()
                if (state.branchName && state.branchName !== current) {
                    return {
                        ok: false as const,
                        status: 'branch-mismatch' as const,
                        currentBranch: current,
                        defaultBranch: def,
                        recordedBranch: state.branchName,
                        message: `Already on '${current}', but luca-state recorded '${state.branchName}'. Resolve before continuing (set force=true to overwrite recorded branch).`,
                    }
                }
                writeLucaState({
                    branchName: current,
                    ...(issueNumber !== undefined ? { issueNumber } : {}),
                })
                return {
                    ok: true as const,
                    status: 'already-on-feature' as const,
                    currentBranch: current,
                    defaultBranch: def,
                    message: `Already on feature branch '${current}'. No new branch created.`,
                    created: false,
                }
            }

            // Build the target name and validate non-collision.
            const target = buildBranchName({ type: branchType, issueNumber, slug })

            if (branchExistsLocal(target)) {
                return {
                    ok: false as const,
                    status: 'local-collision' as const,
                    currentBranch: current,
                    defaultBranch: def,
                    proposedBranch: target,
                    message: `Local branch '${target}' already exists. Pick a different slug or check out the existing branch manually.`,
                }
            }
            if (branchExistsRemote(target)) {
                return {
                    ok: false as const,
                    status: 'remote-collision' as const,
                    currentBranch: current,
                    defaultBranch: def,
                    proposedBranch: target,
                    message: `Remote branch '${target}' already exists on origin. Pick a different slug or check out the existing branch manually.`,
                }
            }

            // Always create from the default branch. If we're somewhere else
            // (force=true on a non-default feature branch), switch to default
            // first so the new branch has a clean base — never the prior
            // feature branch's commits — matching the documented contract.
            if (current !== def) {
                const toDefault = git(['switch', def])
                if (!toDefault.ok) {
                    return {
                        ok: false as const,
                        status: 'git-error' as const,
                        currentBranch: current,
                        defaultBranch: def,
                        proposedBranch: target,
                        message: `git switch ${def} failed (could not return to default before branching): ${toDefault.stderr}`,
                    }
                }
            }

            const switched = git(['switch', '-c', target])
            if (!switched.ok) {
                return {
                    ok: false as const,
                    status: 'git-error' as const,
                    currentBranch: current,
                    defaultBranch: def,
                    proposedBranch: target,
                    message: `git switch -c failed: ${switched.stderr}`,
                }
            }

            writeLucaState({
                branchName: target,
                ...(issueNumber !== undefined ? { issueNumber } : {}),
            })

            return {
                ok: true as const,
                status: 'created' as const,
                currentBranch: target,
                defaultBranch: def,
                message: `Created and switched to '${target}' (from '${current || def}').`,
                created: true,
            }
        }

        // ── rename ──────────────────────────────────────────────────
        if (action === 'rename') {
            if (!type || !slug) {
                return {
                    ok: false as const,
                    status: 'invalid-args' as const,
                    currentBranch: current,
                    defaultBranch: def,
                    message:
                        'action="rename" requires both `type` and `slug`. Optional: `issueNumber`.',
                }
            }
            if (!(BRANCH_TYPES as readonly string[]).includes(type)) {
                return {
                    ok: false as const,
                    status: 'invalid-args' as const,
                    currentBranch: current,
                    defaultBranch: def,
                    message: `action="rename" requires \`type\` ∈ ${BRANCH_TYPES.join('|')}. Got '${type}'.`,
                }
            }
            const renameType = type as BranchType
            if (current === '') {
                return {
                    ok: false as const,
                    status: 'detached' as const,
                    currentBranch: '',
                    defaultBranch: def,
                    message:
                        'Cannot rename: HEAD is detached. Check out a feature branch first.',
                }
            }
            if (current === def) {
                return {
                    ok: false as const,
                    status: 'on-default' as const,
                    currentBranch: current,
                    defaultBranch: def,
                    message: `Cannot rename '${current}'. The default branch must never be renamed; create a feature branch first.`,
                }
            }
            const target = buildBranchName({ type: renameType, issueNumber, slug })
            if (target === current) {
                return {
                    ok: true as const,
                    status: 'noop' as const,
                    currentBranch: current,
                    defaultBranch: def,
                    message: `Branch already named '${target}'.`,
                }
            }
            if (branchExistsLocal(target)) {
                return {
                    ok: false as const,
                    status: 'local-collision' as const,
                    currentBranch: current,
                    defaultBranch: def,
                    proposedBranch: target,
                    message: `Cannot rename: local branch '${target}' already exists.`,
                }
            }
            if (branchExistsRemote(target)) {
                return {
                    ok: false as const,
                    status: 'remote-collision' as const,
                    currentBranch: current,
                    defaultBranch: def,
                    proposedBranch: target,
                    message: `Cannot rename: remote branch '${target}' already exists on origin.`,
                }
            }
            const renamed = git(['branch', '-m', target])
            if (!renamed.ok) {
                return {
                    ok: false as const,
                    status: 'git-error' as const,
                    currentBranch: current,
                    defaultBranch: def,
                    proposedBranch: target,
                    message: `git branch -m failed: ${renamed.stderr}`,
                }
            }
            writeLucaState({
                branchName: target,
                ...(issueNumber !== undefined ? { issueNumber } : {}),
            })
            return {
                ok: true as const,
                status: 'renamed' as const,
                currentBranch: target,
                defaultBranch: def,
                message: `Renamed '${current}' → '${target}'.`,
            }
        }

        // Unreachable — zod enum guarantees exhaustiveness.
        return {
            ok: false as const,
            status: 'unknown-action' as const,
            message: `Unknown action: ${action}`,
        }
    },
})

// Exported for testing.
export const __testing = {
    slugify,
    buildBranchName,
}
