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

await $`gh release create ${tag} --title ${tag} --notes ${notes}`
console.log(`Created release ${tag}`)
