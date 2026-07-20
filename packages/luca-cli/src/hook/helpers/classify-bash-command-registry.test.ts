/**
 * Registry-completeness invariants binding the cli.ts sub-command map to the
 * stage-gate bash classifier's `luca` registries.
 *
 * Guards the drift class where a new CLI noun (or a new verb on an existing
 * noun) ships without a matching classifier entry, so its invocation falls
 * through to the unknown-command → bash-mutate path and gets stage-gate
 * blocked in restrictive pipeline steps (the `luca budget check` gap).
 */
import { describe, expect, test } from 'bun:test'

import { WRITE_COMMAND_PHASES } from '@alecsibilia/luca-core'

import { CLI_SUBCOMMANDS } from '../../cli.ts'
import {
    LUCA_NOUN_VERBS,
    LUCA_READ_VERBS,
    LUCA_TOPLEVEL_READ,
    LUCA_TOPLEVEL_WRITE,
} from './classify-bash-command.ts'

import type { CommandDef, SubCommandsDef } from 'citty'

/**
 * Documented classifier exclusions — nouns deliberately omitted from every
 * classifier set so they fall through to the conservative unknown-command →
 * bash-mutate path (blocked in gated phases). Mirrors the deliberate-exclusion
 * comment on LUCA_TOPLEVEL_WRITE in classify-bash-command.ts. The `luca-write`
 * classification rests on the command self-enforcing its phase preconditions;
 * none of these do. Any other cli.ts noun MUST be registered; do not grow
 * this set to make invariant 1 pass without the same justification.
 */
const DELIBERATELY_UNCLASSIFIED = new Set([
    // Internal command — invoked by shell wrappers, never by agents.
    'hook',
    // `statusline install` rewrites `~/.claude/settings.json` (harness
    // settings mutation, no phase guard).
    'statusline',
    // Runner daemon lifecycle — harness/user-invoked, no phase guard.
    'start',
    // `stop` unconditionally calls forcePipelineUnlock (deletes
    // .luca/lock.json, runner.ts) — no phase guard.
    'stop',
])

const cliNouns = Object.keys(CLI_SUBCOMMANDS)
const classifierNouns = Object.keys(LUCA_NOUN_VERBS)

/**
 * Resolve a CLI_SUBCOMMANDS entry to its citty CommandDef. Entries are lazy
 * import thunks; most resolve the named export directly, but tolerate
 * `m.default`-style module returns (e.g. the doctor thunk resolves
 * `m.default`, so a future noun thunk may too).
 */
const resolveCommandDef = async (thunk: unknown): Promise<CommandDef> => {
    const resolved =
        typeof thunk === 'function'
            ? await (thunk as () => unknown)()
            : await thunk
    const def =
        resolved !== null && typeof resolved === 'object' && 'default' in resolved
            ? (resolved as { default: unknown }).default
            : resolved
    return def as CommandDef
}

/** Resolve a CommandDef's (possibly lazy) subCommands map. */
const resolveSubCommands = async (def: CommandDef): Promise<SubCommandsDef> => {
    const sub =
        typeof def.subCommands === 'function'
            ? await def.subCommands()
            : await def.subCommands
    return sub ?? {}
}

describe('classifier registry — invariant 1: every cli.ts noun is classified', () => {
    test.each(cliNouns)(
        'noun %s ∈ LUCA_NOUN_VERBS ∪ LUCA_TOPLEVEL_READ ∪ LUCA_TOPLEVEL_WRITE ∪ DELIBERATELY_UNCLASSIFIED',
        (noun) => {
            const registered =
                noun in LUCA_NOUN_VERBS ||
                LUCA_TOPLEVEL_READ.has(noun) ||
                LUCA_TOPLEVEL_WRITE.has(noun) ||
                DELIBERATELY_UNCLASSIFIED.has(noun)
            // On failure the diff names the unregistered noun explicitly.
            expect({ noun, registered }).toEqual({ noun, registered: true })
        }
    )
})

describe('classifier registry — invariant 2: registered verb sets equal cli.ts subCommands', () => {
    test.each(classifierNouns)(
        'LUCA_NOUN_VERBS[%s] equals the noun command def subCommands keys',
        async (noun) => {
            const thunk =
                CLI_SUBCOMMANDS[noun as keyof typeof CLI_SUBCOMMANDS]
            // Invariant 3 covers absence; skip the equality check for a noun
            // missing from cli.ts so the failure surfaces there by name.
            if (thunk === undefined) return
            const def = await resolveCommandDef(thunk)
            const cliVerbs = Object.keys(await resolveSubCommands(def)).sort()
            const registeredVerbs = [...LUCA_NOUN_VERBS[noun]!].sort()
            // Sorted-array equality — catches both drift directions
            // (unregistered new verb AND stale registered verb).
            expect({ noun, verbs: registeredVerbs }).toEqual({
                noun,
                verbs: cliVerbs,
            })
        }
    )
})

describe('classifier registry — invariant 3: no dead LUCA_NOUN_VERBS entries', () => {
    test.each(classifierNouns)(
        'LUCA_NOUN_VERBS noun %s exists in CLI_SUBCOMMANDS',
        (noun) => {
            expect(cliNouns).toContain(noun)
        }
    )
})

describe('classifier registry — deliberate exclusions stay unregistered', () => {
    test.each([...DELIBERATELY_UNCLASSIFIED])(
        'excluded noun %s appears in no classifier set',
        (noun) => {
            // anti-04 companion: excluded nouns must never be registered —
            // the classifier must keep letting them fall through to the
            // conservative bash-mutate default (no phase self-enforcement).
            expect(noun in LUCA_NOUN_VERBS).toBe(false)
            expect(LUCA_TOPLEVEL_READ.has(noun)).toBe(false)
            expect(LUCA_TOPLEVEL_WRITE.has(noun)).toBe(false)
        }
    )
})

describe('classifier registry — invariant 4: registries are pairwise disjoint', () => {
    // Dual membership never fails loudly — classifyLucaCommand resolves in
    // LUCA_NOUN_VERBS-first order (classify-bash-command.ts, noun lookup
    // before the top-level fallbacks), so a noun in two sets silently takes
    // the NOUN_VERBS classification and the other entry becomes dead. Keep
    // the three registries pairwise disjoint so every entry is live.
    const registries: Array<[string, ReadonlySet<string>]> = [
        ['LUCA_NOUN_VERBS keys', new Set(Object.keys(LUCA_NOUN_VERBS))],
        ['LUCA_TOPLEVEL_READ', LUCA_TOPLEVEL_READ],
        ['LUCA_TOPLEVEL_WRITE', LUCA_TOPLEVEL_WRITE],
    ]

    for (let i = 0; i < registries.length; i += 1) {
        for (let j = i + 1; j < registries.length; j += 1) {
            const [nameA, setA] = registries[i]!
            const [nameB, setB] = registries[j]!
            test(`${nameA} ∩ ${nameB} = ∅`, () => {
                const overlap = [...setA].filter((n) => setB.has(n)).sort()
                expect(overlap).toEqual([])
            })
        }
    }
})

/**
 * Every `<noun> <verb>` pair whose verb is NOT a global read verb
 * (LUCA_READ_VERBS) classifies `luca-write`, so the CLI's own
 * WRITE_COMMAND_PHASES self-check is the ONLY phase enforcement it gets. A
 * missing key there is a silent SKIP of the phase check (never a deny), so an
 * unregistered write verb would ship without phase enforcement. This binds
 * the classifier's write surface to the luca-core phase table so that gap
 * fails loudly here.
 *
 * Read verbs are exempt: they classify `bash-readonly` and are governed by
 * the phase matrix, not WRITE_COMMAND_PHASES.
 */
const writeVerbPairs: Array<[string, string]> = classifierNouns.flatMap(
    (noun) =>
        [...LUCA_NOUN_VERBS[noun]!]
            .filter((verb) => !LUCA_READ_VERBS.has(verb))
            .map((verb): [string, string] => [noun, verb])
)

describe('classifier registry — invariant 5: every write verb has a WRITE_COMMAND_PHASES key', () => {
    test.each(writeVerbPairs)(
        '`luca %s %s` (verb ∉ LUCA_READ_VERBS) has a WRITE_COMMAND_PHASES key',
        (noun, verb) => {
            const key = `${noun} ${verb}`
            const registered = key in WRITE_COMMAND_PHASES
            // On failure the diff names the unregistered write pair explicitly.
            expect({ key, registered }).toEqual({ key, registered: true })
        }
    )
})
