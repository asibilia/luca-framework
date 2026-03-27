# Phase 203: Studio W8 Polish — Context

## Decision Summary

All decisions resolved via codebase analysis and todo specifications (auto-mode, full-auto oversight).

---

## 1. Git Rollback — Batch Commit on Publish

**Decision:** Implement a "Publish" action that creates a single git commit with all dirty entity changes, prefixed with `[studio-edit]`. [codebase-resolved]

**Publish flow:**

- User edits entities across pages (agents, skills, rules, config)
- Each "Save" writes to disk via PUT API (existing flow, no change)
- "Publish" button in header or settings commits all uncommitted Studio changes as one batch
- Commit message: `[studio-edit] {description}` where description summarizes changed entities
- Uses `Bun.$` shell for git operations (no new dependencies)

**API routes:**

- `POST /api/git/publish` — Creates batch commit with `[studio-edit]` prefix
- `GET /api/git/history` — Returns `git log --grep="[studio-edit]"` as JSON
- `POST /api/git/revert` — Reverts a specific file to a specific commit SHA

**Config History view:**

- Timeline of `[studio-edit]` commits with message, date, file count
- Per-file rollback with diff preview confirmation dialog
- Lives as a section on the Settings page (not a standalone page)

**Edge cases:**

- No uncommitted changes: "Publish" button disabled with tooltip "No changes to publish"
- Working tree has non-Studio changes: Only commit Studio-tracked files (entity configs)
- Revert conflicts: Show error and suggest manual resolution

---

## 2. Keyboard Shortcuts — Centralized Handler

**Decision:** Build a centralized keyboard shortcut system with input focus awareness. [codebase-resolved]

**7 shortcuts:**

- `Cmd+K` — Command palette (new component)
- `Cmd+S` — Save (already exists per-page, centralize)
- `Cmd+\` — Toggle navigation rail
- `Cmd+.` — Toggle detail panel
- `Cmd+Z` / `Cmd+Shift+Z` — Undo/redo (already wired via useUndo)
- `Escape` — Close panel or exit edit mode
- `Cmd+Shift+P` — Preview compiled output

**Implementation:**

- `hooks/use-keyboard-shortcuts.ts` — Central hook mounted at LayoutShell level
- Input focus guard: Check `document.activeElement` — skip if inside `<input>`, `<textarea>`, `[contenteditable]`, or CodeMirror
- Each shortcut dispatches to a Jotai atom or callback
- Command palette: Simple list of actions with fuzzy search, triggered by Cmd+K

**Progressive disclosure:**

- Collapsed sections by default for advanced content
- Tooltips on technical terms (use existing shadcn Tooltip component)
- "(Advanced)" labels on state/eval pages
- No modals or onboarding tours

---

## 3. Settings Page — Escape Hatch

**Decision:** Build a minimal settings page with raw config editor, project identity, and vault config. [codebase-resolved]

**Three sections:**

- **Raw Config Editor:** Full config.json in CodeMirror editor (reuse existing CodeMirrorWrapper). Validate with `safeParse()` on save. Show inline validation errors.
- **Project Identity:** Display project name, domain, purpose from MuninnDB brain tree (read-only if MuninnDB unavailable)
- **Vault Configuration:** Show vault name, dual-vault routing table, vault health summary

**Implementation:**

- Replace existing `app/settings/page.tsx` stub
- Three section components: `components/settings/raw-config-editor.tsx`, `components/settings/project-identity.tsx`, `components/settings/vault-config.tsx`
- Config History section (from git rollback) also lives here
- Uses existing `configDraftAtom` for raw editing (separate from structured Config page)
- Save validates JSON + Zod schema before writing

---

## Wave Grouping Recommendation

- **Wave 1:** Settings page + Git rollback (both live on settings page, share API infrastructure)
- **Wave 2:** Keyboard shortcuts + progressive disclosure (cross-cutting, applies to all pages)
