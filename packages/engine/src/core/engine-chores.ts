/**
 * The owner chores the engine does for a writer after its turn (#618): the
 * file modes it asked for, and the repo's generators it named. Agents can
 * do neither themselves.
 */
import { chmod, lstat, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'

import type { BuildContext } from './build-context'

import type { FileMode, RoleResult } from '../agents/role-results'
import { testTimeoutOf } from '../config/engine-config'
import { shellCheck } from '../gates/gate-runner'
import { endedText, type GateCheck } from '../gates/gate-schemas'
import { TEST_TIMEOUT_HINT } from '../gates/test-runner'
import type { GuardArgs } from '../guards/guard-roles'
import { mayWrite } from '../guards/write-rules'

/** The chores a result asks for, or `null` for a role that asks none. */
const choresOf = ({
    result,
}: {
    result: RoleResult
}): { file_modes: FileMode[]; run_generators: string[] } | null =>
    result.role === 'test-writer' || result.role === 'implementer'
        ? result.result
        : null

/**
 * Sets one file's mode, or says why not: a path the role may not write, no
 * regular file there, or a real path (through a symlinked folder) that
 * leaves the worktree or that the role may not write (#624).
 */
const applyMode = async ({
    cwd,
    mode,
    guard,
    context,
}: {
    cwd: string
    mode: FileMode
    guard: GuardArgs
    context: BuildContext
}): Promise<string | null> => {
    const { path, executable } = mode
    if (!mayWrite({ ...guard, path, config: context.config })) {
        return `file_modes: ${path} is a path your role may not write, so its mode was not changed.`
    }
    const full = join(cwd, path)
    const found = await lstat(full).catch(() => null)
    const real = await realpath(full).catch(() => null)
    if (found === null || !found.isFile() || real === null) {
        return `file_modes: ${path} is not a file in the worktree, so no mode was set.`
    }
    // A symlinked folder on the way must not lead the mode elsewhere.
    const inside = relative(await realpath(cwd), real)
    if (
        inside === '..' ||
        inside.startsWith(`..${sep}`) ||
        isAbsolute(inside)
    ) {
        return `file_modes: ${path} is really ${real}, outside the worktree, so its mode was not changed.`
    }
    if (!mayWrite({ ...guard, path: inside, config: context.config })) {
        return `file_modes: ${path} is really ${inside}, a path your role may not write, so its mode was not changed.`
    }
    const mode_bits = executable ? found.mode | 0o111 : found.mode & ~0o111
    await chmod(real, mode_bits & 0o7777)
    return null
}

/** Runs one named generator, as a `generate` check, or says it has none. */
const runGenerator = async ({
    cwd,
    name,
    context,
}: {
    cwd: string
    name: string
    context: BuildContext
}): Promise<{ check: GateCheck | null; problem: string | null }> => {
    const generators = context.config.generators ?? {}
    // Own names only: `constructor` and friends are inherited, not named.
    const command = Object.hasOwn(generators, name)
        ? generators[name]
        : undefined
    if (command === undefined) {
        const known = Object.keys(generators).map((other) => `"${other}"`)
        return {
            check: null,
            problem: `run_generators: "${name}" is not a generator this repo names (${known.length === 0 ? 'it names none' : `it names ${known.join(', ')}`}).`,
        }
    }
    const check = await shellCheck({
        name: 'generate',
        command,
        cwd,
        timeout_ms: testTimeoutOf({ config: context.config }),
        timeout_hint: TEST_TIMEOUT_HINT,
    })
    return {
        check,
        problem: check.ok
            ? null
            : `run_generators: the generator "${name}" (\`${command}\`) failed (${endedText(check)}):\n${check.output}`,
    }
}

/**
 * Does the chores a writer's result asks for, in its worktree: each file
 * mode, on a path the role may write (others are refused and left as they
 * are), then each named generator, in order, as a `generate` check with the
 * test time limit. What they change is committed with the rest of the
 * turn's work. Journals `chores_done` when the result asked for any.
 *
 * @returns The problems, for the role's fix loop: a refused path, an
 *   unknown generator, or a failed one. Empty when every chore was done.
 *
 * @example
 * const problems = await doChores({ context, cwd, result, guard })
 */
export const doChores = async ({
    context,
    cwd,
    ticket,
    result,
    guard,
}: {
    context: BuildContext
    cwd: string
    /** `null` in the final review. */
    ticket: number | null
    result: RoleResult
    guard: GuardArgs
}): Promise<string[]> => {
    const chores = choresOf({ result })
    if (
        chores === null ||
        (chores.file_modes.length === 0 && chores.run_generators.length === 0)
    ) {
        return []
    }
    const problems: string[] = []
    const file_modes: FileMode[] = []
    for (const mode of chores.file_modes) {
        const problem = await applyMode({ cwd, mode, guard, context })
        if (problem === null) file_modes.push(mode)
        else problems.push(problem)
    }
    const checks: GateCheck[] = []
    for (const name of chores.run_generators) {
        const ran = await runGenerator({ cwd, name, context })
        if (ran.check !== null) checks.push(ran.check)
        if (ran.problem !== null) problems.push(ran.problem)
    }
    context.journal.append({
        kind: 'chores_done',
        ticket,
        role: result.role,
        content: { role: result.role, file_modes, checks, problems },
    })
    return problems
}
