---
title: "Phase A — Project preferences foundation: tool, init skill, schema, seeding"
area: architecture
created: 2026-05-07
priority: high
source: design-discussion
---

## Task

Phase A — Project preferences foundation: tool, init skill, schema, seeding

## Goal

Introduce a unified `project_preferences` MuninnDB memory schema and the tooling to seed/consult it. This is the foundation that Phase B (branching) and Phase C (PR/release/commits) build on.

## Background

Audit revealed five categories of conventions hardcoded across the workflow that should be per-project preferences:

1. Branch strategy (in `ensure-feature-branch.ts`, `architect.md`)
2. PR / release conventions (in `rules/pr-title-format.md` — leaks luca-framework's own format to consumers)
3. Commit message conventions (partially recall-based, no structured policy)
4. Changeset conventions (partially recall-based, no structured policy)
5. Vault metadata + duplicated boilerplate across instructions

Replace prescriptive code/instructions with consult-based pattern: tool/instruction asks MuninnDB for the project's preference, applies it, never assumes.

## Deliverables

### 1. Schema definition

New file `packages/luca-mastracode/src/types/project-preferences.ts` — Zod schema for the canonical preferences memory:

```ts
{
  version: 1,
  project: string,
  branching: { defaultBranch, guardedBranches[], branchTypes[], fallback, confirmBaseBeforeCreate, staleHandling, issueRequired },
  commits: { convention, types[], scopes[], subjectMaxLength, trailers },
  pr: { titleTemplate, titleExamples[], forbidden[], bodyTemplate, draftByDefault, scopeFromPackagePath },
  release: { tool, changesetDir, bumpMapping, frontmatterFormat, versioning },
  tracker: { kind, ticketPattern, issueRequired, linkFormat }
}
```

(Full reference in seeded memory id `01KR1BMR4M1M6MR496C80KC6WS`.)

### 2. New tool: `projectPreferences`

`packages/luca-mastracode/src/tools/project-preferences.ts` with actions:

| Action | Behavior |
|---|---|
| `consult` | Retrieve canonical memory via **deterministic entity+tag lookup** (`muninn_find_by_entity(<project>)` filtered by tags `preferences`, `project-config`). Returns parsed schema or sentinel `{status: "missing"}`. Cached per session. |
| `consult-section` | Same but returns one slice (`branching`, `pr`, `release`, `commits`, `tracker`). |
| `seed` | Store new preferences memory. Validates schema. Always provides a natural-language `summary` field (critical — see pitfall below). Used by init skill. |
| `update` | Patch one section without rewriting (uses `muninn_evolve`). |

**Why entity+tag, not semantic recall?** Two reasons (see pitfall `01KR1C67S85FGSJRE8YJH1Q45N`):
1. **Lag-free**: After `muninn_remember`, embeddings are computed asynchronously (~5-30s window). Entity+tag lookup uses indexes that are populated synchronously, so consult immediately after seed works correctly.
2. **Deterministic**: For a canonical singleton record, "find the one record tagged X for project Y" is unambiguous; semantic recall is probabilistic and could miss/return wrong records as the vault grows.

Vault resolution: read `.planning/config.json` → `muninn.vault`, fallback `"default"`. Centralized in this tool to remove duplicated boilerplate from instructions.

### 3. Init skill

`packages/luca-mastracode/skills/luca-init/SKILL.md` — interactive wizard that:

1. Detects existing preferences (calls `projectPreferences.consult`).
   - Found: show summary, ask keep/edit/replace.
   - Not found: proceed to wizard.
2. Probes repo for hints (read-only):
   - `.changeset/config.json` exists → `release.tool = "changesets"`
   - `git symbolic-ref refs/remotes/origin/HEAD` → `defaultBranch`
   - Last 20 branch names → infer template (regex frequency analysis)
   - `git log --format=%s -50` → infer commit convention
   - `gh pr list --state all --limit 20 --json title` → infer PR title template
   - `package.json` workspace structure → suggest scopes
3. Presents probed defaults per section, asks user to confirm/edit:
   - Branching (dedicated subprompt for ENG/PT-style multi-rule setups — array of match rules with regex/template/base/prBase)
   - Commits, PR, Release, Tracker
4. Calls `projectPreferences.seed` to store. **Must include a natural-language `summary` field** so post-enrichment semantic recall also works (e.g., for human/LLM exploration via `muninn_recall`).
5. Optionally writes `.planning/PREFERENCES.md` redacted summary for human review (NOT source of truth — memory is).

### 4. Auto-init from harness

When any harness agent calls `projectPreferences.consult` and gets the `{status: "missing"}` sentinel, the caller should:
- Invoke the `luca-init` skill inline.
- After skill completes, retry consult.

This makes preferences self-bootstrapping — first run on a new repo always works. The sentinel pattern (vs. throwing an error or returning bare null) gives callers a clear signal about what to do next.

### 5. CLI documentation only (no new command)

Update `packages/luca-framework/README.md` and the `luca init` command output to mention: "To seed project preferences, run the harness and it will prompt on first use, OR invoke the `luca-init` skill directly via your AI agent."

No new CLI subcommand. Skill is canonical entry point.

### 6. Seed luca-framework's own preferences

Already done — memory `01KR1BMR4M1M6MR496C80KC6WS`. Tests should verify the new `consult` tool retrieves it correctly via entity+tag lookup.

## Acceptance Criteria

1. `projectPreferences.consult` returns the seeded luca-framework memory via entity+tag lookup (deterministic, lag-free).
2. `projectPreferences.consult` returns `{status: "missing"}` sentinel when no memory exists in the vault.
3. Init skill is invokable from any agent in the harness; produces a valid memory passing schema validation.
4. Init skill always provides a natural-language `summary` field when calling `seed`.
5. Init skill's probing heuristics correctly identify luca-framework's existing conventions (changesets, conventional-commits, type/issue-slug branches).
6. Schema is exported from `luca-mastracode` so future tools (Phase B/C) can import the type.
7. README documents the auto-init flow.
8. Test: seed → immediate consult (no wait) → returns the memory (verifies the lag-free property).

## Out of Scope (deferred to B/C)

- Refactoring `ensureFeatureBranch` to use preferences (Phase B)
- Refactoring PR rules / gh-prepare / finalize to use preferences (Phase C)
- `.luca/preferences.json` repo-local override file
- Migration of existing prose convention memories into structured form

## Reference Memories

- `01KR1BMR4M1M6MR496C80KC6WS` — seeded luca-framework preferences (target schema example)
- `01KR1C67S85FGSJRE8YJH1Q45N` — pitfall: enrichment lag + summary-is-embedding-source (informs the entity+tag retrieval choice and the `summary`-required pattern)
