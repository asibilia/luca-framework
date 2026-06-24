/**
 * rename-audit skill — Find stale references across the repo after renaming a file, pipeline step, export, symbol, ticket ID, or convention. Searches .md/.ts/.tsx/.mjs/.json/.jsonl, plus .claude/, .luca/, and .changeset/ artifacts. Read-only audit — never edits files. Use when the user says "rename audit", "audit renames", "find stale refs", "post-rename check", or invokes /rename-audit.
 *
 * Ported from ~/.claude/skills/rename-audit/SKILL.md (current user copy) (E-5).
 * Body path-retargeting: .planning/ → .luca/; uppercase artifacts
 * (PLAN.md, RESEARCH.md, CONTEXT.md, POSTMORTEM.md) → LUCA_DIR_CONTRACT
 * canonicals (plan.md, research.md, context.md, learn.md).
 */
import { defineSkill } from '../../../define/skill.ts'

const BODY = `# Skill: rename-audit

Read-only audit for stale references after a rename. Surfaces every file that still mentions the old name so the caller can decide whether to edit or leave it (e.g. historical changesets are typically left alone).

## Step 1 — Parse arguments

Required: \`oldName\` (the string being phased out), \`newName\` (its replacement).
Optional: \`scope\` (\`step\` | \`file\` | \`export\` | \`symbol\` | \`ticket\` | \`convention\`) to refine the search. Optional: \`extraExtensions\` (e.g. \`['.yaml']\`) to widen scope.

If args are missing, prompt the user once with \`AskUserQuestion\`. Reject if \`oldName === newName\`.

## Step 2 — Enumerate source files

Use \`git ls-files\` to enumerate tracked files (honors \`.gitignore\`).
Default extensions: \`.md\`, \`.ts\`, \`.tsx\`, \`.mjs\`, \`.json\`, \`.jsonl\`.
Default include dirs (in addition to tracked source): \`.claude/\`, \`.luca/\`, \`.changeset/\`.

## Step 3 — Grep for the old name

Run the \`Grep\` tool (or \`rg\`) for the \`oldName\` substring across the enumerated files. Use a case-sensitive match by default; offer case-insensitive on \`scope: 'convention'\`. Collect every \`file:line:snippet\` hit.

## Step 4 — Classify hits

Bucket each hit by file type:

- **code** — \`*.ts\` / \`*.tsx\` / \`*.mjs\` in \`src/\`, \`packages/\`
- **test** — \`*.test.ts\` / \`*.spec.ts\`
- **docs** — \`*.md\` outside \`.luca/\`
- **state** — \`.luca/\`, \`.changeset/\`
- **config** — \`*.json\`, \`*.jsonl\`, \`tsconfig.json\`, \`package.json\`, \`bunfig.toml\`

For each bucket, decide an advisory action:

- \`code\` / \`test\` → MUST-FIX (compile/test regression risk)
- \`docs\` / \`config\` → SHOULD-FIX (drift over time)
- \`state\` → ADVISORY (historical artifacts may legitimately keep the old name)

## Step 5 — Report

Emit a markdown table grouped by bucket. For each row: \`<file>:<line> <snippet (≤80 chars)>\`. End with a summary line:
\`Total: N matches across M files; K MUST-FIX, L SHOULD-FIX, P advisory.\`

If \`0 matches\`, report \`✅ No stale references found.\`

## Constraints

This is a **READ-ONLY audit**. Never call \`Write\`, \`Edit\`, \`NotebookEdit\`, or any other file-mutating tool. Use \`Bash\` only for read-only discovery (\`git ls-files\`, \`rg\`) — never for mutation. Never auto-fix. Surface the findings so the caller can decide; the caller may then invoke \`/gh-pr-address\` or hand-edit.
`

export const renameAuditSkill = defineSkill({
    name: 'rename-audit',
    description:
        'Find stale references across the repo after renaming a file, pipeline step, export, symbol, ticket ID, or convention. Searches .md/.ts/.tsx/.mjs/.json/.jsonl, plus .claude/, .luca/, and .changeset/ artifacts. Read-only audit — never edits files. Use when the user says "rename audit", "audit renames", "find stale refs", "post-rename check", or invokes /rename-audit.',
    body: BODY,
})
