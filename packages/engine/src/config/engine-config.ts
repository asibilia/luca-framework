import { join } from 'node:path'

import { z } from 'zod'

/** The engine config file's name, at the root of the repo a run works on. */
export const ENGINE_CONFIG_FILE = 'luca.config.json'

/**
 * The per-repo engine config: the gate commands, where tests live, the rule
 * files for the rules lens, and the project's memory vault.
 *
 * The test command is optional here on purpose. A config without it still
 * loads, and intake refuses the run with a clear message instead.
 */
export const EngineConfigSchema = z.object({
    checks: z
        .object({
            test: z.string().min(1).optional(),
            types: z.string().min(1).optional(),
            lint: z.string().min(1).optional(),
        })
        .default({}),
    test_file_patterns: z.array(z.string()).default(['**/*.test.ts']),
    test_setup_files: z.array(z.string()).default([]),
    rule_files: z.array(z.string()).default([]),
    memory_vault: z.string().min(1).optional(),
})

export type EngineConfig = z.infer<typeof EngineConfigSchema>

export type LoadEngineConfigResult =
    | { ok: true; config: EngineConfig }
    | { ok: false; error: string }

const parseJson = ({
    text,
}: {
    text: string
}): { ok: true; value: unknown } | { ok: false; error: string } => {
    try {
        return { ok: true, value: JSON.parse(text) }
    } catch (error) {
        return { ok: false, error: String(error) }
    }
}

/**
 * Reads and checks the engine config at `<repo_root>/luca.config.json`.
 *
 * Never throws: a missing file, bad JSON, or a config of the wrong shape comes
 * back as `{ ok: false, error }` with a message a person can act on.
 *
 * @example
 * const result = await loadEngineConfig({ repo_root: process.cwd() })
 * if (result.ok) console.log(result.config.checks.test)
 */
export const loadEngineConfig = async ({
    repo_root,
}: {
    repo_root: string
}): Promise<LoadEngineConfigResult> => {
    const path = join(repo_root, ENGINE_CONFIG_FILE)
    const file = Bun.file(path)
    if (!(await file.exists())) {
        return { ok: false, error: `No engine config found at ${path}` }
    }
    const json = parseJson({ text: await file.text() })
    if (!json.ok) {
        return {
            ok: false,
            error: `${path} is not valid JSON: ${json.error}`,
        }
    }
    const parsed = EngineConfigSchema.safeParse(json.value)
    if (!parsed.success) {
        return {
            ok: false,
            error: `${path} is not a valid engine config:\n${z.prettifyError(parsed.error)}`,
        }
    }
    return { ok: true, config: parsed.data }
}
