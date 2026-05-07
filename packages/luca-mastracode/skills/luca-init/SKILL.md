---
name: luca-init
description: >
  Repo-probing wizard that seeds projectPreferences in MuninnDB. Detects
  branching conventions, commit format, PR title format, release tooling, and
  issue tracker from the local repo, confirms with the user, then writes
  `.planning/preferences.json` and registers the preferences memory in
  MuninnDB.

  Use when user says "init luca", "set up preferences", "luca-init",
  "configure conventions", or invokes `/luca-init`. Auto-invoked by triage
  Step 1.6 when `projectPreferences(action: "consult", fallback: false)`
  returns `preferences: null` AND `state.preferencesSeeded !== true`.
---

# luca-init Skill

Seed repo-level project conventions so the Luca pipeline branches, commits, and ships PRs the way this team already does.

## When to run

- Triage sentinel detects no preferences (auto-invocation).
- User explicitly invokes `/luca-init` or asks to reset preferences.
- After `luca init` (CLI) succeeds and the user wants to seed conventions next.

## Phase 1 — Probe

Read existing repo signal **before** asking any questions. Per grill-me principle: explore the codebase first, ask only for what cannot be inferred.

Heuristics (run each, fail soft if a signal is unavailable):

1. **Branching**
   - `git branch -r --no-color | head -50` → detect prefix patterns (`feat/`, `feature/`, `fix/`, `ENG-*`, `PT-*`, etc.).
   - `git symbolic-ref refs/remotes/origin/HEAD --short 2>/dev/null` → default branch (fallback `main`).
2. **Commits**
   - `git log --oneline -50` → check for conventional-commit prefixes (`feat:`, `fix:`, `chore:` etc.).
   - Recurring scopes (e.g. `feat(api):`) → suggested `commits.scopes`.
3. **PR title format**
   - `gh pr list --state merged --limit 20 --json title -q '.[].title' 2>/dev/null` (skip on auth failure).
   - Pattern-match against `{type}({scope}): {description}`.
4. **Release tooling**
   - `.changeset/config.json` exists → `release.tool = "changesets"`.
   - `.releaserc*` / `release.config.*` → `"semantic-release"`.
   - Otherwise `"none"`.
5. **Tracker**
   - Issue refs in commits (`#123`, `ENG-456`, `PT-789`) → infer `github` / `linear` / `jira`.
   - `gh repo view --json owner,name 2>/dev/null` → confirms GitHub.

Build a candidate `ProjectPreferences` object from the probe results, falling back to `DEFAULT_PREFERENCES` for any unknown field.

## Phase 2 — Confirm

Read `state.oversight` from `workflowState(action: "read")`.

### Headless / CI path

If `state.oversight === "full-auto"`, **skip `ask_user`**. Proceed directly to Phase 3 with the probed candidate. Log a single line summarising the auto-seeded values.

### Interactive path

Otherwise show the detected values and ask exactly once:

```
ask_user(
  question: "Detected preferences:\n<rendered candidate>\n\nApprove and seed?",
  options: [
    { label: "Approve", description: "Seed these preferences as-is." },
    { label: "Edit section", description: "Adjust one or more sections before seeding." },
    { label: "Abort", description: "Don't seed; clear preferencesSeeded if previously set." }
  ]
)
```

- **Approve** → continue to Phase 3.
- **Edit section** → ask which section, prompt for the new values, then re-confirm. Up to 2 iterations; if still unresolved, fall through to **Abort**.
- **Abort** → write nothing. Set `state.preferencesSeeded = false` via `workflowState(action: "write", updates: { preferencesSeeded: false })`. Stop the skill — the agent that invoked us will surface a banner explaining defaults are in use.

## Phase 3 — Seed

Two writes, in order:

### 3a. Local cache + state flag

```
projectPreferences(action: "seed", payload: <approved candidate object>)
```

This writes `.planning/preferences.json` and sets `state.preferencesSeeded = true`. The tool returns a `muninnInstruction` string that contains the canonical MuninnDB call you must execute next.

### 3b. Register in MuninnDB

Resolve the vault: read `.planning/config.json` → `muninn.vault`, fallback `"default"`.

Then call (substituting `<vault>` and the seeded preferences object):

```
mcp__muninn__muninn_remember(
  vault: "<vault>",
  op_id: "project-preferences:<vault>",
  type: "project_preferences",
  entities: [{ name: "<repo-folder-name>", type: "project" }],
  tags: ["preferences", "project-config", "luca", "convention"],
  content: "<JSON.stringify of approved preferences>",
  summary: "<one-paragraph natural-language summary so semantic recall finds this memory once enrichment completes>"
)
```

Notes:
- `op_id` makes this idempotent — concurrent or repeat seeds return the existing memory ID without duplicating (Risk 7 / C3 mitigation).
- The `summary` field is what gets embedded for semantic recall. Write it in plain prose, not JSON.
- MuninnDB enrichment is async — the memory is FTS-indexed immediately but won't be vector-searchable for ~5–30s. Entity+tag lookup (used by `projectPreferences.consult` callers) is lag-free.

## Phase 4 — Confirm to user

Print a one-line confirmation:

```
✓ Project preferences seeded — branching=<types[]>, commits=<convention>, release=<tool>, tracker=<kind>.
  Edit later with `/luca-init` or `projectPreferences(action: "update", payload: ...)`.
```

Return control to the calling agent (triage in the sentinel case).

## Failure modes

| Signal | Action |
|---|---|
| `git` unavailable | Use defaults for branching/commits sections; warn user. |
| `gh` not authenticated | Skip PR-title probe; use default `{type}({scope}): {description}`. |
| MuninnDB unreachable in Phase 3b | Local cache still wrote successfully; warn user that semantic recall will be unavailable until MuninnDB is up. Set `state.preferencesSeeded = true` regardless — the local cache is authoritative. |
| Zod parse failure on payload | Skill aborts, surfaces the parse error verbatim. Caller may retry with corrected values. |
