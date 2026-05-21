# Phase 203: Pre-Mortem Risk Brief

**Complexity:** COMPLEX | **Appetite:** Large (200k tokens)

## Risk 1: Git Working Tree State Collision

**Scenario:** User edits framework code, presses "Publish", Studio commits only entity files while uncommitted non-Studio changes remain invisible.

**Mitigation:** Check for uncommitted non-Studio files before batch commit; warn user and require explicit opt-in.

**Plan constraint:** Git publish API route MUST detect non-Studio uncommitted changes and return error before committing.

## Risk 2: CodeMirror JSON Valid But Zod Schema Invalid

**Scenario:** Raw config editor shows "valid JSON" but Zod schema rejects the config on next reload because only JSON syntax was checked, not schema compliance.

**Mitigation:** Validate against full Zod schema BEFORE saving, not just JSON syntax. Show both JSON parse errors and Zod validation errors inline.

**Plan constraint:** Settings page raw editor MUST run dual validation (JSON parse + Zod schema) before persisting.

## Risk 3: Keyboard Shortcut Collision with CodeMirror

**Scenario:** Cmd+K inside CodeMirror triggers both the command palette and the editor's autocomplete, creating duplicate dispatches.

**Mitigation:** Input focus guard must detect `.cm-editor` and `.cm-content` elements, blocking ALL global shortcuts when CodeMirror is focused.

**Plan constraint:** use-keyboard-shortcuts.ts MUST explicitly test for CodeMirror elements in the focus guard.
