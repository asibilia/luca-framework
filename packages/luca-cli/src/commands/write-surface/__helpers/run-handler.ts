/**
 * Shared execution helper for the `luca` write-surface CLI leaf commands.
 *
 * Every leaf command in `src/commands/write-surface/<noun>.ts` follows the
 * same shape: optionally self-check a phase precondition, validate the raw
 * arguments against the handler's Zod schema, invoke the matching
 * `src/write-surface/` handler, print the joined result text, and exit 0/1.
 * This module owns that shared flow so leaf commands stay thin.
 *
 * The handler contract is the v13 `WriteResult`
 * (`{ content: { type: 'text'; text: string }[]; isError? }`). We print the
 * joined `content[].text` and exit `isError ? 1 : 0`.
 *
 * Argument validation mirrors the MCP transport: the raw arg object is run
 * through `tool.inputSchema.safeParse` (applying schema defaults) before
 * the handler sees it — the handlers trust their parsed input.
 */
import { readFile } from 'node:fs/promises'

import {
    loadCurrentState,
    WRITE_COMMAND_PHASES,
    type PipelineStep,
} from '@alecsibilia/luca-core'

import type { ToolDescriptor } from '../../../write-surface/index.ts'

/**
 * Invoke a write-surface handler from a CLI leaf command.
 *
 * @param command - The noun/verb command name (e.g. `'state advance'`),
 *   used to look up the phase precondition in {@link WRITE_COMMAND_PHASES}.
 * @param tool - The write-surface {@link ToolDescriptor} to invoke.
 * @param rawArgs - The raw argument object built from CLI flags / `--file`
 *   payloads. Validated against `tool.inputSchema` before invocation.
 * @returns Never — always calls `process.exit`.
 *
 * @remarks
 * Phase self-check: if `command` has a non-empty entry in
 * `WRITE_COMMAND_PHASES`, the current `.luca/state.json` `pipelineStep`
 * must be in the allowed set, otherwise the command refuses with exit 1.
 * Pure reads (entries mapped to `[]`) skip the check.
 */
export async function runWriteHandler<TArgs>(
    command: string,
    tool: ToolDescriptor<TArgs>,
    rawArgs: unknown
): Promise<never> {
    const cwd = process.cwd()

    // Phase self-check — only for commands with a non-empty allowed-phase set.
    const allowedPhases: PipelineStep[] | undefined = WRITE_COMMAND_PHASES[
        command
    ] as PipelineStep[] | undefined
    if (allowedPhases && allowedPhases.length > 0) {
        const state = await loadCurrentState({ cwd })
        if (!allowedPhases.includes(state.pipelineStep)) {
            console.error(
                `luca ${command}: refused — current pipelineStep is ` +
                    `'${state.pipelineStep}', but this command is only ` +
                    `allowed in: [${allowedPhases.join(', ')}].`
            )
            process.exit(1)
        }
    }

    // Validate raw args via the handler's Zod schema (mirrors the MCP path).
    const parsed = tool.inputSchema.safeParse(rawArgs)
    if (!parsed.success) {
        console.error(
            `luca ${command}: invalid arguments — ${parsed.error.issues
                .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
                .join('; ')}`
        )
        process.exit(1)
    }

    let result
    try {
        result = await tool.handler(parsed.data, { cwd })
    } catch (err) {
        console.error(
            `luca ${command}: handler error — ${
                err instanceof Error ? err.message : String(err)
            }`
        )
        process.exit(1)
    }

    const text = result.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n')

    if (result.isError) {
        console.error(text)
        process.exit(1)
    }

    console.log(text)
    process.exit(0)
}

/**
 * Read a JSON payload file referenced by a `--file` flag and parse it.
 *
 * Used by leaf commands whose handler input includes a structured payload
 * too large for a flag (e.g. `roadmap create`'s phases array). On any
 * read/parse failure the process exits 1 with a clear message.
 *
 * @param command - The noun/verb command name, used in error messages.
 * @param filePath - The path supplied via `--file`.
 * @returns The parsed JSON value.
 */
export async function readJsonPayload(
    command: string,
    filePath: string
): Promise<unknown> {
    let raw: string
    try {
        raw = await readFile(filePath, 'utf-8')
    } catch (err) {
        console.error(
            `luca ${command}: could not read --file '${filePath}' — ${
                err instanceof Error ? err.message : String(err)
            }`
        )
        process.exit(1)
    }
    try {
        return JSON.parse(raw)
    } catch (err) {
        console.error(
            `luca ${command}: --file '${filePath}' is not valid JSON — ${
                err instanceof Error ? err.message : String(err)
            }`
        )
        process.exit(1)
    }
}
