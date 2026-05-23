/**
 * Commands barrel — the canonical list of `CommandDefinition`s shipped
 * with luca-tools.
 *
 * Each command lives in its own file:
 *   commands/<name>.ts → exports the `defineCommand` definition.
 *
 * Command bodies are markdown text (the body Claude Code inlines when
 * the user types `/<name>`) authored as JS template literals. Source
 * provenance per command is documented in the file header — all 17 were
 * ported from the user's `~/.claude/commands/<name>.md` (the canonical
 * working copy at E-6 time).
 *
 * Why we ship BOTH SKILL.md and commands/<name>.md for these 17:
 * Claude Code's SKILL.md surface auto-triggers based on the skill's
 * description, and the harness ALSO exposes SKILL.md as a `/<name>`
 * slash command. But the user has maintained `~/.claude/commands/`
 * separately, with bodies that are meaningfully different from the
 * corresponding SKILL.md bodies — the commands are tighter, more
 * imperative "what to do right now when the user explicitly types
 * /<name>" prompts (e.g. `/lu` is the orchestrator script that drives
 * the pipeline loop end-to-end, distinct from the `lu` skill which is
 * the routing surface). Per the E-6 decision algorithm, we port the
 * user's command bodies verbatim (with .planning/ → .luca/ already
 * applied by the user). E-5's SKILL.md ports stand as-is.
 *
 * Order is fixed (alphabetical) so the compile output is byte-stable
 * across runs.
 */
import type { Artifact } from '../../define/index.ts'

import { bugDiagnoseCommand } from './bug-diagnose.ts'
import { ghIssueTriageCommand } from './gh-issue-triage.ts'
import { ghPrAddressCommand } from './gh-pr-address.ts'
import { ghPrepareCommand } from './gh-prepare.ts'
import { grillMeCommand } from './grill-me.ts'
import { luCommand } from './lu.ts'
import { luReviewCommand } from './lu-review.ts'
import { lucaInitCommand } from './luca-init.ts'
import { lucaTelemetryReportCommand } from './luca-telemetry-report.ts'
import { memoryAuditCommand } from './memory-audit.ts'
import { milestoneNewCommand } from './milestone-new.ts'
import { phaseDiscussCommand } from './phase-discuss.ts'
import { phaseExecuteCommand } from './phase-execute.ts'
import { phasePlanCommand } from './phase-plan.ts'
import { repoCleanupCommand } from './repo-cleanup.ts'
import { todoAddCommand } from './todo-add.ts'
import { todoCheckCommand } from './todo-check.ts'

export {
    bugDiagnoseCommand,
    ghIssueTriageCommand,
    ghPrAddressCommand,
    ghPrepareCommand,
    grillMeCommand,
    luCommand,
    luReviewCommand,
    lucaInitCommand,
    lucaTelemetryReportCommand,
    memoryAuditCommand,
    milestoneNewCommand,
    phaseDiscussCommand,
    phaseExecuteCommand,
    phasePlanCommand,
    repoCleanupCommand,
    todoAddCommand,
    todoCheckCommand,
}

/**
 * Ordered list of every Luca-specific slash command shipped with
 * luca-tools. Alphabetical by command name for diff-friendly compile
 * output.
 */
export const COMMANDS: readonly Artifact[] = [
    bugDiagnoseCommand,
    ghIssueTriageCommand,
    ghPrAddressCommand,
    ghPrepareCommand,
    grillMeCommand,
    luCommand,
    luReviewCommand,
    lucaInitCommand,
    lucaTelemetryReportCommand,
    memoryAuditCommand,
    milestoneNewCommand,
    phaseDiscussCommand,
    phaseExecuteCommand,
    phasePlanCommand,
    repoCleanupCommand,
    todoAddCommand,
    todoCheckCommand,
]
