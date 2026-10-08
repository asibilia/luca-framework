import { join } from 'node:path'

/**
 * The decision model's Cloudflare credentials (#534), from **Luca's own env
 * file**, `$XDG_CONFIG_HOME/luca/.env` (or `~/.config/luca/.env`). The engine
 * reads it itself, so it works the same for board-started and
 * terminal-started runs. It never reads a repo's `.env`. A key set in the
 * process env wins over the file, key by key, for tests and CI.
 *
 * ```
 * CLOUDFLARE_ACCOUNT_ID=your-account-id
 * CLOUDFLARE_API_TOKEN=your-workers-ai-token
 * ```
 *
 * `CLOUDFLARE_AUTH_TOKEN` (the name Cloudflare's Clef page uses) works as the
 * token too; `CLOUDFLARE_API_TOKEN` wins when both are set. Nothing here
 * ever puts the token in a summary or a log line.
 */

/** The Cloudflare account the decision model runs on. */
export const CLOUDFLARE_ACCOUNT_ID = 'CLOUDFLARE_ACCOUNT_ID'

/** The Workers AI token, the name wrangler and Cloudflare's tools use. */
export const CLOUDFLARE_API_TOKEN = 'CLOUDFLARE_API_TOKEN'

/** Another name for the token, from Cloudflare's Clef page. */
export const CLOUDFLARE_AUTH_TOKEN = 'CLOUDFLARE_AUTH_TOKEN'

/** The keys the decision model needs, in the order they are named. */
export const DECISION_MODEL_KEYS = [
    CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_API_TOKEN,
] as const

export type DecisionModelKey = (typeof DECISION_MODEL_KEYS)[number]

/** A process env, or a stand-in for one. */
export type Env = Record<string, string | undefined>

/**
 * The credentials, or the keys that are missing. `file` is Luca's env file,
 * read or not.
 */
export type DecisionModelCredentials =
    | { ok: true; account_id: string; api_token: string; file: string }
    | { ok: false; missing: DecisionModelKey[]; file: string }

/**
 * Luca's own env file: `$XDG_CONFIG_HOME/luca/.env` when `XDG_CONFIG_HOME`
 * is set and not empty, else `<home>/.config/luca/.env`. Pure.
 *
 * @example
 * lucaEnvFile({ env: {}, home: '/Users/me' }) // '/Users/me/.config/luca/.env'
 */
export const lucaEnvFile = ({
    env,
    home,
}: {
    env: Env
    home: string
}): string => {
    const xdg = env.XDG_CONFIG_HOME ?? ''
    return join(xdg === '' ? join(home, '.config') : xdg, 'luca', '.env')
}

/** A value without one pair of matching quotes around it. */
const unquote = (value: string): string => {
    const first = value.at(0)
    return value.length >= 2 &&
        (first === '"' || first === "'") &&
        value.at(-1) === first
        ? value.slice(1, -1)
        : value
}

/**
 * The keys and values of an env file: `KEY=VALUE` lines, with an optional
 * `export ` in front and the value trimmed and taken out of one pair of
 * single or double quotes. Blank lines, `#` comments, and lines with no `=`
 * or no key are skipped. No escapes and no `${...}`. Pure.
 *
 * @example
 * parseEnvFile('# keys\nexport A="one two"\nB=2') // { A: 'one two', B: '2' }
 */
export const parseEnvFile = (text: string): Record<string, string> => {
    const values: Record<string, string> = {}
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim()
        if (line === '' || line.startsWith('#')) continue
        const at = line.indexOf('=')
        if (at === -1) continue
        const key = line
            .slice(0, at)
            .trim()
            .replace(/^export\s+/, '')
            .trim()
        if (key === '') continue
        values[key] = unquote(line.slice(at + 1).trim())
    }
    return values
}

/** A file's text, or `null` when it is missing or can't be read. */
const readText = async (path: string): Promise<string | null> => {
    try {
        const file = Bun.file(path)
        return (await file.exists()) ? await file.text() : null
    } catch {
        return null
    }
}

/** The first of `values` that is set and not empty, or `null`. */
const firstSet = (values: (string | undefined)[]): string | null =>
    values.find((value) => value !== undefined && value !== '') ?? null

/**
 * The decision model's credentials: each key from the process env, else
 * from Luca's env file (`lucaEnvFile`). An empty value is missing. Never
 * throws: a missing or unreadable file reads as empty.
 *
 * @param env - The process env, such as `process.env`. Tests pass their own.
 * @param home - The home folder, such as `homedir()`. Tests pass a temp one.
 * @param read_file - Reads the file; `null` for none. Defaults to Bun's.
 *
 * @example
 * const credentials = await loadDecisionModelCredentials({ env: process.env, home: homedir() })
 * if (!credentials.ok) console.log(`Add ${credentials.missing.join(', ')} to ${credentials.file}`)
 */
export const loadDecisionModelCredentials = async ({
    env,
    home,
    read_file,
}: {
    env: Env
    home: string
    read_file?: (path: string) => Promise<string | null>
}): Promise<DecisionModelCredentials> => {
    const file = lucaEnvFile({ env, home })
    const text = await (read_file ?? readText)(file).catch(() => null)
    const values = text === null ? {} : parseEnvFile(text)
    const account_id = firstSet([
        env[CLOUDFLARE_ACCOUNT_ID],
        values[CLOUDFLARE_ACCOUNT_ID],
    ])
    const api_token = firstSet([
        env[CLOUDFLARE_API_TOKEN],
        env[CLOUDFLARE_AUTH_TOKEN],
        values[CLOUDFLARE_API_TOKEN],
        values[CLOUDFLARE_AUTH_TOKEN],
    ])
    if (account_id !== null && api_token !== null) {
        return { ok: true, account_id, api_token, file }
    }
    const missing = DECISION_MODEL_KEYS.filter((key) =>
        key === CLOUDFLARE_ACCOUNT_ID ? account_id === null : api_token === null
    )
    return { ok: false, missing, file }
}

/**
 * Which keys are set and which are missing, and the file: safe to print,
 * since it never holds a value. Pure.
 *
 * @example
 * describeDecisionModelCredentials(credentials)
 * // 'CLOUDFLARE_ACCOUNT_ID set, CLOUDFLARE_API_TOKEN missing (Luca's env file: /Users/me/.config/luca/.env)'
 */
export const describeDecisionModelCredentials = (
    credentials: DecisionModelCredentials
): string => {
    const missing: string[] = credentials.ok ? [] : credentials.missing
    const keys = DECISION_MODEL_KEYS.map(
        (key) => `${key} ${missing.includes(key) ? 'missing' : 'set'}`
    )
    return `${keys.join(', ')} (Luca's env file: ${credentials.file})`
}

/**
 * The lines to add to Luca's env file for the missing keys, with
 * placeholders. Pure.
 *
 * @example
 * missingKeyLines({ missing: ['CLOUDFLARE_API_TOKEN'] }) // ['CLOUDFLARE_API_TOKEN=your-workers-ai-token']
 */
export const missingKeyLines = ({
    missing,
}: {
    missing: DecisionModelKey[]
}): string[] =>
    missing.map((key) =>
        key === CLOUDFLARE_ACCOUNT_ID
            ? `${key}=your-account-id`
            : `${key}=your-workers-ai-token`
    )

/**
 * One plain sentence saying the decision model has no credentials: the
 * file and the keys to add. Never holds a value. Pure.
 *
 * @example
 * noCredentialsText({ missing: ['CLOUDFLARE_API_TOKEN'], file: '/Users/me/.config/luca/.env' })
 * // 'No Cloudflare credentials: add CLOUDFLARE_API_TOKEN to /Users/me/.config/luca/.env.'
 */
export const noCredentialsText = ({
    missing,
    file,
}: {
    missing: DecisionModelKey[]
    file: string
}): string =>
    `No Cloudflare credentials: add ${missing.join(' and ')} to ${file}.`
