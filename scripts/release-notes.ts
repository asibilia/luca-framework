#!/usr/bin/env bun
/**
 * Prints the GitHub release notes for the publish package's version: that
 * version's section of `packages/luca/CHANGELOG.md`, which `changeset
 * version` wrote, or a one-line fallback when there is none.
 *
 * Usage: bun scripts/release-notes.ts > notes.md
 */
import { join } from 'node:path'

import { z } from 'zod'

const LUCA_DIR = join(import.meta.dir, '..', 'packages', 'luca')

const ManifestSchema = z.looseObject({ name: z.string(), version: z.string() })

const manifest = ManifestSchema.parse(
    await Bun.file(join(LUCA_DIR, 'package.json')).json()
)
const changelog_file = Bun.file(join(LUCA_DIR, 'CHANGELOG.md'))
const changelog = (await changelog_file.exists())
    ? await changelog_file.text()
    : ''
const section = changelog
    .split(/^## /m)
    .find((part) => part.startsWith(`${manifest.version}\n`))

console.log(
    section === undefined
        ? `${manifest.name}@${manifest.version}`
        : `## ${section.trim()}`
)
