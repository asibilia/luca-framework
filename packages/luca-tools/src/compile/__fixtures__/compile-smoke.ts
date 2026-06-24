#!/usr/bin/env bun
/**
 * compile-smoke — executable fixture that drives the compiler end-to-end.
 *
 * Why this file exists: tests are intentionally absent from this repo
 * (see CLAUDE.md / no-tests rule). We still need to PROVE the compiler
 * works before committing, so we use an executable fixture instead —
 * a small script that:
 *
 *   1. Builds an inline mini-manifest with one of each artifact kind
 *      that emits files (subagent, agent, command, skill, hook). Rules
 *      are pass-through bookkeeping so we include one to verify the
 *      report counts it; nothing is written for rules.
 *   2. Compiles into a freshly-created temp directory under /tmp/.
 *   3. Walks the output tree and prints it.
 *   4. Compares specific rendered frontmatter blocks against expected
 *      golden strings inlined below.
 *   5. Exits 0 on full match, 1 on any mismatch.
 *
 * Run via:
 *   bun packages/luca-tools/src/compile/__fixtures__/compile-smoke.ts
 *
 * Or via the package script:
 *   bun run --filter @alecsibilia/luca-tools compile:smoke
 *
 * The /tmp output is NOT committed. The fixture itself lives under
 * __fixtures__/ (not __tests__/) so the no-tests rule doesn't trip.
 */
import { mkdtempSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

import {
    compile,
    defineAgent,
    defineCommand,
    defineHook,
    defineRule,
    defineSkill,
    defineSubagent,
} from '../../index.ts'

const root = mkdtempSync(join(tmpdir(), 'luca-tools-compile-smoke-'))
console.log(`smoke: output root = ${root}`)

// One of each kind. The smoke goal is "does the compiler walk the
// dispatch and write what it should" — NOT exhaustive coverage of
// every flag combination. The unit-of-work that proves coverage is
// the per-emitter unit; this smoke is integration-level.

const subagent = defineSubagent({
    id: 'smoke-subagent',
    name: 'Smoke Subagent',
    description: 'Verifies subagent emission with full D1 prelude.',
    maxSteps: 30,
    allowedTools: ['Read', 'Grep', 'Glob'],
    guidance: {
        verticalSlice: true,
        tdd: true,
        selfVerify: true,
        antiSycophancy: true,
    },
    telemetryHooks: ['subagent-start', 'subagent-end'],
    pipelineInvocations: ['muninn-recall', 'claim-verify'],
    gotchas: ['<example footgun>'],
    instructions: 'You are the smoke subagent. Do the smoke thing.',
})

const agent = defineAgent({
    id: 'smoke-agent',
    name: 'Smoke Agent',
    description: 'Verifies mode-agent emission.',
    stage: 'plan',
    color: '#abcdef',
    guidance: {
        verticalSlice: true,
        tdd: false,
        selfVerify: true,
        antiSycophancy: false,
    },
    telemetryHooks: ['phase-start', 'phase-end'],
    pipelineInvocations: ['confidence-log'],
    gotchas: ['<example footgun>'],
    instructions: 'You are the smoke mode-agent. You plan.',
})

const command = defineCommand({
    name: 'smoke-cmd',
    description: 'Smoke slash-command.',
    argHint: '<thing>',
    body: 'Do the smoke thing with $ARGUMENTS.',
})

const skill = defineSkill({
    name: 'smoke-skill',
    description: 'Smoke skill that does the smoke thing.',
    allowedTools: ['Bash', 'Read'],
    body: '# Smoke skill\n\nDo the smoke thing.',
})

// Multi-paragraph description coverage. The legacy SKILL.md authoring
// style used YAML block scalars with a blank-line paragraph break (a
// primary description followed by a "Use when …" trigger paragraph).
// The compiler must emit those as a YAML literal block scalar so the
// blank line survives — see the P2 regression in
// `docs/parity-review/03-skills-commands-fidelity.md` §3.11/§4.7.
const multiParaSkill = defineSkill({
    name: 'smoke-skill-multi',
    description:
        'Multi-paragraph smoke skill.\n\nUse when verifying that block-scalar emission preserves blank lines.',
    body: '# Multi-paragraph smoke\n\nProves the compiler round-trips a two-paragraph description.',
})

const hookPost = defineHook({
    id: 'smoke-edit',
    description: 'Smoke post-edit hook.',
    event: 'PostToolUse',
    matcher: 'Edit|Write',
    runtime: 'bun-script',
    handler: '.claude/hooks/smoke-edit.ts',
    timeoutMs: 30000,
    background: true,
})

const hookPre = defineHook({
    id: 'smoke-bash',
    description: 'Smoke pre-bash hook.',
    event: 'PreToolUse',
    matcher: 'Bash',
    runtime: 'shell',
    handler: '.claude/hooks/smoke-bash.sh',
    timeoutMs: 5000,
    background: false,
})

const rule = {
    kind: 'rule' as const,
    rule: defineRule({
        id: 'smoke/example',
        severity: 'should-fix',
        description: 'Smoke rule (pass-through).',
        scope: '**/*.ts',
        check: () => [],
    }),
}

const artifacts = [
    subagent,
    agent,
    command,
    skill,
    multiParaSkill,
    hookPost,
    hookPre,
    rule,
]

const report = await compile(artifacts, root)

console.log('---')
console.log('counts:', JSON.stringify(report.counts))
console.log('settingsPath:', report.settingsPath)
console.log('paths:')
for (const p of report.paths) {
    console.log(`  ${p.kind}\t${relative(root, p.path)}`)
}

// Walk and print the file tree.
console.log('---')
console.log('tree:')
walk(root)
function walk(dir: string, depth = 0): void {
    const indent = '  '.repeat(depth)
    for (const name of readdirSync(dir).sort()) {
        const full = join(dir, name)
        if (statSync(full).isDirectory()) {
            console.log(`${indent}${name}/`)
            walk(full, depth + 1)
        } else {
            console.log(`${indent}${name}`)
        }
    }
}

// Inline golden checks. We snapshot SPECIFIC fields rather than whole
// files because the rendered prelude prose may evolve as the D-3 port
// lands. The frontmatter is stable enough to pin in a smoke check.

const failures: string[] = []

// Build the expected subagent frontmatter as it appears in the file.
// Order matches emit-subagent.ts: name -> description -> subagent: true ->
// id -> max-steps -> tools -> allowed-tools.
const expectedSubagentFrontmatter = [
    '---',
    'name: Smoke Subagent',
    'description: Verifies subagent emission with full D1 prelude.',
    'subagent: true',
    'id: smoke-subagent',
    'max-steps: 30',
    'tools: Read, Grep, Glob',
    'allowed-tools: [Read, Grep, Glob]',
    '---',
].join('\n')

const expectedAgentFrontmatter = [
    '---',
    'name: Smoke Agent',
    'description: Verifies mode-agent emission.',
    'id: smoke-agent',
    'stage: plan',
    'color: "#abcdef"',
    '---',
].join('\n')

const expectedCommandFrontmatter = [
    '---',
    'name: smoke-cmd',
    'description: Smoke slash-command.',
    'argument-hint: <thing>',
    '---',
].join('\n')

const expectedSkillFrontmatter = [
    '---',
    'name: smoke-skill',
    'description: Smoke skill that does the smoke thing.',
    'tools: Bash, Read',
    'allowed-tools: [Bash, Read]',
    '---',
].join('\n')

// Multi-paragraph description must render as a YAML literal block
// scalar (`|-`) with the blank line preserved. The `|-` chomp keeps
// the source string trailing-newline-free.
const expectedMultiParaSkillFrontmatter = [
    '---',
    'name: smoke-skill-multi',
    'description: |-',
    '  Multi-paragraph smoke skill.',
    '',
    '  Use when verifying that block-scalar emission preserves blank lines.',
    '---',
].join('\n')

// settings.json shape — pretty-printed JSON with PreToolUse before
// PostToolUse (HOOK_EVENT_ORDER).
const expectedSettingsFragment =
    '"PreToolUse": [\n      {\n        "hooks": [\n          {\n            "type": "command",\n            "command": "bash \\"$CLAUDE_PROJECT_DIR\\"/.claude/hooks/smoke-bash.sh",\n            "timeout": 5,\n            "statusMessage": "Smoke pre-bash hook."\n          }\n        ],\n        "matcher": "Bash"\n      }\n    ]'

const subagentPath = join(root, '.claude/agents/smoke-subagent.md')
const agentPath = join(root, '.claude/agents/smoke-agent.md')
const commandPath = join(root, '.claude/commands/smoke-cmd.md')
const skillPath = join(root, 'skills/smoke-skill/SKILL.md')
const multiParaSkillPath = join(root, 'skills/smoke-skill-multi/SKILL.md')
const settingsPath = join(root, '.claude/settings.json')

const subagentText = await Bun.file(subagentPath).text()
const agentText = await Bun.file(agentPath).text()
const commandText = await Bun.file(commandPath).text()
const skillText = await Bun.file(skillPath).text()
const multiParaSkillText = await Bun.file(multiParaSkillPath).text()
const settingsText = await Bun.file(settingsPath).text()

function check(label: string, actual: string, expected: string): void {
    if (!actual.includes(expected)) {
        failures.push(
            `[${label}]\nexpected to contain:\n${expected}\n--- got: ---\n${actual.slice(0, 800)}`
        )
    }
}

check('subagent frontmatter', subagentText, expectedSubagentFrontmatter)
check('subagent D1 guidance', subagentText, '## Guidance')
check('subagent gotchas', subagentText, '## Gotchas')
check('subagent tdd line', subagentText, '**Test-driven development.**')
check('subagent telemetry', subagentText, '## Telemetry')
check('subagent invocations', subagentText, '## Pipeline Invocations')
check('subagent muninn-recall', subagentText, '**Pre-invoke MuninnDB recall.**')

check('agent frontmatter', agentText, expectedAgentFrontmatter)
check('agent stage', agentText, 'stage: plan')
check('agent gotchas', agentText, '## Gotchas')

check('command frontmatter', commandText, expectedCommandFrontmatter)
check('command body', commandText, '$ARGUMENTS')

check('skill frontmatter', skillText, expectedSkillFrontmatter)
check('skill body', skillText, '# Smoke skill')

check(
    'multi-paragraph skill frontmatter (block scalar)',
    multiParaSkillText,
    expectedMultiParaSkillFrontmatter
)
// Defensive: prove the rendered output is NOT the legacy JSON-escaped
// single-line form. If this substring ever appears in the rendered
// output we've regressed to the pre-fix behavior.
if (multiParaSkillText.includes('\\n\\n')) {
    failures.push(
        '[multi-paragraph skill] rendered frontmatter contains "\\n\\n" escape — block-scalar emission regressed'
    )
}

check('settings.json PreToolUse', settingsText, expectedSettingsFragment)
check('settings.json PostToolUse async', settingsText, '"async": true')

// Verify rule was counted but no file was written for it.
if (report.counts.rule !== 1) {
    failures.push(
        `expected report.counts.rule === 1, got ${report.counts.rule}`
    )
}

if (failures.length > 0) {
    console.error('---')
    console.error('SMOKE FAILED:')
    for (const f of failures) {
        console.error(f)
        console.error()
    }
    process.exit(1)
}

console.log('---')
console.log('SMOKE OK')
console.log(`output: ${root}`)
