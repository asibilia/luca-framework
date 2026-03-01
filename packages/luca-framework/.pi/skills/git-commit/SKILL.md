---
name: git-commit
description: Stage and commit changes using the project's conventional commit CLI with ticket extraction.
---

# git-commit

Stage and commit changes using the project's conventional commit CLI with ticket extraction.

## main

<main>
# Git Commit

Create commits using the project's custom CLI tool.

## Standard Workflow (Non-Interactive)

**ALWAYS** use non-interactive mode with flags:

```bash
# Stage ALL files first (intentional - we don't do partial commits)
git add .

# Commit with flags
bun run commit --message="description" --type=fix --scope=apps --no-push
```

**Flags:**

- `--message="..."` - Commit description (required for non-interactive)
- `--type=fix|feat|chore|docs|refactor|test` - Commit type (default: fix)
- `--scope=apps|packages-ui|other|...` - Commit scope (default: other)
- `--no-push` - Skip pushing to remote
- `--skip-checks` - Skip pre-commit checks (use after manual verification)

## Important Rules

1. **ALWAYS** use `bun run commit` instead of `git commit -m` directly
2. **ALWAYS** use `git add .` to stage ALL files before committing
3. **NEVER** do partial commits in standard workflow - partial commits are only for fixing errors
4. The tool handles ticket extraction from branch names automatically

## What the tool handles

- Commit message formatting with ticket extraction from branch names
- Changeset creation for deployable packages
- Pre-commit validation (lint, build, test)

## Interactive Mode (User-Initiated Only)

If the user explicitly requests interactive mode:

```bash
bun run commit
```

This prompts for commit details interactively.

## Branch Naming Convention

`[TICKET-ID]--[description]` (e.g., `[TICKET-ID]--my-cool-feature`)

> **Note:** Replace `[TICKET-ID]` with your project's configured ticket pattern (e.g., `PROJ-123`, `PT-456`, or your custom `ticketPattern` from `.planning/config.json`). Default pattern: `[A-Z]+-\d+`
</main>