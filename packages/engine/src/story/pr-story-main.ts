#!/usr/bin/env bun
/**
 * The entry point of the `/luca-pr-prep` helper (#738): `runStoryCli` with
 * the real `gh` command, home folder, and environment. This file is what
 * `packages/engine/scripts/build-pr-story.ts` bundles into the skill's
 * `scripts/pr-story.js`. See `story-cli.ts` for the commands.
 */
import { homedir } from 'node:os'

import { runStoryCli } from './story-cli'
import type { Gh } from './story-github'

/** Runs the real `gh`. A missing `gh` is a failed call, not a crash. */
const gh: Gh = async ({ args, input }) => {
    try {
        const child = Bun.spawn(['gh', ...args], {
            stdin: input === undefined ? 'ignore' : new Blob([input]),
            stdout: 'pipe',
            stderr: 'pipe',
        })
        const [stdout, stderr, code] = await Promise.all([
            new Response(child.stdout).text(),
            new Response(child.stderr).text(),
            child.exited,
        ])
        return { ok: code === 0, stdout, stderr }
    } catch (error) {
        return {
            ok: false,
            stdout: '',
            stderr: `gh could not run: ${String(error)}`,
        }
    }
}

process.exit(
    await runStoryCli({
        argv: process.argv.slice(2),
        gh,
        home: homedir(),
        env: process.env,
        out: (line) => console.log(line),
        err: (line) => console.error(line),
    })
)
