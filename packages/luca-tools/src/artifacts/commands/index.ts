/**
 * Commands barrel — now empty by design.
 *
 * luca ships NO slash-command artifacts. Every one of the original 17
 * has been folded into its same-named skill, and this list is the
 * record of that decision rather than a staging area for new ones.
 *
 * ## Why the surface is gone
 *
 * Each command had a same-named skill. The two were populated by two
 * independent ports that were never reconciled — skills at E-5 from the
 * pre-D-4 `SKILL.md` files, commands at E-6 from the user's
 * `~/.claude/commands/` as "tighter, more imperative" prompts — so every
 * pair drifted, and the drift was load-bearing in both directions.
 * Shipping both meant two bodies to keep in sync and a coin-flip about
 * which one a change landed in.
 *
 * The fold DIRECTION was forced, not chosen: the Antigravity harness
 * descriptor installs `{agents, skills}` and NOT commands
 * (`luca-cli/src/init/helpers/harness.ts`), so folding toward the command
 * surface would have deleted Luca from Antigravity entirely. Claude Code
 * already exposes each `SKILL.md` as `/<name>`, so the slash-invocation
 * surface survives the fold intact. Nothing in the repo programmatically
 * invokes a command; every `Skill(...)` call site lives in a skill body.
 *
 * The fold happened in two passes:
 *
 *   - The MECHANICAL pairs (`bug-diagnose`, `gh-issue-triage`,
 *     `gh-pr-address`, `gh-prepare`, `grill-me`, `lu`, `lu-review`,
 *     `luca-init`, `memory-audit`, `repo-cleanup`, and
 *     `luca-telemetry-report`) — verbatim duplicates, thin
 *     "activate the skill" pointers, or a command strictly contained by
 *     its skill. Deleting them lost nothing.
 *
 *   - The DIVERGENT pairs (`milestone-new`, `phase-discuss`,
 *     `phase-execute`, `phase-plan`, `todo-add`, `todo-check`) — pairs
 *     whose two bodies genuinely disagreed. Each command-only directive
 *     was ported into the skill BEFORE the command was deleted, because
 *     several were the only copy of a load-bearing instruction: the
 *     `todo-add` "execute the returned muninn procedure" delegation
 *     (without it a todo validates and never persists), the
 *     `phase-plan` advance to `plan-review`, the `phase-discuss`
 *     canonical `<dir>/context.md` write recipe, the `milestone-new`
 *     `luca workflow reset --confirm` (the skill's bare form is refused
 *     by the handler and the refusal was being swallowed), and the
 *     `phase-execute` "do not commit during execute" rule that
 *     `STAGE_TOOL_MATRIX.EXECUTING['bash-commit'] === false` makes
 *     mandatory.
 *
 * Every deletion is paired with a `RETIRED_ARTIFACTS` entry in
 * `luca-cli/src/init/helpers/install-skills.ts` — without it the command
 * survives forever in every existing `~/.claude/commands/`. Note that the
 * eviction depends on the compiler still EMITTING an (empty) commands
 * bucket: see the `counts.command === 0` branch in `compile/index.ts`.
 *
 * ## Adding a command
 *
 * Don't. Author a skill instead — it reaches both harnesses and is
 * already slash-invocable in Claude Code. The `defineCommand` factory and
 * the `emitCommand` emitter are retained because the artifact kind is
 * still part of the compiler's contract, not because a command is
 * expected.
 */

import type { Artifact } from '../../define/index.ts'

/**
 * Ordered list of every Luca-specific slash command shipped with
 * luca-tools. Intentionally empty — see the module docstring.
 */
export const COMMANDS: readonly Artifact[] = []
