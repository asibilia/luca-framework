/**
 * Commands barrel — the canonical list of `CommandDefinition`s shipped
 * with luca-tools.
 *
 * Each command lives in its own file:
 *   commands/<name>.ts → exports the `defineCommand` definition.
 *
 * Command bodies are markdown text (the body Claude Code inlines when
 * the user types `/<name>`) authored as JS template literals. Source
 * provenance per command is documented in the file header — the original
 * 17 were ported from the user's `~/.claude/commands/<name>.md` (the
 * canonical working copy at E-6 time).
 *
 * ## Why this list is shrinking: the fold-to-skill decision
 *
 * Every command here has (or had) a same-named skill. The two surfaces
 * were populated by two independent ports that were never reconciled —
 * skills at E-5 from the pre-D-4 `SKILL.md` files, commands at E-6 from
 * the user's `~/.claude/commands/` as "tighter, more imperative" prompts
 * — so the pair drifted, and the drift was load-bearing in both
 * directions. Shipping both means two bodies to keep in sync and a
 * coin-flip about which one a change lands in.
 *
 * The fold direction is forced, not chosen: the Antigravity harness
 * descriptor installs `{agents, skills}` and NOT commands
 * (`luca-cli/src/init/helpers/harness.ts`), so folding toward the command
 * surface would delete Luca from Antigravity entirely. Claude Code
 * already exposes each `SKILL.md` as `/<name>`, so the slash-invocation
 * surface survives the fold. Nothing in the repo programmatically invokes
 * a command; every `Skill(...)` call site lives in a skill body.
 *
 * Folded so far (command deleted, skill is now the only surface):
 * `bug-diagnose`, `gh-issue-triage`, `gh-pr-address`, `gh-prepare`,
 * `grill-me`, `lu`, `lu-review`, `luca-init`, `memory-audit`,
 * `repo-cleanup`. Each deletion is paired with a `RETIRED_ARTIFACTS`
 * entry in `luca-cli/src/init/helpers/install-skills.ts` — without it the
 * command survives forever in every existing `~/.claude/commands/`.
 *
 * The commands still listed below are the pairs whose command body
 * carries directives the skill does not; they fold only once those
 * directives are ported into the skill.
 *
 * Order is fixed (alphabetical) so the compile output is byte-stable
 * across runs.
 */

import { lucaTelemetryReportCommand } from './luca-telemetry-report.ts'
import { milestoneNewCommand } from './milestone-new.ts'
import { phaseDiscussCommand } from './phase-discuss.ts'
import { phaseExecuteCommand } from './phase-execute.ts'
import { phasePlanCommand } from './phase-plan.ts'
import { todoAddCommand } from './todo-add.ts'
import { todoCheckCommand } from './todo-check.ts'

import type { Artifact } from '../../define/index.ts'

export {
    lucaTelemetryReportCommand,
    milestoneNewCommand,
    phaseDiscussCommand,
    phaseExecuteCommand,
    phasePlanCommand,
    todoAddCommand,
    todoCheckCommand,
}

/**
 * Ordered list of every Luca-specific slash command shipped with
 * luca-tools. Alphabetical by command name for diff-friendly compile
 * output.
 */
export const COMMANDS: readonly Artifact[] = [
    lucaTelemetryReportCommand,
    milestoneNewCommand,
    phaseDiscussCommand,
    phaseExecuteCommand,
    phasePlanCommand,
    todoAddCommand,
    todoCheckCommand,
]
