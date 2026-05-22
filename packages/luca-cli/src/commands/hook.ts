/**
 * CLI command: luca hook <hook-name>
 *
 * Entry point for the Claude Code hook handlers. The .claude/hooks/*.sh
 * scripts that `luca init` writes are thin shell wrappers that exec into
 * these subcommands.
 *
 * The stage-gate handler is enforcing: it parses the PreToolUse payload,
 * classifies the tool call against the phase/tool matrix, and exits
 * non-zero to block any call disallowed in the current phase.
 */
import { defineCommand } from 'citty'

import { handleStageGateHook } from '../hook'

const stageGateCommand = defineCommand({
    meta: {
        name: 'stage-gate',
        description:
            'PreToolUse stage-gate handler — parses stdin, checks phase rules, exits non-zero to block',
    },
    async run() {
        // Claude Code PreToolUse passes a JSON object on stdin describing
        // the about-to-run tool call.
        const stdin = await Bun.stdin.text()
        const result = await handleStageGateHook({
            stdin,
            log: (msg) => {
                // Use stderr for hook output so it surfaces in Claude Code's
                // hook failure messages without polluting tool output.
                console.error(msg)
            },
        })
        process.exit(result.exitCode)
    },
})

export const hookCommand = defineCommand({
    meta: {
        name: 'hook',
        description:
            'Hook handlers invoked by .claude/hooks/*.sh wrappers (not for direct user invocation)',
    },
    subCommands: {
        'stage-gate': stageGateCommand,
    },
})
