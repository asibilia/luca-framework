import type { GateCheck, GateName } from './gate-schemas'
import { runTests } from './test-runner'

import type { EngineConfig } from '../config/engine-config'
import { clipOutput, runShell } from '../shell/run-command'

/**
 * Runs every gate the engine config names, in order: tests, types, lint.
 * All must pass. Unset gates are left out; intake refuses a config with no
 * test command.
 *
 * @example
 * const { ok, checks } = await runGates({ cwd, config, test_files, report_file })
 */
export const runGates = async ({
    cwd,
    config,
    test_files,
    report_file,
}: {
    cwd: string
    config: EngineConfig
    test_files: string[]
    report_file: string
}): Promise<{ ok: boolean; checks: GateCheck[] }> => {
    const checks: GateCheck[] = []
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
        const result = await runShell({ command, cwd })
        const ok = result.exit_code === 0
        checks.push({
            name,
            command,
            ok,
            exit_code: result.exit_code,
            output: ok
                ? ''
                : clipOutput({ text: `${result.stdout}\n${result.stderr}` }),
        })
    }
    return { ok: checks.every(({ ok }) => ok), checks }
}
