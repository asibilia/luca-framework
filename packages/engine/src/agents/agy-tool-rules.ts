/**
 * Antigravity (`agy`) tool-call normalization and PreToolUse guard (#781).
 *
 * Normalizes `agy` built-in tool calls onto Luca's pure `checkToolCall` guard
 * after symlink-aware realpath resolution and `AGY_SECRET_PATHS` / worktree /
 * state-directory boundary checks.
 */
import { lstatSync, readlinkSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, parse, relative, resolve } from 'node:path'

import { z } from 'zod'

import { AgentRoleSchema } from './role-results'

import { EngineConfigSchema } from '../config/engine-config'
import {
    checkToolCall,
    GuardRoleSchema,
    type ToolDecision,
} from '../guards/role-rules'
import { SECRET_PATHS } from '../guards/sandbox-settings'
import { insideWorktree } from '../guards/write-rules'

/** Secret paths under `home_real` that no `agy` agent may read or write. */
export const AGY_SECRET_PATHS: readonly string[] = [...SECRET_PATHS, '.gemini']

/** Pure guard state needed to evaluate one `agy` tool call. */
export const AgyGuardStateSchema = z.object({
    role: AgentRoleSchema,
    guard_role: GuardRoleSchema,
    worktree_real: z.string().min(1),
    state_dir_real: z.string().min(1),
    home_real: z.string().min(1),
    may_edit_tests: z.boolean(),
    config: EngineConfigSchema,
})

export type AgyGuardState = z.infer<typeof AgyGuardStateSchema>

/** Full per-session hook state written to `$LUCA_AGY_STATE_DIR/state.json`. */
export const AgyHookStateSchema = AgyGuardStateSchema.extend({
    cwd: z.string().min(1),
    max_turns: z.number().int().min(0),
    instructions: z.string(),
    turn_index: z.number().int().min(0),
})

export type AgyHookState = z.infer<typeof AgyHookStateSchema>

const ALLOW: ToolDecision = { allow: true }
const deny = (reason: string): ToolDecision => ({ allow: false, reason })

const MAX_SYMLINK_HOPS = 32

const ViewFileInputSchema = z.object({
    AbsolutePath: z.string().nullish(),
    Path: z.string().nullish(),
})

const SearchPathSchema = z.object({
    SearchPath: z.string().min(1).nullish(),
})

const SearchDirectorySchema = z.object({
    SearchDirectory: z.string().min(1).nullish(),
})

const DirectoryPathSchema = z.object({
    DirectoryPath: z.string().min(1).nullish(),
})

const TargetFileSchema = z.object({
    TargetFile: z.string().min(1),
})

const PathFileSchema = z.object({
    Path: z.string().min(1),
})

const RunCommandInputSchema = z.object({
    CommandLine: z.string().min(1),
    IsDaemon: z.boolean().nullish(),
    BypassSandbox: z.boolean().nullish(),
})

const READ_SEARCH_CLAUDE_TOOL = {
    grep_search: 'Grep',
    find_by_name: 'Glob',
    list_dir: 'Glob',
} as const

const parseSearchPath = ({
    tool_name,
    tool_input,
}: {
    tool_name: keyof typeof READ_SEARCH_CLAUDE_TOOL
    tool_input: unknown
}): { ok: true; raw_path: string | null } | { ok: false } => {
    if (tool_name === 'grep_search') {
        const parsed = SearchPathSchema.safeParse(tool_input)
        return parsed.success
            ? { ok: true, raw_path: parsed.data.SearchPath ?? null }
            : { ok: false }
    }
    if (tool_name === 'find_by_name') {
        const parsed = SearchDirectorySchema.safeParse(tool_input)
        return parsed.success
            ? { ok: true, raw_path: parsed.data.SearchDirectory ?? null }
            : { ok: false }
    }
    const parsed = DirectoryPathSchema.safeParse(tool_input)
    return parsed.success
        ? { ok: true, raw_path: parsed.data.DirectoryPath ?? null }
        : { ok: false }
}

const WRITE_TOOL_KEY = {
    write_to_file: 'TargetFile',
    replace_file_content: 'TargetFile',
    multi_replace_file_content: 'TargetFile',
    sed_file: 'Path',
    notebook_edit: 'Path',
} as const

const nonEmpty = (value: string | null | undefined): string | null =>
    typeof value === 'string' && value.length > 0 ? value : null

const splitSegments = (raw: string): string[] =>
    raw.split('/').filter((seg) => seg.length > 0 && seg !== '.')

/**
 * Resolves `target` left-to-right segment-by-segment across symlinks,
 * following relative and absolute symlink targets (including dangling symlinks)
 * up to `MAX_SYMLINK_HOPS`. Returns `null` on NUL bytes, missing `base` for a
 * relative `target`, unreadable symlinks, or symlink loops (fail closed).
 */
const resolveRealPath = ({
    target,
    base,
}: {
    target: string
    base?: string
}): string | null => {
    if (target.includes('\0')) return null
    let current: string
    let queue: string[]
    if (isAbsolute(target)) {
        const root = parse(target).root
        current = root
        queue = splitSegments(target.slice(root.length))
    } else {
        if (base === undefined) return null
        current = base
        queue = splitSegments(target)
    }

    let hops = 0
    while (queue.length > 0) {
        const seg = queue.shift()
        if (seg === undefined || seg === '' || seg === '.') continue
        if (seg === '..') {
            current = dirname(current)
            continue
        }
        const next = join(current, seg)
        let is_symlink = false
        try {
            is_symlink = lstatSync(next).isSymbolicLink()
        } catch {
            // ENOENT, ENOTDIR, or sandbox EPERM: continue lexically from resolved prefix.
            current = next
            continue
        }
        if (is_symlink) {
            hops += 1
            if (hops > MAX_SYMLINK_HOPS) return null
            let link: string
            try {
                link = readlinkSync(next)
            } catch {
                return null
            }
            if (link.length === 0 || link.includes('\0')) return null
            if (isAbsolute(link)) {
                const link_root = parse(link).root
                current = link_root
                queue.unshift(...splitSegments(link.slice(link_root.length)))
            } else {
                queue.unshift(...splitSegments(link))
            }
            continue
        }
        try {
            current = realpathSync(next)
        } catch {
            current = next
        }
    }
    return current
}

const normalizeRoot = (raw: string): string | null =>
    resolveRealPath({ target: isAbsolute(raw) ? raw : resolve(raw) })

const isEqualOrUnder = ({
    parent,
    child,
}: {
    parent: string
    child: string
}): boolean => {
    const rel = relative(parent, child)
    return (
        rel === '' ||
        (rel !== '..' && !rel.startsWith('../') && !isAbsolute(rel))
    )
}

const checkPathAccess = ({
    state,
    raw_path,
    mode,
}: {
    state: AgyGuardState
    raw_path: string
    mode: 'read' | 'write'
}):
    | { ok: true; resolved: string; worktree_real: string }
    | { ok: false; decision: ToolDecision } => {
    const worktree_real = normalizeRoot(state.worktree_real)
    const state_dir_real = normalizeRoot(state.state_dir_real)
    const home_real = normalizeRoot(state.home_real)
    if (
        worktree_real === null ||
        state_dir_real === null ||
        home_real === null
    ) {
        return {
            ok: false,
            decision: deny(`${raw_path} is outside your worktree.`),
        }
    }
    const resolved = isAbsolute(raw_path)
        ? resolveRealPath({ target: raw_path })
        : resolveRealPath({ target: raw_path, base: worktree_real })
    if (resolved === null) {
        return {
            ok: false,
            decision: deny(`${raw_path} is outside your worktree.`),
        }
    }
    for (const secret of AGY_SECRET_PATHS) {
        const lexical_secret = join(home_real, secret)
        const real_secret = resolveRealPath({ target: lexical_secret })
        if (
            isEqualOrUnder({ parent: lexical_secret, child: resolved }) ||
            (real_secret !== null &&
                isEqualOrUnder({ parent: real_secret, child: resolved }))
        ) {
            return {
                ok: false,
                decision: deny(
                    mode === 'read'
                        ? 'Reading secret files is not allowed.'
                        : 'Writing secret files is not allowed.'
                ),
            }
        }
    }
    if (
        isEqualOrUnder({ parent: state_dir_real, child: resolved }) ||
        insideWorktree({ worktree: worktree_real, path: resolved }) === null
    ) {
        return {
            ok: false,
            decision: deny(`${raw_path} is outside your worktree.`),
        }
    }
    return { ok: true, resolved, worktree_real }
}

const delegateToolCall = ({
    state,
    tool_name,
    tool_input,
    worktree,
}: {
    state: AgyGuardState
    tool_name: string
    tool_input: unknown
    worktree: string
}): ToolDecision =>
    checkToolCall({
        role: state.guard_role,
        may_edit_tests: state.may_edit_tests,
        tool_name,
        tool_input,
        worktree,
        config: state.config,
    })

const checkSearchTool = ({
    state,
    tool_name,
    tool_input,
}: {
    state: AgyGuardState
    tool_name: keyof typeof READ_SEARCH_CLAUDE_TOOL
    tool_input: unknown
}): ToolDecision => {
    const parsed = parseSearchPath({ tool_name, tool_input })
    if (!parsed.ok) {
        return deny(`${tool_name} got an input of the wrong shape.`)
    }
    const raw_path = parsed.raw_path ?? state.worktree_real
    const access = checkPathAccess({ state, raw_path, mode: 'read' })
    if (!access.ok) return access.decision
    return delegateToolCall({
        state,
        tool_name: READ_SEARCH_CLAUDE_TOOL[tool_name],
        tool_input: { path: access.resolved },
        worktree: access.worktree_real,
    })
}

const checkWriteTool = ({
    state,
    tool_name,
    tool_input,
}: {
    state: AgyGuardState
    tool_name: keyof typeof WRITE_TOOL_KEY
    tool_input: unknown
}): ToolDecision => {
    const key = WRITE_TOOL_KEY[tool_name]
    const raw_path =
        key === 'TargetFile'
            ? (() => {
                  const parsed = TargetFileSchema.safeParse(tool_input)
                  return parsed.success ? parsed.data.TargetFile : null
              })()
            : (() => {
                  const parsed = PathFileSchema.safeParse(tool_input)
                  return parsed.success ? parsed.data.Path : null
              })()
    if (raw_path === null) {
        return deny(`${tool_name} needs a file path.`)
    }
    const access = checkPathAccess({ state, raw_path, mode: 'write' })
    if (!access.ok) return access.decision
    return delegateToolCall({
        state,
        tool_name: 'Write',
        tool_input: { file_path: access.resolved },
        worktree: access.worktree_real,
    })
}

/**
 * Pure PreToolUse decision for one Antigravity (`agy`) tool call.
 *
 * Fails closed: denies secret paths (including `.gemini`), paths inside
 * `state_dir_real` or outside `worktree_real` (resolved across symlinks),
 * unsandboxed or background commands, and every disallowed tool.
 */
export const checkAgyToolCall = ({
    state,
    tool_name,
    tool_input,
}: {
    state: AgyGuardState
    tool_name: string
    tool_input: unknown
}): ToolDecision => {
    if (tool_name === 'finish') return ALLOW
    if (tool_name === 'view_file') {
        const parsed = ViewFileInputSchema.safeParse(tool_input)
        const raw_path = parsed.success
            ? (nonEmpty(parsed.data.AbsolutePath) ?? nonEmpty(parsed.data.Path))
            : null
        if (raw_path === null) return deny('view_file needs a path.')
        const access = checkPathAccess({ state, raw_path, mode: 'read' })
        if (!access.ok) return access.decision
        return delegateToolCall({
            state,
            tool_name: 'Read',
            tool_input: { file_path: access.resolved },
            worktree: access.worktree_real,
        })
    }
    if (
        tool_name === 'grep_search' ||
        tool_name === 'find_by_name' ||
        tool_name === 'list_dir'
    ) {
        return checkSearchTool({ state, tool_name, tool_input })
    }
    if (
        tool_name === 'write_to_file' ||
        tool_name === 'replace_file_content' ||
        tool_name === 'multi_replace_file_content' ||
        tool_name === 'sed_file' ||
        tool_name === 'notebook_edit'
    ) {
        return checkWriteTool({ state, tool_name, tool_input })
    }
    if (tool_name === 'run_command') {
        const parsed = RunCommandInputSchema.safeParse(tool_input)
        if (!parsed.success) return deny('run_command needs a CommandLine.')
        if (parsed.data.IsDaemon === true)
            return deny('No background commands.')
        if (parsed.data.BypassSandbox === true) {
            return deny('Every command runs in the sandbox.')
        }
        const worktree_real = normalizeRoot(state.worktree_real)
        if (worktree_real === null) {
            return deny('Worktree path could not be resolved.')
        }
        return delegateToolCall({
            state,
            tool_name: 'Bash',
            tool_input: { command: parsed.data.CommandLine },
            worktree: worktree_real,
        })
    }
    return deny(`Tool ${tool_name} is not allowed for role ${state.role}.`)
}
