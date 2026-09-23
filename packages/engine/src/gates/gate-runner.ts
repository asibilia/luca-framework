import type { GateCheck, GateName } from './gate-schemas'
import { runTests } from './test-runner'

import type { EngineConfig } from '../config/engine-config'
import { clipOutput, runShell } from '../shell/run-command'

const shellCheck = async ({
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
 * Runs every gate the engine config names, in order: tests, types, lint.
 * All must pass. Unset gates are left out; intake refuses a config with no
 * test command.
 *
 * With an `install` command (see `installCommand`), the engine runs it first,
 * as the `install` check. A failed install stops there: the other gates
 * would only fail on the missing packages.
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
}: {
    cwd: string
    config: EngineConfig
    test_files: string[]
    report_file: string
    install: string | null
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
    const { test, types, lint } = config.checks
    if (test !== undefined) {
        const run = await runTests({
            cwd,
            command: test,
            test_files,
            report_file,
        })
        checks.push({
            name: 'test',
            command: test,
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
