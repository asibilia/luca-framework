---
"@alecsibilia/luca-mastracode": minor
---

Harden feature-branch creation so the pipeline can never commit directly to the default branch.

- **New `ensureFeatureBranch` tool** with `status` / `create` / `rename` actions. `create` switches to `<type>/<issue>-<slug>` from the default branch, validates against local + remote name collisions, and persists `branchName` + `issueNumber` to `luca-state.json`. Default-branch detection prefers `origin/HEAD` and falls back to `main`/`master`/`trunk`.
- **Architect Step 1** now calls `ensureFeatureBranch({ action: "create", ... })` instead of relying on the agent to shell out to `git switch -c` correctly.
- **Executor pre-commit guard**: before the first commit of a session, the executor calls `ensureFeatureBranch({ action: "status" })` and aborts with `BRANCH_NOT_CREATED` if HEAD is on the default branch or detached. Catches every regression where Architect Step 1 is skipped (e.g. fast-mode shortcuts).
- **Finalize pre-push guard**: before pushing and opening the PR, finalize re-runs the status check so a draft PR can never be opened against the default branch.
- **Co-Authored-By trailer** changed from `Luca <noreply@luca.dev>` (domain doesn't resolve, breaks GitHub linkback) to `Claude <noreply@anthropic.com>` until the `luca.dev` domain is owned and wired up.
- **Pre-commit MuninnDB recall hook** in the executor subagent and `instructions/execute.md` Step 6, so prior commit-related learnings (message conventions, trailer format, files to exclude) are surfaced before staging.
- **Pre-changeset MuninnDB recall hook** in `instructions/finalize.md` Step 5b.1 and the `gh-prepare` skill, so prior changeset-authoring learnings (frontmatter shape, bump-level rules, package-name canonicalisation) are surfaced before writing the changeset.
