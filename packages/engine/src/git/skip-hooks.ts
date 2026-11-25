/**
 * The variable a repo's git hooks read to skip their checks inside a Luca
 * run (#788). The engine sets it to `1` in its own environment when a run
 * starts, so every process it starts has it: its gates and git calls, and
 * its agents (it's on the agents' allow-list). Those worktrees already run
 * the same checks as gates, so a hook running them again only costs time.
 * The engine's own commits and pushes pass `--no-verify` as well.
 *
 * A hook skips when it is `1`:
 *
 * @example
 * // .githooks/pre-push
 * // [ "$LUCA_SKIP_HOOKS" = 1 ] && exit 0
 * // exec luca check --skip-slow
 */
export const SKIP_HOOKS_ENV = 'LUCA_SKIP_HOOKS'
