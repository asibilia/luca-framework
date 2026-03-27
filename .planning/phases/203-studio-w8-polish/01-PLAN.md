---
phase: 203
plan: 1
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 203 Plan 1: Settings Page + Git Rollback

## Objective

Build the Settings page with raw config editor, project identity, vault configuration, and git config history. Implement the Git publish/revert API layer and integrate the Config History timeline as a section on the Settings page.

> Appetite: Large (200,000 tokens remaining of 200,000 ceiling)

## Context

@packages/luca-studio/app/settings/page.tsx (existing stub to replace)
@packages/luca-studio/app/api/config/route.ts (reference for API route pattern -- readFile, ETag, resolveProjectRoot)
@packages/luca-studio/components/editor/code-mirror-wrapper.tsx (existing CodeMirror component to extend for JSON editing)
@packages/luca-studio/stores/config-atoms.ts (configAtom, configDraftAtom, configEtagAtom)
@packages/luca-studio/stores/dirty-tracking.ts (dirtySetAtom, markDirtyAtom, markCleanAtom, setValidationErrorsAtom, canSaveAtom)
@packages/luca-studio/hooks/use-config-save.ts (reference for PUT with ETag concurrency)
@packages/luca-studio/hooks/use-config-conflict.ts (SSE conflict detection pattern)
@packages/luca-studio/hooks/use-config-hydration.ts (configAtom hydration)
@packages/luca-studio/hooks/use-edit-mode.ts (View/Edit mode pattern)
@packages/luca-studio/components/feedback/save-bar.tsx (shared save bar)
@packages/luca-studio/components/layout/page-container.tsx (page wrapper)
@packages/luca-studio/app/config/page.tsx (reference for tab-based config page)
@packages/luca-studio/lib/project-root.ts (resolveProjectRoot for API routes)
@packages/luca-studio/lib/etag.ts (computeETag for config saves)
@packages/luca-studio/lib/safe-json-parse.ts (safeJsonParse for config reading)
@.planning/phases/203-studio-w8-polish/01-CONTEXT.md
@.planning/phases/203-studio-w8-polish/01-PREMORTEM.md

## Tasks

### 1. Create Git API routes (publish, history, revert)

**Type:** auto
**TDD:** false
**Depends on:** none

Build three API routes for the git safety net:

**`POST /api/git/publish`** -- Batch commit all Studio-edited entity files.

1. Run `git status --porcelain` via `Bun.$` to list uncommitted files.
2. Filter to entity-tracked paths (files under `src/agents/`, `src/skills/`, `src/rules/`, `.planning/config.json`).
3. **PRE-MORTEM CONSTRAINT:** Before committing, check for non-Studio uncommitted changes. If any exist, return `409 Conflict` with `{ error: "Non-Studio uncommitted changes detected", files: [...] }`. The route MUST NOT silently commit when the working tree has unrelated dirty files.
4. If no Studio changes exist, return `{ message: "No changes to publish" }` with 200.
5. `git add` only the Studio files, then `git commit -m "[studio-edit] {summary}"` where summary lists changed entity names.
6. Return `{ commit_sha, message, file_count }`.

**`GET /api/git/history`** -- Return Studio commit history.

1. Run `git log --grep="[studio-edit]" --format=json-ish` to get Studio-specific commits.
2. Parse each commit into `{ sha, message, date, author, file_count }`.
3. Support `?limit=N` query param (default 20).
4. Return `{ commits: [...] }`.

**`POST /api/git/revert`** -- Revert a specific file to a specific commit SHA.

1. Accept `{ file_path, commit_sha }` in the request body.
2. Run `git checkout <sha> -- <file_path>` via `Bun.$`.
3. Stage the reverted file.
4. Return `{ reverted: true, file_path }`.
5. On conflict or error, return `{ error: "Revert failed: ..." }` with 500.

**Files to create:**

- `packages/luca-studio/app/api/git/publish/route.ts`
- `packages/luca-studio/app/api/git/history/route.ts`
- `packages/luca-studio/app/api/git/revert/route.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Each route exports the correct HTTP method handler (POST/GET/POST)
- The publish route explicitly checks for non-Studio dirty files before committing

### 2. Create raw config editor component with dual validation

**Type:** auto
**TDD:** false
**Depends on:** none

Build `components/settings/raw-config-editor.tsx` -- a CodeMirror-based JSON editor for the full `config.json`.

**Implementation:**

1. Import and extend the CodeMirror patterns from `code-mirror-wrapper.tsx` but use `@codemirror/lang-json` instead of `@codemirror/lang-markdown` (install if not present).
2. Read initial value from `configAtom` (stringified). Edits write to a local `rawConfigDraftAtom` (string, separate from the structured `configDraftAtom`).
3. **PRE-MORTEM CONSTRAINT:** On save, run dual validation:
   - Step 1: `JSON.parse()` -- if it fails, show JSON syntax error inline (red banner below editor).
   - Step 2: Parse the JSON object through the Luca `ConfigSchema` (import from `packages/luca-framework/src/shared/__schemas/config.schemas.ts` or define a local subset). If Zod validation fails, show each issue as an inline error below the editor.
   - Only if both pass: PUT to `/api/config` with the full config JSON and ETag.
4. Show a "Valid JSON" / "Invalid JSON" / "Schema Error" indicator badge next to the editor.
5. Integrate with `markDirtyAtom("raw-config")` for dirty tracking.

**Files to create/edit:**

- Create: `packages/luca-studio/components/settings/raw-config-editor.tsx`
- Create: `packages/luca-studio/stores/settings-atoms.ts` (rawConfigDraftAtom string atom)
- Possibly install: `@codemirror/lang-json` (check if already available)

**Verification:**

- Dual validation runs: JSON parse first, then Zod schema
- Invalid JSON shows syntax error inline
- Valid JSON with invalid schema shows Zod errors inline
- Only valid+schema-compliant JSON can be saved
- `bunx --bun tsc --noEmit` passes

### 3. Create project identity and vault config components

**Type:** auto
**TDD:** false
**Depends on:** none

Build two read-display components for the Settings page.

**`components/settings/project-identity.tsx`:**

1. Fetch project identity from `/api/muninn/stats` or `/api/muninn/session` (reuse existing MuninnDB API routes).
2. Display project name, domain, purpose as a card with label-value rows.
3. Show "MuninnDB unavailable" gracefully if the fetch fails.
4. Read-only display (no editing).

**`components/settings/vault-config.tsx`:**

1. Fetch vault info from `/api/muninn/vaults` (existing route).
2. Display vault name, dual-vault routing summary table (repo vault vs default vault).
3. Show vault health summary (engram count, last activity) from `/api/muninn/health`.
4. Read-only display.

**Files to create:**

- `packages/luca-studio/components/settings/project-identity.tsx`
- `packages/luca-studio/components/settings/vault-config.tsx`

**Verification:**

- Both components render gracefully when MuninnDB is unavailable
- Components display accurate data when MuninnDB is connected
- `bunx --bun tsc --noEmit` passes

### 4. Create config history component

**Type:** auto
**TDD:** false
**Depends on:** 1

Build `components/settings/config-history.tsx` -- a timeline of `[studio-edit]` commits with rollback capability.

**Implementation:**

1. Fetch commit list from `GET /api/git/history` (built in Task 1).
2. Display as a vertical timeline: commit message (sans `[studio-edit]` prefix), relative date, file count badge.
3. Each commit expands to show changed files (fetch from a commit detail endpoint or embed file list in history response).
4. Per-file "Revert" button calls `POST /api/git/revert` with the file path and commit SHA.
5. Before revert, show a confirmation dialog: "Revert {file} to commit {sha}? This will overwrite the current version."
6. After successful revert, show a toast and refresh the file list.
7. Handle empty state: "No Studio commits yet. Edit entities and click Publish to create your first commit."

**Files to create:**

- `packages/luca-studio/components/settings/config-history.tsx`

**Verification:**

- Timeline renders Studio commits with correct date formatting
- Revert shows confirmation dialog before executing
- Empty state displays when no commits exist
- `bunx --bun tsc --noEmit` passes

### 5. Assemble Settings page with all sections

**Type:** auto
**TDD:** false
**Depends on:** 2, 3, 4

Replace the existing settings page stub with the full implementation.

**Implementation:**

1. Replace `app/settings/page.tsx` content with four collapsible sections:
   - **Raw Config Editor** (default open) -- the `raw-config-editor.tsx` component
   - **Project Identity** (default open) -- the `project-identity.tsx` component
   - **Vault Configuration** (default collapsed, "(Advanced)" label) -- the `vault-config.tsx` component
   - **Config History** (default open) -- the `config-history.tsx` component
2. Use shadcn `Collapsible` or `Accordion` for sections.
3. Add a "Publish Changes" button in the page header (calls `POST /api/git/publish`).
4. Show publish result as a toast (success: commit SHA, error: non-Studio changes detected).
5. Integrate SaveBar for raw config editor saves.
6. Add SSE conflict detection (reuse `useConfigConflict` pattern).

**Files to edit:**

- `packages/luca-studio/app/settings/page.tsx` (full rewrite)

**Verification:**

- Settings page loads with all four sections visible
- Raw Config Editor validates JSON + Zod before save
- Publish button creates batch commit when Studio changes exist
- Publish button shows error when non-Studio changes detected
- Config History displays timeline and supports per-file rollback
- `bunx --bun tsc --noEmit` passes

## Verification

1. **Settings page renders** -- Navigate to `/settings`, all four sections load without error
2. **Raw config editing** -- Edit config JSON, see validation feedback, save with ETag concurrency
3. **Dual validation** -- Break JSON syntax: syntax error shown. Fix JSON but violate schema: Zod errors shown. Fix both: save succeeds
4. **Git publish** -- Make entity edits, click Publish, see batch commit created with `[studio-edit]` prefix
5. **Non-Studio guard** -- With non-Studio uncommitted changes, Publish returns 409 error (pre-mortem Risk 1)
6. **Config history** -- Timeline shows Studio commits, per-file revert works with confirmation
7. **Project identity** -- Displays project info from MuninnDB, graceful fallback when unavailable
8. **Vault config** -- Displays vault name and routing table
9. **TypeScript** -- `bunx --bun tsc --noEmit` passes cleanly

## Success Criteria

- Settings page is fully functional with raw editor, identity, vault, and history sections
- Git publish creates `[studio-edit]` prefixed batch commits
- Non-Studio working tree changes block publish (409 error, not silent commit)
- Dual validation (JSON parse + Zod schema) prevents invalid config persistence
- Per-file rollback via git revert works with confirmation dialog

## Output Specification

**Files created:**

- `packages/luca-studio/app/api/git/publish/route.ts`
- `packages/luca-studio/app/api/git/history/route.ts`
- `packages/luca-studio/app/api/git/revert/route.ts`
- `packages/luca-studio/components/settings/raw-config-editor.tsx`
- `packages/luca-studio/components/settings/project-identity.tsx`
- `packages/luca-studio/components/settings/vault-config.tsx`
- `packages/luca-studio/components/settings/config-history.tsx`
- `packages/luca-studio/stores/settings-atoms.ts`

**Files modified:**

- `packages/luca-studio/app/settings/page.tsx` (full rewrite from stub)
