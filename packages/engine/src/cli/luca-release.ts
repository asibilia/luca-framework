#!/usr/bin/env bun
/**
 * `luca-release`: makes a **release** of this working copy and switches
 * every run to it. Run it from the development working copy, on a clean
 * `main` that matches `origin/main`, with no run going:
 *
 *   bun packages/engine/src/cli/luca-release.ts
 *
 * It runs the gates, pushes a date tag (`luca-YYYY.MM.DD`, then `.2`, ...),
 * moves the pinned clone in `~/.local/share/luca/` to it (making the clone
 * on first use) and installs from the lockfile, installs the `luca-board`
 * plugin from the pinned clone with Paseo's CLI, and sets the plugin's
 * `engine_path` to the pinned `luca-run`. See `runRelease`.
 *
 * Exits 0 when the release is live, 1 when it refused or a step failed.
 */
import { homedir } from 'node:os'
import { join } from 'node:path'

import { DaemonClient } from '@getpaseo/client/internal/daemon-client'
import { z } from 'zod'

import {
    defaultPinnedDir,
    defaultRegistryPath,
    runRelease,
    type ReleasePaseo,
} from './release'

import { daemonAddress } from '../board/paseo-board-link'
import { defaultRunsDir } from '../journal/journal'
import { runCommand } from '../shell/run-command'

/** Where Paseo's CLI is when it isn't on the PATH. */
const PASEO_APP_BIN = '/Applications/Paseo.app/Contents/Resources/bin/paseo'

/** The board plugin's settings document that holds `engine_path`. */
const ENGINE_SETTINGS_ID = 'engine'

const SettingsReadSchema = z.discriminatedUnion('status', [
    z.object({
        status: z.literal('ready'),
        revision: z.string(),
        values: z.record(z.string(), z.unknown()),
    }),
    z.object({
        status: z.literal('invalid'),
        revision: z.string(),
        error: z.string(),
    }),
])

const SettingsWriteSchema = z.object({
    status: z.string(),
    error: z.string().optional(),
})

/**
 * The real Paseo side: `paseo plugin install` for the plugin, and the
 * plugin's settings RPCs through the local daemon for `engine_path` (the
 * other engine settings are kept).
 */
const createPaseoCli = (): ReleasePaseo => ({
    installPlugin: async ({ path, id }) => {
        const paseo = Bun.which('paseo') ?? PASEO_APP_BIN
        const result = await runCommand({
            cmd: [paseo, 'plugin', 'install', path, '--id', id],
            cwd: path,
        })
        if (result.exit_code !== 0) {
            throw new Error(
                `paseo plugin install ${path} --id ${id} failed: ${result.stderr.trim() || result.stdout.trim()}`
            )
        }
    },
    setEnginePath: async ({ plugin_id, engine_path }) => {
        const password = process.env.PASEO_PASSWORD
        const client = new DaemonClient({
            url: `ws://${await daemonAddress()}/ws`,
            clientId: 'luca-release',
            clientType: 'cli',
            reconnect: { enabled: false },
            connectTimeoutMs: 5000,
            ...(password === undefined || password === '' ? {} : { password }),
        })
        await client.connect()
        try {
            const read = SettingsReadSchema.parse(
                await client.invokePluginRpc(
                    plugin_id,
                    `settings.${ENGINE_SETTINGS_ID}.read`,
                    {}
                )
            )
            const values = read.status === 'ready' ? read.values : {}
            const written = SettingsWriteSchema.parse(
                await client.invokePluginRpc(
                    plugin_id,
                    `settings.${ENGINE_SETTINGS_ID}.write`,
                    {
                        revision: read.revision,
                        values: { ...values, engine_path },
                    }
                )
            )
            if (written.status !== 'saved') {
                throw new Error(
                    `Couldn't save ${plugin_id}'s engine_path (${written.status}): ${written.error ?? ''}`
                )
            }
        } finally {
            await client.close().catch(() => undefined)
        }
    },
})

const end = await runRelease({
    // This file is <repo>/packages/engine/src/cli/luca-release.ts.
    repo: join(import.meta.dir, '..', '..', '..', '..'),
    pinned_dir: defaultPinnedDir({ home_dir: homedir() }),
    runs_dir: defaultRunsDir(),
    registry_path: defaultRegistryPath({
        env: process.env,
        home_dir: homedir(),
    }),
    paseo: createPaseoCli(),
    now: Date.now,
    log: (line) => {
        console.log(line)
    },
})

process.exit(end.ok ? 0 : 1)
