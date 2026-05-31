#!/usr/bin/env bun
import { $ } from 'bun'

const pkg = await Bun.file('packages/luca/package.json').json()
const tag = `v${pkg.version}`
const title = `${pkg.name}@${pkg.version}`

// Emitted for changesets/action's stdout parser — it looks for lines
// matching /New tag:\s+(@scope\/name|name)@version/ to populate the
// `published` output that our publish job depends on.
const new_tag_line = `New tag: ${pkg.name}@${pkg.version}`

const exists = await $`gh release view ${tag}`.quiet().nothrow()
if (exists.exitCode === 0) {
  console.log(`Release ${tag} already exists, skipping creation`)
  // Still emit so the publish job runs. `bun publish` will fail gracefully
  // if the npm version already exists, which is the correct behavior for
  // a re-run after a partial failure.
  console.log(new_tag_line)
  process.exit(0)
}

const changelog = await Bun.file('packages/luca/CHANGELOG.md')
  .text()
  .catch(() => '')
const sections = changelog.split(/^## /m)
const latest = sections[1]?.trim() ?? ''
const notes = latest ? `## ${latest}` : `Release ${tag}`

const run_id = process.env.GITHUB_RUN_ID ?? process.pid
const notes_file = `${import.meta.dir}/../../.release-notes-${tag}-${run_id}.md`
await Bun.write(notes_file, notes)
try {
  await $`gh release create ${tag} --title ${title} --notes-file ${notes_file}`
} finally {
  await Bun.file(notes_file).exists() && (await $`rm ${notes_file}`.quiet().nothrow())
}
console.log(`Created release ${tag}`)
console.log(new_tag_line)
