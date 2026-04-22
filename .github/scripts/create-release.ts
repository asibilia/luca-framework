#!/usr/bin/env bun
import { $ } from 'bun'

const pkg = await Bun.file('packages/luca-framework/package.json').json()
const tag = `v${pkg.version}`

const exists = await $`gh release view ${tag}`.quiet().nothrow()
if (exists.exitCode === 0) {
  console.log(`Release ${tag} already exists, skipping`)
  process.exit(0)
}

const changelog = await Bun.file('packages/luca-framework/CHANGELOG.md')
  .text()
  .catch(() => '')
const sections = changelog.split(/^## /m)
const latest = sections[1]?.trim() ?? ''
const notes = latest ? `## ${latest}` : `Release ${tag}`

const run_id = process.env.GITHUB_RUN_ID ?? process.pid
const notes_file = `${import.meta.dir}/../../.release-notes-${tag}-${run_id}.md`
await Bun.write(notes_file, notes)
try {
  await $`gh release create ${tag} --title ${tag} --notes-file ${notes_file}`
} finally {
  await Bun.file(notes_file).exists() && (await $`rm ${notes_file}`.quiet().nothrow())
}
console.log(`Created release ${tag}`)
