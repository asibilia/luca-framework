import { checkToolCall, type GuardRole } from './role-rules'

import type { EngineConfig } from '../config/engine-config'

/** Seam 3: what the guard rule tests share: a config, a worktree, and `decide`. */

export const CONFIG: EngineConfig = {
    checks: {
        test: 'bun test',
        types: 'bunx --bun tsc --noEmit',
        lint: 'bun run lint',
    },
    test_file_patterns: ['src/**/*.test.ts'],
    test_setup_files: ['src/test-setup.ts'],
    rule_files: [],
}

/** `CONFIG` with a feature map (#583). */
export const WITH_MAP: EngineConfig = {
    ...CONFIG,
    feature_map: 'docs/feature-map.md',
}

export const WORKTREE = '/runs/run-1/tickets/11'

/** `may_edit_tests` as the engine sets it on a normal (not refactor) ticket. */
export const usual = (role: GuardRole): boolean => role === 'test-writer'

export const decide = ({
    role,
    may_edit_tests,
    tool_name,
    tool_input,
}: {
    role: GuardRole
    /** Defaults to `usual(role)`. */
    may_edit_tests?: boolean
    tool_name: string
    tool_input: unknown
}): boolean =>
    checkToolCall({
        role,
        may_edit_tests: may_edit_tests ?? usual(role),
        tool_name,
        tool_input,
        worktree: WORKTREE,
        config: CONFIG,
    }).allow
