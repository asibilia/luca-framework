/**
 * luca-init skill — Repo-probing wizard that seeds project preferences into .luca/config.json. Detects branching conventions, commit format, PR title format, release tooling, and issue tracker from the local repo, confirms with the user, then writes the preferences section via the `luca preferences write` CLI.
 *
 * Ported from ~/.claude/skills/luca-init/SKILL.md (current user copy) (E-5).
 * Body path-retargeting: .planning/ → .luca/; uppercase artifacts
 * (PLAN.md, RESEARCH.md, CONTEXT.md, POSTMORTEM.md) → LUCA_DIR_CONTRACT
 * canonicals (plan.md, research.md, context.md, learn.md).
 */
import { defineSkill } from '../../../define/skill.ts'

const BODY = `# luca-init Skill

Seed repo-level project conventions so the Luca pipeline branches, commits, and ships PRs the way this team already does.

This skill manages the \`preferences\` section of \`.luca/config.json\`. It does not wire hooks or write the project skeleton — that is the \`luca init\` CLI's job, run earlier.

## When to run

- The user explicitly invokes \`/luca-init\` or asks to set up / reset preferences.
- After \`luca init\` (CLI) succeeds and the user wants to capture conventions next.

## Phase 1 — Probe

Read existing repo signal **before** asking any questions. Explore first; ask only for what cannot be inferred.

Run each heuristic, failing soft if a signal is unavailable:

1. **Branching**
   - \`git branch -r --no-color | head -50\` → detect prefix patterns (\`feat/\`, \`feature/\`, \`fix/\`, \`ENG-*\`, \`PT-*\`, etc.).
   - \`git symbolic-ref refs/remotes/origin/HEAD --short 2>/dev/null\` → default branch (fallback \`main\`).
2. **Commits**
   - \`git log --oneline -50\` → conventional-commit prefixes (\`feat:\`, \`fix:\`, \`chore:\`, etc.).
   - Recurring scopes (e.g. \`feat(api):\`) → suggested \`commits.scopes\`.
3. **PR title format**
   - \`gh pr list --state merged --limit 20 --json title -q '.[].title' 2>/dev/null\` (skip on auth failure).
   - Pattern-match against \`{type}({scope}): {description}\`.
4. **Release tooling**
   - \`.changeset/config.json\` exists → \`release.tool = "changesets"\`.
   - \`.releaserc*\` / \`release.config.*\` → \`"semantic-release"\`.
   - Otherwise \`"none"\`.
5. **Tracker**
   - Issue refs in commits (\`#123\`, \`ENG-456\`, \`PROJ-789\`) → infer \`github\` / \`linear\` / \`jira\`.
   - \`gh repo view --json owner,name 2>/dev/null\` → confirms GitHub.

Build a candidate preferences object from the probe results. Leave any field you cannot infer unset — \`ProjectPreferencesSchema\` fills it with a safe default.

The candidate must respect the schema's free-form character allowlist: branch/commit/PR template strings permit letters, digits, spaces/tabs, and \`{}/#,.():-\` only. No quotes, backticks, or newlines. Regex fields (\`branchTypes[].match\`) must not contain nested quantifiers. \`luca preferences write\` rejects violations — surface any rejection to the user rather than working around it.

## Phase 2 — Confirm

Run \`luca state read\` and read \`oversight\`.

### Headless path

If \`oversight === "full-auto"\`, skip the question. Proceed directly to Phase 3 with the probed candidate. Log one line summarising the auto-seeded values.

### Interactive path

Otherwise, show the detected values and ask once with \`AskUserQuestion\`:

- **Approve** — seed these preferences as-is → Phase 3.
- **Edit a section** — ask which section (branching, commits, pr, release, tracker), collect new values, re-confirm. Up to 2 iterations; if still unresolved, treat as Abort.
- **Abort** — write nothing, stop. The pipeline proceeds with \`ProjectPreferencesSchema\` defaults (a \`luca preferences read\` with no stored preferences returns the defaults).

## Phase 3 — Seed

Write the approved candidate. Stage the partial preferences object in a JSON file, then run \`luca preferences write --file\`:

\`\`\`
# /tmp/luca-preferences.json holds the approved candidate preferences object
luca preferences write --file /tmp/luca-preferences.json
\`\`\`

This validates the merged result against \`ProjectPreferencesSchema\` and atomically rewrites \`.luca/config.json\`, preserving every other config key (\`lucaVersion\`, \`vault\`, \`oversight\`, …). \`.luca/config.json#preferences\` is the single source of truth — \`luca preferences read\` reads it deterministically, so no separate MuninnDB registration is needed.

If \`luca preferences write\` exits non-zero, surface the validation message verbatim. The most common cause is an unsafe free-form value picked up from git history in a cloned repo — re-probe or ask the user for a clean value.

## Phase 4 — Confirm to user

Print a one-line confirmation:

\`\`\`
Project preferences seeded — branching=<types>, commits=<convention>, release=<tool>, tracker=<kind>.
Edit later with /luca-init.
\`\`\`

## Failure modes

| Signal | Action |
|---|---|
| \`git\` unavailable | Use schema defaults for branching/commits; warn the user. |
| \`gh\` not authenticated | Skip the PR-title probe; the schema default \`{type}({scope}): {description}\` applies. |
| \`luca preferences write\` rejects the payload | Surface the validation error verbatim; re-probe or ask for a corrected value. Nothing is written on rejection. |
`

export const lucaInitSkill = defineSkill({
    name: "luca-init",
    description: `Repo-probing wizard that seeds project preferences into .luca/config.json. Detects branching conventions, commit format, PR title format, release tooling, and issue tracker from the local repo, confirms with the user, then writes the preferences section via the \`luca preferences write\` CLI.

Use when the user says "init luca", "set up preferences", "luca-init", "configure conventions", or invokes /luca-init.`,
    body: BODY,
})
