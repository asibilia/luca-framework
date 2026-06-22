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
    stringifyError,
    WRITE_COMMAND_PHASES,
    type PipelineStep,
} from '@alecsibilia/luca-core'
import type { ArgsDef, CommandDef } from 'citty'

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
            `luca ${command}: handler error — ${stringifyError(err)}`
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
 * Convert a kebab-case flag name to camelCase (`metadata-file` → `metadataFile`).
 *
 * @param name - The flag name without leading dashes.
 * @returns The camelCase variant of the name.
 */
function toCamelCase(name: string): string {
    return name.replace(/-([a-z0-9])/g, (_match, char: string) =>
        char.toUpperCase()
    )
}

/**
 * Convert a camelCase flag name to kebab-case (`metadataFile` → `metadata-file`).
 *
 * @param name - The flag name without leading dashes.
 * @returns The kebab-case variant of the name.
 */
function toKebabCase(name: string): string {
    return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

/**
 * Reject undeclared `--flags` in a citty command invocation.
 *
 * citty's `parseArgs` runs with `strict: false`, so unknown long flags are
 * silently merged into `args` and then dropped by the Zod schema — a typo'd
 * flag (`--metadat-file`) would be swallowed without a trace. Leaf commands
 * call this helper at the top of `run()` with the citty context's `cmd` and
 * `rawArgs` to close that hole before any handler work happens.
 *
 * The allowed set is built from the command's declared `cmd.args` keys plus,
 * for each key, both its camelCase and kebab-case spellings (citty
 * auto-aliases multi-word flags, e.g. `metadata-file` ↔ `metadataFile`), any
 * declared `alias` entries, and citty's built-in `help` / `version` flags.
 *
 * Token-scan semantics over `rawArgs` (not a parsed-key diff):
 * - a bare `--` terminator stops scanning entirely (everything after is
 *   positional by convention),
 * - `--flag=value` is matched on the name before the `=`,
 * - a `--no-` prefix on an undeclared name is retried against the base name
 *   (citty boolean negation),
 * - short flags (`-x`) and positionals are ignored.
 *
 * On an unknown flag the process prints an error naming the flag and the
 * command, then exits 1 — mirroring {@link runWriteHandler}'s error style.
 *
 * @param command - The noun/verb command name (e.g. `'state advance'`),
 *   used in the error message.
 * @param cmd - The citty {@link CommandDef} from the run context. Generic
 *   over the leaf's concrete `ArgsDef` because `CommandDef<T>` is invariant
 *   in `T` (via `setup`), so concrete defs are not assignable to
 *   `CommandDef<ArgsDef>`. Its `args` must be a plain object (all
 *   write-surface commands declare args inline); lazy/async `Resolvable`
 *   arg defs are treated as undeclared.
 * @param rawArgs - The raw argv tokens from the citty run context.
 * @returns Nothing on success; exits the process on the first unknown flag.
 *
 * @example
 * ```typescript
 * async run({ args, rawArgs, cmd }) {
 *     rejectUnknownFlags('state advance', cmd, rawArgs)
 *     await runWriteHandler('state advance', lucaStateAdvanceTool, {
 *         toStep: args['to-step'],
 *     })
 * }
 * ```
 */
export function rejectUnknownFlags<TArgsDef extends ArgsDef>(
    command: string,
    cmd: CommandDef<TArgsDef>,
    rawArgs: string[]
): void {
    const argsDef: ArgsDef =
        typeof cmd.args === 'object' &&
        cmd.args !== null &&
        !(cmd.args instanceof Promise)
            ? cmd.args
            : {}

    // citty built-ins (`--help` / `--version`) are accepted unless shadowed
    // by a user arg — accepting them unconditionally here is safe either way.
    const allowed = new Set<string>(['help', 'version'])
    for (const [key, def] of Object.entries(argsDef)) {
        allowed.add(key)
        allowed.add(toCamelCase(key))
        allowed.add(toKebabCase(key))
        const aliases =
            'alias' in def && def.alias !== undefined
                ? Array.isArray(def.alias)
                    ? def.alias
                    : [def.alias]
                : []
        for (const alias of aliases) {
            allowed.add(alias)
            allowed.add(toCamelCase(alias))
            allowed.add(toKebabCase(alias))
        }
    }

    for (const token of rawArgs) {
        if (token === '--') {
            break
        }
        if (!token.startsWith('--')) {
            continue
        }
        let name = token.slice(2)
        const eqIndex = name.indexOf('=')
        if (eqIndex !== -1) {
            name = name.slice(0, eqIndex)
        }
        if (allowed.has(name)) {
            continue
        }
        // `--no-foo` negates boolean `foo` in citty — retry the base name.
        if (name.startsWith('no-') && allowed.has(name.slice(3))) {
            continue
        }
        console.error(
            `luca ${command}: unknown flag '--${name}' — not a declared ` +
                `flag of this command. Run 'luca ${command} --help' to ` +
                `list supported flags.`
        )
        process.exit(1)
    }
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
            `luca ${command}: could not read --file '${filePath}' — ${stringifyError(
                err
            )}`
        )
        process.exit(1)
    }
    try {
        return JSON.parse(raw)
    } catch (err) {
        console.error(
            `luca ${command}: --file '${filePath}' is not valid JSON — ${stringifyError(
                err
            )}`
        )
        process.exit(1)
    }
}
