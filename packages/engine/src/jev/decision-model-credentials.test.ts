import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
    describeDecisionModelCredentials,
    loadDecisionModelCredentials,
    lucaEnvFile,
    parseEnvFile,
} from './decision-model-credentials'

/**
 * Luca's own env file, `~/.config/luca/.env`, in a temp home. No test reads
 * the real home folder or the real process env.
 */

const TOKEN = 'cf-token-not-real-456'
const ACCOUNT = 'acc-from-file'

let home = ''

beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'luca-credentials-'))
})

afterEach(async () => {
    await rm(home, { recursive: true, force: true })
})

const writeEnv = async ({ dir, text }: { dir: string; text: string }) => {
    await mkdir(join(dir, 'luca'), { recursive: true })
    await Bun.write(join(dir, 'luca', '.env'), text)
}

describe('lucaEnvFile', () => {
    test('is under XDG_CONFIG_HOME when it is set', () => {
        expect(
            lucaEnvFile({ env: { XDG_CONFIG_HOME: '/x/config' }, home })
        ).toBe('/x/config/luca/.env')
    })

    test('is under ~/.config when XDG_CONFIG_HOME is unset or empty', () => {
        const want = join(home, '.config', 'luca', '.env')
        expect(lucaEnvFile({ env: {}, home })).toBe(want)
        expect(lucaEnvFile({ env: { XDG_CONFIG_HOME: '' }, home })).toBe(want)
    })
})

describe('parseEnvFile', () => {
    test('reads KEY=VALUE lines, skipping comments and blank lines', () => {
        expect(
            parseEnvFile(
                [
                    '# Luca’s keys',
                    '',
                    'CLOUDFLARE_ACCOUNT_ID=abc',
                    '  export CLOUDFLARE_API_TOKEN = "quoted value" ',
                    "SINGLE='one two'",
                    'EMPTY=',
                    'not a line',
                    '=no key',
                ].join('\n')
            )
        ).toEqual({
            CLOUDFLARE_ACCOUNT_ID: 'abc',
            CLOUDFLARE_API_TOKEN: 'quoted value',
            SINGLE: 'one two',
            EMPTY: '',
        })
    })

    test('keeps an = inside a value and handles CRLF', () => {
        expect(parseEnvFile('A=b=c\r\nB=d\r\n')).toEqual({ A: 'b=c', B: 'd' })
    })
})

describe('loadDecisionModelCredentials', () => {
    test('reads both keys from ~/.config/luca/.env', async () => {
        await writeEnv({
            dir: join(home, '.config'),
            text: `CLOUDFLARE_ACCOUNT_ID=${ACCOUNT}\nCLOUDFLARE_API_TOKEN=${TOKEN}\n`,
        })

        expect(await loadDecisionModelCredentials({ env: {}, home })).toEqual({
            ok: true,
            account_id: ACCOUNT,
            api_token: TOKEN,
            file: join(home, '.config', 'luca', '.env'),
        })
    })

    test('honors XDG_CONFIG_HOME', async () => {
        const xdg = join(home, 'xdg')
        await writeEnv({
            dir: xdg,
            text: `CLOUDFLARE_ACCOUNT_ID=${ACCOUNT}\nCLOUDFLARE_API_TOKEN=${TOKEN}\n`,
        })

        const found = await loadDecisionModelCredentials({
            env: { XDG_CONFIG_HOME: xdg },
            home,
        })

        expect(found).toMatchObject({
            ok: true,
            file: join(xdg, 'luca', '.env'),
        })
    })

    test('the process env wins over the file, key by key', async () => {
        await writeEnv({
            dir: join(home, '.config'),
            text: `CLOUDFLARE_ACCOUNT_ID=${ACCOUNT}\nCLOUDFLARE_API_TOKEN=file-token\n`,
        })

        const found = await loadDecisionModelCredentials({
            env: { CLOUDFLARE_API_TOKEN: TOKEN },
            home,
        })

        expect(found).toMatchObject({
            ok: true,
            account_id: ACCOUNT,
            api_token: TOKEN,
        })
    })

    test('takes CLOUDFLARE_AUTH_TOKEN as the token, but CLOUDFLARE_API_TOKEN wins', async () => {
        await writeEnv({
            dir: join(home, '.config'),
            text: `CLOUDFLARE_ACCOUNT_ID=${ACCOUNT}\nCLOUDFLARE_AUTH_TOKEN=alias-token\n`,
        })

        expect(
            await loadDecisionModelCredentials({ env: {}, home })
        ).toMatchObject({ ok: true, api_token: 'alias-token' })

        await writeEnv({
            dir: join(home, '.config'),
            text: `CLOUDFLARE_ACCOUNT_ID=${ACCOUNT}\nCLOUDFLARE_AUTH_TOKEN=alias-token\nCLOUDFLARE_API_TOKEN=${TOKEN}\n`,
        })

        expect(
            await loadDecisionModelCredentials({ env: {}, home })
        ).toMatchObject({ ok: true, api_token: TOKEN })
    })

    test('with no file and no env, both keys are missing', async () => {
        expect(await loadDecisionModelCredentials({ env: {}, home })).toEqual({
            ok: false,
            missing: ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'],
            file: join(home, '.config', 'luca', '.env'),
        })
    })

    test('an empty value is missing', async () => {
        await writeEnv({
            dir: join(home, '.config'),
            text: `CLOUDFLARE_ACCOUNT_ID=\nCLOUDFLARE_API_TOKEN=${TOKEN}\n`,
        })

        expect(
            await loadDecisionModelCredentials({ env: {}, home })
        ).toMatchObject({ ok: false, missing: ['CLOUDFLARE_ACCOUNT_ID'] })
    })

    test('reads the file through the reader it is given', async () => {
        const paths: string[] = []

        const found = await loadDecisionModelCredentials({
            env: {},
            home: '/nowhere',
            read_file: async (path) => {
                paths.push(path)
                return `CLOUDFLARE_ACCOUNT_ID=${ACCOUNT}\nCLOUDFLARE_API_TOKEN=${TOKEN}`
            },
        })

        expect(paths).toEqual(['/nowhere/.config/luca/.env'])
        expect(found.ok).toBe(true)
    })
})

describe('describeDecisionModelCredentials', () => {
    test('says set or missing for each key, and never the token', async () => {
        await writeEnv({
            dir: join(home, '.config'),
            text: `CLOUDFLARE_ACCOUNT_ID=${ACCOUNT}\nCLOUDFLARE_API_TOKEN=${TOKEN}\n`,
        })
        const found = await loadDecisionModelCredentials({ env: {}, home })

        const text = describeDecisionModelCredentials(found)

        expect(text).toContain('CLOUDFLARE_ACCOUNT_ID set')
        expect(text).toContain('CLOUDFLARE_API_TOKEN set')
        expect(text).not.toContain(TOKEN)
        expect(JSON.stringify(text)).not.toContain(TOKEN)
    })

    test('names the file and the missing keys', async () => {
        const found = await loadDecisionModelCredentials({ env: {}, home })

        const text = describeDecisionModelCredentials(found)

        expect(text).toContain('CLOUDFLARE_ACCOUNT_ID missing')
        expect(text).toContain('CLOUDFLARE_API_TOKEN missing')
        expect(text).toContain(join(home, '.config', 'luca', '.env'))
    })
})
