/**
 * Checking this computer against the committed manifest, read-only
 * (`verify`), for `generate-v13-manifest.ts --verify`.
 */
import { readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import filter from 'lodash/filter'
import find from 'lodash/find'
import flatMap from 'lodash/flatMap'
import get from 'lodash/get'
import groupBy from 'lodash/groupBy'
import includes from 'lodash/includes'
import indexOf from 'lodash/indexOf'
import isEqual from 'lodash/isEqual'
import last from 'lodash/last'
import map from 'lodash/map'
import mapValues from 'lodash/mapValues'
import maxBy from 'lodash/maxBy'
import some from 'lodash/some'
import sortBy from 'lodash/sortBy'
import { z } from 'zod'

import { sha256Of, HookEntrySchema } from './v13-manifest-read'
import {
    CLAUDE_HOME,
    AGY_HOME,
    REPO,
    HOME_PLACEHOLDER,
    TOKEN_VALUE,
    type Json,
} from './v13-manifest-specs'

import {
    loadV13Manifest,
    type V13Manifest,
    type V13Setting,
} from '../src/doctor/v13-manifest'

type FileStatus = 'match' | 'moved' | 'differs' | 'other'

type FileFinding = { status: FileStatus; target: string; detail: string }

/** Where a manifest location is on this computer; null without a repo. */
const resolveLocation = ({
    location,
    home,
    claude_home,
    repo,
}: {
    location: string
    home: string
    claude_home: string
    repo: string | null
}): string | null => {
    if (location.startsWith(`${REPO}/`)) {
        return repo === null
            ? null
            : join(repo, location.slice(REPO.length + 1))
    }
    if (location.startsWith(`${CLAUDE_HOME}/`)) {
        return join(claude_home, location.slice(CLAUDE_HOME.length + 1))
    }
    return join(home, location.slice(2))
}

/** Regular files under `dir`, at most `depth` folders deep, as relative paths. */
const listFiles = async ({
    dir,
    depth,
}: {
    dir: string
    depth: number
}): Promise<string[]> => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
    const nested = await Promise.all(
        map(entries, async (entry) => {
            if (entry.isFile()) return [entry.name]
            if (!entry.isDirectory() || depth <= 1) return []
            const inner = await listFiles({
                dir: join(dir, entry.name),
                depth: depth - 1,
            })
            return map(inner, (name) => `${entry.name}/${name}`)
        })
    )
    return sortBy(flatMap(nested))
}

const classifyFile = async ({
    target,
    path,
    manifest,
}: {
    target: string
    path: string
    manifest: V13Manifest
}): Promise<FileFinding> => {
    const sha256 = await sha256Of({ path })
    const known = find(manifest.files, { target })
    if (known !== undefined && includes(known.sha256, sha256)) {
        return { status: 'match', target, detail: '' }
    }
    const elsewhere = find(manifest.files, (file) =>
        includes(file.sha256, sha256)
    )
    if (elsewhere !== undefined) {
        return {
            status: 'moved',
            target,
            detail: `content is v13's ${elsewhere.target}`,
        }
    }
    if (known !== undefined) {
        return {
            status: 'differs',
            target,
            detail: 'a v13 path, but the content is not from any published v13',
        }
    }
    return { status: 'other', target, detail: 'not a v13 path or content' }
}

/** The folders v13 copied into, scanned for files by manifest location. */
const scanRoots = ({ scope }: { scope: 'global' | 'repo' }) =>
    scope === 'global'
        ? [
              { location: `${CLAUDE_HOME}/skills`, depth: 2 },
              { location: `${CLAUDE_HOME}/agents`, depth: 1 },
              { location: `${CLAUDE_HOME}/commands`, depth: 1 },
              { location: `${AGY_HOME}/skills`, depth: 2 },
              { location: `${AGY_HOME}/agents`, depth: 1 },
          ]
        : [{ location: `${REPO}/.claude/hooks`, depth: 1 }]

const scanFiles = async ({
    scope,
    manifest,
    home,
    claude_home,
    repo,
}: {
    scope: 'global' | 'repo'
    manifest: V13Manifest
    home: string
    claude_home: string
    repo: string | null
}): Promise<FileFinding[]> => {
    const findings: FileFinding[] = []
    for (const { location, depth } of scanRoots({ scope })) {
        const dir = resolveLocation({ location, home, claude_home, repo })
        if (dir === null) continue
        for (const name of await listFiles({ dir, depth })) {
            findings.push(
                await classifyFile({
                    target: `${location}/${name}`,
                    path: join(dir, name),
                    manifest,
                })
            )
        }
    }
    if (scope === 'global') {
        const target = `${CLAUDE_HOME}/luca-statusline.ts`
        const path = resolveLocation({
            location: target,
            home,
            claude_home,
            repo,
        })
        if (path !== null && (await Bun.file(path).exists())) {
            findings.push(await classifyFile({ target, path, manifest }))
        }
    }
    return findings
}

/** Replace every string in a JSON value. */
const mapStrings = ({
    value,
    fn,
}: {
    value: Json
    fn: (text: string) => string
}): Json => {
    if (typeof value === 'string') return fn(value)
    if (Array.isArray(value)) {
        return map(value, (item) => mapStrings({ value: item, fn }))
    }
    if (value !== null && typeof value === 'object') {
        return mapValues(value, (item) => mapStrings({ value: item, fn }))
    }
    return value
}

/** A JSON object with v13's LangSmith keys; a record keeps the key order. */
const TraceMetadataSchema = z
    .record(z.string(), z.json())
    .refine((value) => 'repo' in value && 'luca_version' in value)

/**
 * Put the manifest's placeholders back into a value read from disk, so it
 * can be compared with v13's: a Bearer token, and the per-repo values in the
 * LangSmith metadata string.
 */
const maskText = ({ text }: { text: string }): string => {
    if (/^Bearer \S+$/.test(text)) return TOKEN_VALUE
    const metadata = TraceMetadataSchema.safeParse(
        z.json().safeParse(parseJsonText({ text })).data
    )
    return metadata.success
        ? JSON.stringify({
              ...metadata.data,
              repo: '{repo_name}',
              luca_version: '{luca_version}',
          })
        : text
}

const parseJsonText = ({ text }: { text: string }): unknown => {
    try {
        return JSON.parse(text)
    } catch {
        return undefined
    }
}

const readJsonFile = async ({
    path,
}: {
    path: string
}): Promise<Json | null> => {
    const file = Bun.file(path)
    if (!(await file.exists())) return null
    const parsed = z.json().safeParse(await file.json().catch(() => undefined))
    return parsed.success ? parsed.data : null
}

/** Whether v13's setting is in the file, and whether it's exactly v13's. */
const checkSetting = async ({
    setting,
    home,
    claude_home,
    repo,
}: {
    setting: V13Setting
    home: string
    claude_home: string
    repo: string | null
}): Promise<string | null> => {
    const path = resolveLocation({
        location: setting.file,
        home,
        claude_home,
        repo,
    })
    if (path === null) return null
    const json = await readJsonFile({ path })
    if (json === null) return 'file absent or unreadable'
    const node = z.json().optional().parse(get(json, setting.path))
    const expected = map(setting.values, (value) =>
        mapStrings({
            value,
            fn: (text) => text.replaceAll(HOME_PLACEHOLDER, home),
        })
    )
    const masked = (value: Json) =>
        mapStrings({ value, fn: (text) => maskText({ text }) })
    const exact = (value: Json) =>
        some(expected, (candidate) => isEqual(masked(value), candidate))

    const { match } = setting
    if (match.kind === 'array_entry_hook_command_contains') {
        const entries = z.array(z.json()).safeParse(node)
        const found = filter(entries.success ? entries.data : [], (entry) => {
            const parsed = HookEntrySchema.safeParse(entry)
            return (
                parsed.success &&
                some(parsed.data.hooks, ({ command }) =>
                    command.includes(match.text)
                )
            )
        })
        if (found.length === 0) return 'absent'
        return `present (${found.length} entr${found.length === 1 ? 'y' : 'ies'}, ${
            some(found, exact) ? 'exactly v13' : 'differs from v13'
        })`
    }
    if (match.kind === 'command_equals') {
        const parsed = z.looseObject({ command: z.string() }).safeParse(node)
        if (!parsed.success) return 'absent'
        const commands = map(match.any_of, (command) =>
            command.replaceAll(HOME_PLACEHOLDER, home)
        )
        if (!includes(commands, parsed.data.command.trim())) {
            return "present but not v13's command (the user's own)"
        }
        return `present (${node !== undefined && exact(node) ? 'exactly v13' : 'differs from v13'})`
    }
    if (node === undefined) return 'absent'
    return `present (${exact(node) ? 'exactly v13' : 'differs from v13'})`
}

const checkGitignore = async ({
    manifest,
    repo,
}: {
    manifest: V13Manifest
    repo: string
}): Promise<string> => {
    const file = Bun.file(join(repo, '.gitignore'))
    if (!(await file.exists())) return 'no .gitignore'
    const lines = (await file.text()).split('\n')
    const { start_marker, variants } = manifest.gitignore_block
    const start = lines.indexOf(start_marker)
    if (start >= 0) {
        const variant = find(variants, ({ header, entries }) =>
            isEqual(
                lines.slice(start, start + header.length + entries.length),
                [...header, ...entries]
            )
        )
        return variant === undefined
            ? 'start marker found, but the block differs from every variant'
            : `full block, the variant from ${variant.versions[0]} on (line ${start + 1})`
    }
    // No header: look for loose entries, and the longest run of them in
    // v13's order (what a partial, header-less append leaves).
    const entries = last(variants)?.entries ?? []
    const present = filter(entries, (entry) => includes(lines, entry))
    if (present.length === 0) return 'absent'
    const runs = map(lines, (line, at) => {
        const from = indexOf(entries, line)
        let length = 0
        while (
            from >= 0 &&
            at + length < lines.length &&
            lines[at + length] === entries[from + length]
        ) {
            length += 1
        }
        return { at, length }
    })
    const longest = maxBy(runs, 'length')
    return `no header; ${present.length} of ${entries.length} entries present as loose lines, longest run in v13's order: ${longest?.length ?? 0} lines at line ${(longest?.at ?? 0) + 1}`
}

const printFindings = ({
    title,
    findings,
}: {
    title: string
    findings: FileFinding[]
}): void => {
    const counts = mapValues(groupBy(findings, 'status'), 'length')
    console.log(
        `\n${title}: ${findings.length} files; match ${counts.match ?? 0}, moved ${counts.moved ?? 0}, differs ${counts.differs ?? 0}, other ${counts.other ?? 0}`
    )
    for (const finding of filter(findings, (f) => f.status !== 'match')) {
        console.log(
            `  ${finding.status.padEnd(7)} ${finding.target}  ${finding.detail}`
        )
    }
}

export const verify = async ({
    repos,
    claude_home,
}: {
    repos: string[]
    claude_home: string
}): Promise<void> => {
    const manifest = await loadV13Manifest()
    const home = homedir()
    console.log(
        `Read-only check against ${manifest.files.length} v13 files (${manifest.generated_from.length} versions). Claude home: ${claude_home}`
    )

    printFindings({
        title: 'Computer (~/.claude, ~/.gemini/antigravity-cli)',
        findings: await scanFiles({
            scope: 'global',
            manifest,
            home,
            claude_home,
            repo: null,
        }),
    })
    console.log('  settings:')
    for (const setting of filter(manifest.settings, (s) =>
        s.file.startsWith('~/')
    )) {
        const result = await checkSetting({
            setting,
            home,
            claude_home,
            repo: null,
        })
        console.log(`    ${setting.id} (${setting.action}): ${result}`)
    }

    for (const repo of repos) {
        printFindings({
            title: `Repo ${repo}`,
            findings: await scanFiles({
                scope: 'repo',
                manifest,
                home,
                claude_home,
                repo,
            }),
        })
        console.log('  settings:')
        for (const setting of filter(manifest.settings, (s) =>
            s.file.startsWith(`${REPO}/`)
        )) {
            const result = await checkSetting({
                setting,
                home,
                claude_home,
                repo,
            })
            console.log(`    ${setting.id} (${setting.action}): ${result}`)
        }
        console.log(`  .gitignore: ${await checkGitignore({ manifest, repo })}`)
    }
}
