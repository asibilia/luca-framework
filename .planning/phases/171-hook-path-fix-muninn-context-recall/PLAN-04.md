---
phase: 171
plan: 4
type: feature
autonomous: true
wave: 2
depends_on: []
---

# Phase 171 Plan 4: Create MuninnDB Context Recall Hook

## Objective

Create a new `muninn-context-recall` UserPromptSubmit hook that recalls relevant MuninnDB memories on each user prompt and injects them as `additionalContext` into the conversation. This gives the AI continuous access to project identity, patterns, decisions, and pitfalls without requiring manual `/recall` commands.

**CRITICAL DESIGN CONSTRAINTS:**

1. Must be `async: false` (synchronous) — `additionalContext` is only processed from sync hooks
2. Must be a SEPARATE hook entry from the existing `user-prompt-submit` hook (which is `async: true`)
3. Must use a 60-second throttle to avoid hammering MuninnDB on rapid prompts
4. Must have an 8-second timeout (5s MuninnDB + 3s buffer)
5. Must emit `hookSpecificOutput: { additionalContext: "..." }` — this is the ONLY hook event where `hookSpecificOutput` with `additionalContext` is valid

## Context

@src/hooks/scripts/user-prompt-submit.ts (existing async hook on same event — reference for patterns)
@src/hooks/**helpers/hook-io.ts (readStdinJson, emitResult, checkThrottle, recordThrottle, projectHash, guardDedup)
@src/hooks/**helpers/muninn.ts (recallMuninnEngrams — the HTTP client for MuninnDB recall)
@src/hooks/**helpers/vault.ts (resolveVault — reads vault name from .planning/config.json)
@src/hooks/**helpers/hook-registry.ts (canonicalHookRegistry — register the new hook here)
@scripts/deploy-global.ts (mergeSettings — add UserPromptSubmit event with both hooks)

## Tasks

### 1. Create muninn-context-recall.ts hook script

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/hooks/scripts/muninn-context-recall.ts` — a synchronous UserPromptSubmit hook.

**Implementation requirements:**

1. **Read stdin** — Use `readStdinJson()` to extract the user's prompt text. The UserPromptSubmit stdin shape includes `{ user_message: string }` (the user's prompt text). Extract it for contextual recall.

2. **Dedup guard** — Call `guardDedup("muninn-context-recall")` to prevent double-firing from global+project registration.

3. **Throttle** — Use `checkThrottle()` / `recordThrottle()` with a 60-second TTL. Throttle key: `/tmp/.luca-muninn-recall-${projectHash()}-ts`. If throttled, exit 0 immediately (no output).

4. **Resolve vault** — Call `resolveVault()` to get the repo vault name. The default vault is always `"default"`.

5. **Build recall context** — Extract keywords from the user prompt. Use the first 200 characters of the user message as the recall context string. If no user message is available, use a generic context like `"project context patterns decisions"`.

6. **Dual-vault recall** — Call `recallMuninnEngrams()` twice in parallel:
   - Repo vault: `recallMuninnEngrams(repoVault, contextString, 3)`
   - Default vault: `recallMuninnEngrams("default", contextString, 3)`
     Use `Promise.all()` for parallelism. Each call has a built-in 5-second timeout.

7. **Format results** — Combine both arrays, deduplicate by concept (keep highest score), take top 5. Format as a readable string:

   ```
   ## Recalled Memories (MuninnDB)

   ### {concept}
   {content}

   ### {concept}
   {content}
   ...
   ```

8. **Emit additionalContext** — If there are recalled memories, call:

   ```typescript
   emitResult({
     hookSpecificOutput: {
       additionalContext: formattedMemories,
     },
   });
   ```

   If no memories were recalled (both arrays empty), exit 0 silently.

9. **Error handling** — Wrap everything in try/catch. On any error, exit 0 silently. This hook must NEVER block the user's prompt.

**File structure pattern** — Follow the same module structure as `user-prompt-submit.ts`:

- Imports at top
- guardDedup call at module level
- `main` async function
- `await main()` at bottom

**Files to create/edit:**

- `src/hooks/scripts/muninn-context-recall.ts` — NEW file

**Verification:**

- File exists at `src/hooks/scripts/muninn-context-recall.ts`
- Uses `guardDedup("muninn-context-recall")` at module level
- Uses `checkThrottle()` with 60-second TTL
- Performs dual-vault recall via `recallMuninnEngrams()`
- Emits `hookSpecificOutput.additionalContext` (not `systemMessage`)
- Always exits 0
- No `async: true` in the hook registration (this is a sync hook)

### 2. Register in canonical hook registry

**Type:** auto
**TDD:** false
**Depends on:** 1

Add the new hook to `canonicalHookRegistry` in `src/hooks/__helpers/hook-registry.ts`.

```typescript
"muninn-context-recall": () => ({
  event: "user_prompt_submit",
  script: "muninn-context-recall.ts",
  timeout: 8,
  async: false,
  status_message: "Recalling context...",
}),
```

**CRITICAL**: `async: false` — this hook must be synchronous for `additionalContext` to be injected.

**Files to create/edit:**

- `src/hooks/__helpers/hook-registry.ts` — add entry to `canonicalHookRegistry`

**Verification:**

- `canonicalHookRegistry` contains `"muninn-context-recall"` entry
- `async` is `false`
- `timeout` is `8`
- `event` is `"user_prompt_submit"`

### 3. Add UserPromptSubmit to deploy-global.ts mergeSettings()

**Type:** auto
**TDD:** false
**Depends on:** 1, 2

The `mergeSettings()` function in `scripts/deploy-global.ts` is missing the `UserPromptSubmit` event entirely. Add it with both hooks:

1. The existing `user-prompt-submit` (async observation hook)
2. The new `muninn-context-recall` (sync context injection hook)

Add to the `lucaHooks` object in `mergeSettings()`:

```typescript
UserPromptSubmit: [
  {
    hooks: [
      {
        type: "command",
        command: `"${globalHooksDir}/muninn-context-recall.sh"`,
        timeout: 8,
        statusMessage: "Recalling context...",
      },
      {
        type: "command",
        command: `"${globalHooksDir}/user-prompt-submit.sh"`,
        timeout: 5,
        async: true,
        statusMessage: "Saving prompt observation...",
      },
    ],
  },
],
```

**Order matters**: The sync hook (`muninn-context-recall`) MUST come first so its `additionalContext` is processed before the async hook fires.

Also add `"muninn-context-recall.sh"` and `"user-prompt-submit.sh"` to the `lucaScripts` identification arrays in both `mergeSettings()` (line ~579) and `removeGlobalArtifacts()` (line ~707) so they are properly managed during deploy/remove.

**Files to create/edit:**

- `scripts/deploy-global.ts` — add `UserPromptSubmit` to `lucaHooks`, update `lucaScripts` arrays

**Verification:**

- `lucaHooks` object contains `UserPromptSubmit` key
- Sync hook (`muninn-context-recall.sh`) is listed BEFORE async hook (`user-prompt-submit.sh`)
- `lucaScripts` arrays in both `mergeSettings()` and `removeGlobalArtifacts()` include both new script names
- The sync hook does NOT have `async: true`
- The existing async hook has `async: true`

### 4. Add SubagentStop and PostToolUseFailure to mergeSettings() lucaScripts

**Type:** auto
**TDD:** false
**Depends on:** 3

While updating `lucaScripts` arrays, also add the existing but unregistered hooks: `"subagent-stop.sh"` and `"post-tool-use-failure.sh"`. These hooks exist in the registry and get deployed as `.sh` wrappers, but are not listed in `lucaScripts` — meaning `removeGlobalArtifacts()` would not clean them up and `mergeSettings()` would not filter them from non-Luca hooks.

Add to both `lucaScripts` arrays in `mergeSettings()` and `removeGlobalArtifacts()`:

- `"subagent-stop.sh"`
- `"post-tool-use-failure.sh"`
- `"user-prompt-submit.sh"`
- `"muninn-context-recall.sh"`

**Files to create/edit:**

- `scripts/deploy-global.ts` — update both `lucaScripts` arrays

**Verification:**

- Both `lucaScripts` arrays include all hook script names that are deployed
- No hook script is missing from the identification arrays

## Verification

1. Run `bunx --bun tsc --noEmit` to verify TypeScript compiles
2. Read the new `muninn-context-recall.ts` and confirm:
   - It uses `readStdinJson()` to extract user prompt
   - It performs dual-vault recall via `recallMuninnEngrams()`
   - It emits `hookSpecificOutput.additionalContext`
   - It has a 60-second throttle
   - It always exits 0
3. Read `hook-registry.ts` and confirm the new entry has `async: false`
4. Read `deploy-global.ts` and confirm `UserPromptSubmit` event is registered with both hooks in correct order

## Success Criteria

- `src/hooks/scripts/muninn-context-recall.ts` exists and compiles
- The hook is registered in `canonicalHookRegistry` with `async: false` and `timeout: 8`
- `deploy-global.ts` `mergeSettings()` includes `UserPromptSubmit` event
- The sync hook is listed before the async hook in the `UserPromptSubmit` entry
- `lucaScripts` arrays are complete with all hook script names
- TypeScript compiles without errors

## Output Specification

- New file: `src/hooks/scripts/muninn-context-recall.ts`
- Modified file: `src/hooks/__helpers/hook-registry.ts` (new registry entry)
- Modified file: `scripts/deploy-global.ts` (UserPromptSubmit event + lucaScripts updates)
