import type { GateCheck, GateName } from './gate-schemas'
import { reportFileFor, runTests } from './test-runner'

import { testCommands, type EngineConfig } from '../config/engine-config'
import { clipOutput, runShell } from '../shell/run-command'

/**
 * Runs one shell command as a named check: `ok` on exit 0, with the clipped
 * output only when it failed.
 *
 * @example
 * const install = await shellCheck({ name: 'install', command: 'bun install', cwd })
 */
export const shellCheck = async ({
    name,
    command,
    cwd,
}: {
    name: GateName
    command: string
    cwd: string
}): Promise<GateCheck> => {
    const result = await runShell({ command, cwd })
    const ok = result.exit_code === 0
    return {
        name,
        command,
        ok,
        exit_code: result.exit_code,
        output: ok
            ? ''
            : clipOutput({ text: `${result.stdout}\n${result.stderr}` }),
    }
}

/**
 * Runs the config's prepare command in `cwd`, as the `prepare` check, or
 * `null` when the config has none. The engine runs it before every test run
 * in a checkout, so tests that need build outputs find them up to date.
 *
 * @example
 * const prepare = await prepareCheck({ config, cwd })
 * if (prepare !== null && !prepare.ok) console.log(prepare.output)
 */
export const prepareCheck = async ({
    config,
    cwd,
}: {
    config: EngineConfig
    cwd: string
}): Promise<GateCheck | null> =>
    config.prepare === undefined
        ? null
        : shellCheck({ name: 'prepare', command: config.prepare, cwd })

/**
 * Runs every gate the engine config names, in order: each test command,
 * types, lint. All must pass. Unset gates are left out; intake refuses a
 * config with no test command. A `bun` test command runs with bun's JUnit
 * reporter; a `pass_fail` one runs as written and is judged by its exit code.
 *
 * With an `install` command (see `installCommand`), the engine runs it first,
 * as the `install` check. A failed install stops there: the other gates
 * would only fail on the missing packages. The config's prepare command
 * runs next, as the `prepare` check, and a failed one stops there too.
 * `around_prepare`, if given, runs the prepare check (so the engine can see
 * what it made).
 *
 * @example
 * const { ok, checks } = await runGates({ cwd, config, test_files, report_file, install: null })
 */
export const runGates = async ({
    cwd,
    config,
    test_files,
    report_file,
    install,
    around_prepare,
}: {
    cwd: string
    config: EngineConfig
    test_files: string[]
    report_file: string
    install: string | null
    /** Wraps the prepare run. Left out, it runs as is. */
    around_prepare?: (
        prepare: () => Promise<GateCheck | null>
    ) => Promise<GateCheck | null>
}): Promise<{ ok: boolean; checks: GateCheck[] }> => {
    const checks: GateCheck[] = []
    if (install !== null) {
        const installed = await shellCheck({
            name: 'install',
            command: install,
            cwd,
        })
        checks.push(installed)
        if (!installed.ok) return { ok: false, checks }
    }
    const prepare = () => prepareCheck({ config, cwd })
    const prepared = await (around_prepare?.(prepare) ?? prepare())
    if (prepared !== null) {
        checks.push(prepared)
        if (!prepared.ok) return { ok: false, checks }
    }
    const { types, lint } = config.checks
    for (const [index, { run: command, results }] of testCommands({
        config,
    }).entries()) {
        if (results === 'pass_fail') {
            checks.push(await shellCheck({ name: 'test', command, cwd }))
            continue
        }
        const run = await runTests({
            cwd,
            command,
            test_files,
            report_file: reportFileFor({ report_file, index }),
        })
        checks.push({
            name: 'test',
            command,
            ok: run.ok,
            exit_code: run.exit_code,
            output: run.ok ? '' : run.output,
        })
    }
    const others: { name: GateName; command: string | undefined }[] = [
        { name: 'types', command: types },
        { name: 'lint', command: lint },
    ]
    for (const { name, command } of others) {
        if (command === undefined) continue
        checks.push(await shellCheck({ name, command, cwd }))
    }
    return { ok: checks.every(({ ok }) => ok), checks }
}
