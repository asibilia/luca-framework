import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { builtinModules } from 'node:module'
import { join } from 'node:path'

import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test'

/**
 * The bundle (#754): `bun run build` in `packages/walk` writes one
 * CommonJS file for VS Code's Node, which requires nothing but `vscode`
 * and Node's own modules, and calls no `Bun.` API.
 */

setDefaultTimeout(60_000)

const PACKAGE = join(import.meta.dir, '..')
const BUNDLE = join(PACKAGE, 'dist', 'extension.js')

type Done = { code: number; stdout: string; stderr: string }

const runBuild = (): Promise<Done> =>
    new Promise((resolve) => {
        execFile(
            process.execPath,
            ['run', 'build'],
            { cwd: PACKAGE, maxBuffer: 64 * 1024 * 1024 },
            (error, stdout, stderr) =>
                resolve({
                    code:
                        error === null
                            ? 0
                            : typeof error.code === 'number'
                              ? error.code
                              : 1,
                    stdout: String(stdout),
                    stderr: String(stderr),
                })
        )
    })

/** Whether `name` is `vscode` or one of Node's own modules. */
const allowed = (name: string): boolean =>
    name === 'vscode' ||
    name.startsWith('node:') ||
    builtinModules.includes(name)

let build: Done = { code: -1, stdout: '', stderr: '' }
let bundle = ''

beforeAll(async () => {
    build = await runBuild()
    bundle = existsSync(BUNDLE) ? await readFile(BUNDLE, 'utf8') : ''
})

describe('the Luca Walk bundle (#754)', () => {
    test('bun run build exits 0 and writes dist/extension.js', () => {
        expect(build.stderr).not.toContain('error:')
        expect(build.code).toBe(0)
        expect(existsSync(BUNDLE)).toBe(true)
    })

    test('every require in the bundle names vscode or a Node module', () => {
        const required = [
            ...bundle.matchAll(/\brequire\s*\(\s*(['"`])([^'"`]+)\1\s*\)/g),
        ].map((match) => match[2] ?? '')

        expect(required).toContain('vscode')
        expect(required.filter((name) => !allowed(name))).toEqual([])
    })

    test('the bundle holds no Bun. call', () => {
        expect(bundle.length).toBeGreaterThan(0)
        expect(bundle).not.toMatch(/\bBun\./)
    })
})
