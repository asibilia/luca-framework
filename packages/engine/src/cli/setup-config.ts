/**
 * `luca setup`'s config side: guessing the checks from `package.json`,
 * finding what is at `.luca/config.json`, writing a starting one, and the
 * done and to-do lines for a config that loads.
 */
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { z } from 'zod'

import {
    ENGINE_CONFIG_FILE,
    EngineConfigSchema,
    givesPerTestResults,
    isBunTestCommand,
    MuninnConfigSchema,
    testCommands,
    type EngineConfig,
    type TestCommand,
} from '../config/engine-config'

/**
 * The top-level and `muninn` keys of a new-style engine config, from its
 * schema. A config with any other key (such as old Luca's `lucaVersion`) is
 * an old-Luca config.
 */
const NEW_CONFIG_KEYS = new Set(Object.keys(EngineConfigSchema.shape))
const NEW_MUNINN_KEYS = new Set(Object.keys(MuninnConfigSchema.shape))

const PackageJsonSchema = z.looseObject({
    scripts: z.record(z.string(), z.string()).default({}),
})

export const errorText = (error: unknown): string =>
    error instanceof Error ? error.message : String(error)

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The checks guessed from `package.json` scripts: `test` and `test:*`
 * become test commands (a script that is a `bun test` command runs as
 * written and is bun-readable; the rest run with `bun run` and are
 * pass-or-fail), `type-check` or `typecheck` becomes types, and `lint`
 * becomes lint. Pure.
 *
 * @example
 * guessChecks({ scripts: { test: 'bun test', 'test:workers': 'vitest run', lint: 'eslint .' } })
 * // { test: [{ run: 'bun test', results: 'bun' }, { run: 'bun run test:workers', results: 'pass_fail' }], lint: 'bun run lint' }
 */
export const guessChecks = ({
    scripts,
}: {
    scripts: Record<string, string>
}): EngineConfig['checks'] => {
    const test: Pick<TestCommand, 'run' | 'results'>[] = Object.entries(scripts)
        .filter(([name]) => name === 'test' || name.startsWith('test:'))
        .toSorted(([a], [b]) => Number(b === 'test') - Number(a === 'test'))
        .map(([name, script]) =>
            isBunTestCommand(script)
                ? { run: script.trim(), results: 'bun' }
                : { run: `bun run ${name}`, results: 'pass_fail' }
        )
    const types = ['type-check', 'typecheck'].find(
        (name) => scripts[name] !== undefined
    )
    return {
        ...(test.length === 0 ? {} : { test }),
        ...(types === undefined ? {} : { types: `bun run ${types}` }),
        ...(scripts.lint === undefined ? {} : { lint: 'bun run lint' }),
    }
}

/** The repo's `package.json` scripts; none when it has no readable one. */
export const readScripts = async ({
    repo,
}: {
    repo: string
}): Promise<Record<string, string>> => {
    const file = Bun.file(join(repo, 'package.json'))
    if (!(await file.exists())) return {}
    try {
        const parsed = PackageJsonSchema.safeParse(
            JSON.parse(await file.text())
        )
        return parsed.success ? parsed.data.scripts : {}
    } catch {
        return {}
    }
}

/** What is at `.luca/config.json` before setup touches it. */
export type FoundConfig =
    | { kind: 'missing' }
    | { kind: 'broken'; error: string }
    | { kind: 'old'; raw: Record<string, unknown> }
    | { kind: 'new' }

export const findConfig = async ({
    repo,
}: {
    repo: string
}): Promise<FoundConfig> => {
    const file = Bun.file(join(repo, ENGINE_CONFIG_FILE))
    if (!(await file.exists())) return { kind: 'missing' }
    let raw: unknown
    try {
        raw = JSON.parse(await file.text())
    } catch (error) {
        return { kind: 'broken', error: `it isn't JSON: ${errorText(error)}` }
    }
    if (!isRecord(raw)) {
        return { kind: 'broken', error: "it isn't a JSON object" }
    }
    const muninn = raw.muninn
    const old =
        Object.keys(raw).some((key) => !NEW_CONFIG_KEYS.has(key)) ||
        (isRecord(muninn) &&
            Object.keys(muninn).some((key) => !NEW_MUNINN_KEYS.has(key)))
    return old ? { kind: 'old', raw } : { kind: 'new' }
}

/** A starting config: the guessed checks, and the vault if there is one. */
export const startingConfig = ({
    scripts,
    vault,
}: {
    scripts: Record<string, string>
    vault: string | null
}): Record<string, unknown> => ({
    checks: guessChecks({ scripts }),
    ...(vault === null ? {} : { muninn: { vault } }),
})

const vaultName = (vault: unknown): string | null =>
    typeof vault === 'string' && vault.trim() !== '' ? vault : null

/**
 * The vault an old-Luca config names in `muninn.vault`, or else in an older
 * top-level `vault`, if any.
 */
export const oldVault = ({
    raw,
}: {
    raw: Record<string, unknown>
}): string | null =>
    vaultName(isRecord(raw.muninn) ? raw.muninn.vault : undefined) ??
    vaultName(raw.vault)

/**
 * The `name` part of a GitHub `owner/name`, a new repo's vault. Pure.
 *
 * @example
 * repoName({ github_repo: 'asibilia/tmnb' }) // 'tmnb'
 */
export const repoName = ({
    github_repo,
}: {
    github_repo: string | null
}): string | null => vaultName(github_repo?.split('/').at(-1)?.trim() ?? null)

export const writeConfig = async ({
    repo,
    config,
}: {
    repo: string
    config: Record<string, unknown>
}) => {
    const path = join(repo, ENGINE_CONFIG_FILE)
    await mkdir(dirname(path), { recursive: true })
    await Bun.write(path, `${JSON.stringify(config, null, 4)}\n`)
}

const READABLE: Record<TestCommand['results'], string> = {
    bun: 'bun-readable',
    junit: 'junit-readable',
    pass_fail: 'pass or fail',
}

const describeTest = ({ run, results }: TestCommand): string =>
    `\`${run}\` (${READABLE[results]})`

/** The done and to-do lines for a config that loads. */
export const reportConfig = ({
    config,
}: {
    config: EngineConfig
}): { done: string[]; todo: string[] } => {
    const tests = testCommands({ config })
    const done: string[] = []
    const todo: string[] = []
    if (tests.length === 0) {
        todo.push(
            `Add a test command to \`checks.test\` in ${ENGINE_CONFIG_FILE}. Intake refuses a run without one.`
        )
    } else {
        done.push(`Test commands: ${tests.map(describeTest).join(', ')}`)
        if (!tests.some(({ results }) => givesPerTestResults(results))) {
            todo.push(
                `No test command gives per-test results, so only refactor tickets can run. Add a \`bun test\` command, or one with \`"results": "junit"\`, to \`checks.test\` in ${ENGINE_CONFIG_FILE}.`
            )
        }
    }
    for (const kind of ['types', 'lint'] as const) {
        const command = config.checks[kind]
        if (command === undefined) {
            todo.push(
                `No ${kind} check. Add \`checks.${kind}\` to ${ENGINE_CONFIG_FILE} if the repo has one.`
            )
        } else {
            done.push(`The ${kind} check: \`${command}\``)
        }
    }
    return { done, todo }
}
