# Phase 171: Hook Path Fix & MuninnDB Context Recall - Research

**Researched:** 2026-03-15
**Domain:** Hook infrastructure, shell wrapper generation, MuninnDB integration
**Confidence:** HIGH

## Summary

Validated all four proposed fixes by reading source code and tracing execution paths. Two fixes are correct as proposed (Fix 2, Fix 3). One fix has the right diagnosis but the proposed solution is **wrong** (Fix 1 -- `$CLAUDE_PROJECT_DIR` does not point to the monorepo in global deploy). One fix is valid but has important caveats about settings registration and hook coexistence (Fix 4).

**Primary recommendation:** Fix 1 needs a different approach than proposed. The remaining fixes are sound with minor adjustments.

## Fix Validation Results

### Fix 1: Shell wrapper path resolution -- NEEDS_ADJUSTMENT

**Diagnosis: CORRECT.** The `generateShellWrapper()` in `src/hooks/__helpers/generate-shell-wrappers.ts` (line 40-42) generates:

```sh
#!/bin/sh
exec bun "$(dirname "$0")/../../src/hooks/scripts/${scriptName}" "$@" <&0
```

When deployed globally to `~/.claude/hooks/`, `$(dirname "$0")` resolves to `~/.claude/hooks/`, and `../../` resolves to `~/`. The full path becomes `~/src/hooks/scripts/context-monitor.ts` which does NOT exist. Confirmed by reading the actual deployed wrapper at `~/.claude/hooks/context-monitor.sh`.

**Proposed fix: WRONG.** The proposal says to change to `$CLAUDE_PROJECT_DIR/src/hooks/scripts/`. This is incorrect because `$CLAUDE_PROJECT_DIR` is set by Claude Code to the **current project being worked on** (e.g., `~/Github/some-other-project/`), NOT to the luca-framework monorepo where the TS source files live. The project-level wrappers work because they're in `.claude/hooks/` of the monorepo root, so the relative `../../` correctly resolves to the monorepo root.

**Evidence:**

- `hook-io.ts` line 26: `export const projectDir = (): string => process.env.CLAUDE_PROJECT_DIR || ".";`
- `settings.json` uses `"$CLAUDE_PROJECT_DIR"/.claude/hooks/...` for the COMMAND path (which invokes the `.sh` wrapper), but the wrapper itself needs to find the `.ts` source files.
- `deploy-global.ts` lines 315-373: `deployHooks()` copies `.sh` files from `.claude/hooks/` to `~/.claude/hooks/` without modifying their content. It does NOT deploy the TS source files.

**Correct fix (two options):**

**Option A (recommended): Rewrite wrapper content during global deploy.** In `deploy-global.ts`, after copying each hook script, rewrite the path inside the `.sh` file to use an absolute path to the monorepo's `src/hooks/scripts/`:

```typescript
// In deployHooks(), after copying each script:
const content = readFileSync(join(targetDir, script), "utf-8");
const rewritten = content.replace(
  /exec bun "\$\(dirname "\$0"\)\/[^"]*\/src\/hooks\/scripts\//,
  `exec bun "${projectRoot}/src/hooks/scripts/`,
);
writeFileSync(join(targetDir, script), rewritten);
```

This embeds the absolute monorepo path at deploy time. The `projectRoot` is already available in the deploy function.

**Option B: Co-locate TS sources with deployed wrappers.** Also deploy `src/hooks/scripts/*.ts` and `src/hooks/__helpers/*.ts` to `~/.claude/hooks/scripts/` and `~/.claude/hooks/__helpers/` respectively, then change the wrapper to use a relative path from the new co-located location. This is more complex and duplicates source files.

**Additional finding:** The statusline wrapper at `.claude/statusline.sh` has the same issue. It uses `../src/hooks/scripts/statusline.ts` which resolves to `~/src/hooks/scripts/statusline.ts` when deployed to `~/.claude/statusline.sh`. The `deployStatusline()` function (lines 377-394) copies this file without rewriting paths. This needs the same fix.

**Additional finding 2:** The `mergeSettings()` function in `deploy-global.ts` (lines 428-620) does NOT register `UserPromptSubmit`, `SubagentStop`, or `PostToolUseFailure` hooks in the global settings.json. The current global `~/.claude/settings.json` is missing these three events compared to the project-level settings. This is a pre-existing gap.

### Fix 2: context-monitor.ts hookSpecificOutput removal -- VALIDATED

**Diagnosis: CORRECT.** The `context-monitor.ts` hook fires on the `stop` event (confirmed by `hook-registry.ts` line 79: `event: "stop"`). Stop hooks only support `systemMessage` output -- they do NOT support arbitrary `hookSpecificOutput` fields.

**Evidence:**

- Lines 165-187 of `context-monitor.ts`: Both the Claude branch (`isClaude()`) and Cursor branch emit `hookSpecificOutput` with a `context_breakdown` object.
- The `exitBlock()` function in `hook-io.ts` (lines 128-136) uses `hookSpecificOutput` with `permissionDecision` / `permissionDecisionReason` -- but this is specifically for `PreToolUse` hooks where this schema IS valid.
- Grep confirmed that NO other hook script (outside `hook-io.ts exitBlock`) uses `hookSpecificOutput`. Only `context-monitor.ts` does.

**Proposed fix: CORRECT.** Remove `hookSpecificOutput` from both `emitResult()` calls. The `systemMessage` (Claude) and `followupMessage` (Cursor) alone are sufficient and are the correct output shapes for Stop hooks.

**Code change:**

```typescript
// Line 166-175: Replace with
emitResult({ systemMessage: text });

// Line 177-186: Replace with
emitResult({ followupMessage: text });
```

**No data loss:** The `context_breakdown` information was advisory/debugging data only. It was not consumed by any downstream system. The textual warning message in `systemMessage`/`followupMessage` already contains the useful information (usage percentage, token counts).

### Fix 3: generated-file-guard.rule.ts -- VALIDATED

**Diagnosis: CORRECT.** No existing rule covers this concern.

**Evidence from rule audit:**

- Searched all 15 rules in `src/rules/general/` for "generated", ".sh", "build:all" -- no matches.
- The closest rule is `hook-skill-boundary.rule.ts` which covers when to use hooks vs skills, but says nothing about generated vs source file editing.
- `CLAUDE.md` mentions "Never edit files in [.claude/] directory directly" but this is only read by Claude in the luca-framework repo, not in global deploys to other repos.

**Pattern confirmed:** The `createRule` factory pattern from `src/rules/__helpers/create-rule.ts` with `RuleConfig` type. Example: `file-naming.rule.ts` at `src/rules/general/file-naming.rule.ts` (lines 1-83).

**UNIVERSAL_RULES consideration:** The `deploy-global.ts` `UNIVERSAL_RULES` set (lines 43-54) controls which rules deploy globally. This new rule SHOULD be added to `UNIVERSAL_RULES` because the generated-file protection is relevant in ALL projects where Luca hooks are deployed (the `.claude/hooks/*.sh` files are generated in every project via `bun run build:all`).

**Adjustment needed:** Add `"generated-file-guard.md"` to the `UNIVERSAL_RULES` set in `deploy-global.ts` line 43-54 so it deploys globally.

### Fix 4: MuninnDB context recall hook (muninn-context-recall.ts) -- VALIDATED with caveats

**Diagnosis: CORRECT.** There is no existing mechanism to inject MuninnDB memories into conversation context before processing.

**Caveats identified:**

**Caveat 1: Hook coexistence.** The existing `user-prompt-submit.ts` is registered as `async: true` for the `user_prompt_submit` event. The proposed new hook (`muninn-context-recall`) would also fire on `user_prompt_submit`. Claude Code supports multiple hooks on the same event (the current settings.json already has multiple hooks for `PostToolUse` and `SessionStart`). However, `additionalContext` is only effective for **synchronous** (non-async) hooks. The existing hook is async. The new recall hook MUST be synchronous (`async: false`) to inject `additionalContext` before the prompt is processed.

Settings.json supports multiple entries per event, each with their own hooks array. The new hook should be a SEPARATE entry (not added to the same hooks array as the existing async hook) to avoid the async flag affecting it.

**Caveat 2: `additionalContext` output schema.** For `UserPromptSubmit` hooks, the correct output schema for injecting context is:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "string of additional context"
  }
}
```

This is the ONLY event type that supports `additionalContext`. The output MUST include `hookSpecificOutput.additionalContext` as a string.

**Caveat 3: stdin content.** UserPromptSubmit hooks receive the user's message in stdin as JSON. The existing `user-prompt-submit.ts` uses `drainStdin()` (ignores the content). The new hook should use `readStdinJson()` to extract the user's prompt text and use it as the recall query. The stdin shape for UserPromptSubmit includes the user's message content.

**Caveat 4: MuninnDB recall timing.** `recallMuninnEngrams()` (from `src/hooks/__helpers/muninn.ts`) has a 5-second internal timeout (`AbortSignal.timeout(5000)`). The hook itself needs a timeout. Since this is a synchronous hook that BLOCKS prompt processing, the timeout should be conservative. Recommended: 8 seconds total (5s for MuninnDB + 3s buffer for formatting/network).

**Caveat 5: Global deploy registration.** The `mergeSettings()` function in `deploy-global.ts` currently does NOT register `UserPromptSubmit` hooks. It would need a new entry added to the `lucaHooks` object (around line 563) for global availability. The existing `user-prompt-submit.sh` is also missing from global deploy registration.

**Caveat 6: Vault resolution.** The hook needs to recall from BOTH vaults (repo vault and "default" vault) per the dual-vault recall strategy documented in `vault-routing.md`. Use `resolveVault()` from `src/hooks/__helpers/vault.ts` for the repo vault, and always also query `"default"` vault.

**Caveat 7: Throttling.** The recall hook should have a per-project throttle to avoid hitting MuninnDB on every single prompt. A 60-second throttle (using `checkThrottle`/`recordThrottle` from `hook-io.ts`) would be appropriate -- inject context at most once per minute.

## Standard Stack

### Core (existing -- no new dependencies)

| Library | Version  | Purpose           | Why Standard              |
| ------- | -------- | ----------------- | ------------------------- |
| bun     | runtime  | Hook execution    | Project standard runtime  |
| zod     | existing | Schema validation | Already used in all hooks |

### Supporting (existing)

| Library          | Purpose                       | When to Use         |
| ---------------- | ----------------------------- | ------------------- |
| `hook-io.ts`     | stdin/stdout, throttle, dedup | All hooks           |
| `muninn.ts`      | MuninnDB HTTP client          | MuninnDB read/write |
| `vault.ts`       | Vault name resolution         | Vault name lookup   |
| `create-rule.ts` | Rule factory                  | New rule creation   |

## Architecture Patterns

### Shell Wrapper Generation Flow

```
src/hooks/__helpers/generate-shell-wrappers.ts
  └── generateShellWrapper(hookName, outputPath)
        └── Returns: #!/bin/sh\nexec bun "$(dirname "$0")/../../src/hooks/scripts/{name}.ts" "$@" <&0

scripts/build-shared.ts
  └── generateHookOutputs()
        ├── generateAllShellWrappers() → Map<path, content>
        └── generateClaudeHooksConfigFromCanonical() → settings.json fragment

scripts/build-all.ts
  └── Writes wrappers to .claude/hooks/*.sh
  └── Merges settings.json with $CLAUDE_PROJECT_DIR-based command paths

scripts/deploy-global.ts
  └── deployHooks(): Copies .sh files to ~/.claude/hooks/ AS-IS (no path rewrite)
  └── mergeSettings(): Writes absolute paths to ~/.claude/settings.json
```

**The gap:** `deploy-global.ts` copies shell wrappers without rewriting the relative `$(dirname "$0")/../../` paths to absolute paths. The wrappers work in-repo but break globally.

### Hook Output Contract by Event Type

| Event            | Valid Output Fields                                                                    | Notes                             |
| ---------------- | -------------------------------------------------------------------------------------- | --------------------------------- |
| PreToolUse       | `hookSpecificOutput.permissionDecision`, `hookSpecificOutput.permissionDecisionReason` | Can block tool use                |
| PostToolUse      | `systemMessage`, `followupMessage`                                                     | Advisory only                     |
| Stop             | `systemMessage`                                                                        | Advisory only                     |
| SessionStart     | `systemMessage`                                                                        | Advisory only                     |
| SessionEnd       | (none meaningful)                                                                      | Cleanup only                      |
| UserPromptSubmit | `hookSpecificOutput.additionalContext`                                                 | Injects context before processing |
| PreCompact       | `systemMessage`                                                                        | Advisory only                     |

### Settings.json Hook Registration Structure

```json
{
  "hooks": {
    "EventName": [
      {
        "matcher": "optional-tool-filter",
        "hooks": [
          {
            "type": "command",
            "command": "path/to/hook.sh",
            "timeout": 10,
            "async": true,
            "statusMessage": "Status text..."
          }
        ]
      }
    ]
  }
}
```

Multiple entries per event are supported. Each entry can have its own `matcher` and `hooks` array. Hooks within the same entry share the matcher. The `async` flag is per-hook, not per-entry.

## Don't Hand-Roll

| Problem                  | Don't Build                               | Use Instead                            | Why                             |
| ------------------------ | ----------------------------------------- | -------------------------------------- | ------------------------------- |
| Shell wrapper generation | Manual .sh files                          | `generateShellWrapper()`               | Single source of truth          |
| Hook stdin parsing       | Manual JSON parse                         | `readStdinJson()` / `parseHookInput()` | Error handling, platform compat |
| Hook stdout emission     | Manual `console.log(JSON.stringify(...))` | `emitResult()`                         | Correct field naming            |
| MuninnDB recall          | Manual fetch                              | `recallMuninnEngrams()`                | Timeout, auth, error handling   |
| Vault resolution         | Manual config reading                     | `resolveVault()`                       | Standard fallback chain         |
| Per-project throttle     | Manual timestamp files                    | `checkThrottle()` / `recordThrottle()` | Proven pattern across hooks     |

## Common Pitfalls

### Pitfall 1: $CLAUDE_PROJECT_DIR vs monorepo root

**What goes wrong:** Assuming `$CLAUDE_PROJECT_DIR` points to the luca-framework repo when hooks run globally. It actually points to whatever project the user is working in.
**Why it happens:** In the project-local case, `$CLAUDE_PROJECT_DIR` IS the monorepo root, so the confusion is natural.
**How to avoid:** For global deploy, embed absolute monorepo paths at deploy time. Never rely on `$CLAUDE_PROJECT_DIR` to find luca-framework source files.

### Pitfall 2: hookSpecificOutput on wrong event types

**What goes wrong:** Emitting `hookSpecificOutput` with arbitrary fields on events that don't support it causes JSON validation errors.
**Why it happens:** The `emitResult()` function accepts `hookSpecificOutput` for any hook, but only certain events process it.
**How to avoid:** Only use `hookSpecificOutput` for PreToolUse (`permissionDecision`) and UserPromptSubmit (`additionalContext`). For all other events, use `systemMessage` or `followupMessage` only.

### Pitfall 3: Sync vs async hook for additionalContext

**What goes wrong:** Making a UserPromptSubmit hook `async: true` when it needs to inject `additionalContext`. Async hooks can't inject context because they complete after the prompt is already processed.
**Why it happens:** The existing `user-prompt-submit.ts` is async (it just writes to MuninnDB), so copying its pattern is natural.
**How to avoid:** The context recall hook MUST be `async: false` (synchronous) to inject content before the LLM processes the prompt.

### Pitfall 4: Global deploy settings gap

**What goes wrong:** New hooks added to `hook-registry.ts` and `settings.json` (project-level) are not automatically added to the global deploy `mergeSettings()` function.
**Why it happens:** `mergeSettings()` in `deploy-global.ts` has a hardcoded list of hook events (lines 451-563). It's manually maintained and doesn't auto-sync with the canonical registry.
**How to avoid:** When adding new hooks, always update BOTH the canonical registry AND the `mergeSettings()` function in `deploy-global.ts`.

## Code Examples

### Correct emitResult for Stop hooks

```typescript
// Source: src/hooks/scripts/context-monitor.ts (after fix)
if (isClaude()) {
  emitResult({ systemMessage: text });
} else {
  emitResult({ followupMessage: text });
}
```

### Correct emitResult for UserPromptSubmit with additionalContext

```typescript
// Source: Claude Code hook output contract
emitResult({
  hookSpecificOutput: {
    additionalContext: "Relevant context string here...",
  },
});
```

### Rule creation pattern

```typescript
// Source: src/rules/general/file-naming.rule.ts
import { createRule } from "~/rules/__helpers/create-rule";
import type { RuleConfig } from "~/rules/__schemas/rule.schemas";

const config: RuleConfig = {
  frontmatter: {
    description: "Rule description here",
    alwaysApply: true,
  },
  sections: [
    {
      title: "rule",
      content: `Rule content here...`,
      order: 1,
    },
  ],
};

export const myRule = createRule(config);
```

### Global deploy path rewrite pattern

```typescript
// Proposed pattern for deploy-global.ts
function rewriteWrapperPaths(
  hookScript: string,
  scriptContent: string,
  projectRoot: string,
): string {
  // Replace relative dirname-based path with absolute monorepo path
  return scriptContent
    .replace(
      /\$\(dirname "\$0"\)\/\.\.\/\.\.\/src\/hooks\/scripts\//g,
      `${projectRoot}/src/hooks/scripts/`,
    )
    .replace(
      /\$\(dirname "\$0"\)\/\.\.\/src\/hooks\/scripts\//g,
      `${projectRoot}/src/hooks/scripts/`,
    );
}
```

## Open Questions

1. **Should deploy-global.ts auto-sync with canonical registry?**
   - What we know: `mergeSettings()` has a hardcoded hook list that's already out of sync (missing 3 events).
   - What's unclear: Whether this is intentional (only deploy "stable" hooks globally) or a bug.
   - Recommendation: At minimum, add `UserPromptSubmit` to global deploy for the new recall hook to work globally. Consider auto-generating from the canonical registry.

2. **Copy mode vs symlink mode for global deploy wrappers**
   - What we know: `deployHooks()` always uses `forceCopy = true` (line 347). In copy mode, the wrapper content is frozen at deploy time.
   - What's unclear: If the user uses `--copy` mode, rewriting paths at deploy time is safe. If symlink mode were used for hooks (it's not), it wouldn't work because the source `.sh` files have relative paths.
   - Recommendation: Path rewriting during copy is safe since hooks are always copied.

## Sources

### Primary (HIGH confidence)

- `src/hooks/__helpers/generate-shell-wrappers.ts` -- shell wrapper template (lines 29-43)
- `src/hooks/scripts/context-monitor.ts` -- hookSpecificOutput usage (lines 165-187)
- `src/hooks/__helpers/hook-io.ts` -- emitResult interface, CLAUDE_PROJECT_DIR usage
- `src/hooks/__helpers/hook-registry.ts` -- canonical registry with all events
- `src/hooks/__helpers/muninn.ts` -- recallMuninnEngrams API (lines 95-133)
- `src/hooks/scripts/user-prompt-submit.ts` -- existing UserPromptSubmit hook pattern
- `scripts/deploy-global.ts` -- mergeSettings(), deployHooks(), UNIVERSAL_RULES
- `src/rules/general/file-naming.rule.ts` -- createRule pattern reference
- `.claude/settings.json` -- project-level hook config
- `~/.claude/settings.json` -- global hook config (read via bash)
- `~/.claude/hooks/context-monitor.sh` -- actual deployed wrapper content

## Metadata

**Confidence breakdown:**

- Fix 1 (path resolution): HIGH -- read actual source code, deployed files, and traced execution path. Confirmed the bug AND identified that the proposed fix is wrong.
- Fix 2 (hookSpecificOutput): HIGH -- verified through grep of all hook scripts and understanding of per-event output schemas.
- Fix 3 (generated-file-guard rule): HIGH -- audited all 15 existing rules, confirmed no overlap.
- Fix 4 (MuninnDB recall hook): HIGH -- read all relevant source files (hook-io, muninn, vault, user-prompt-submit, hook-registry, deploy-global). Identified sync/async caveat and global deploy gap.

**Research date:** 2026-03-15
**Valid until:** 2026-04-15 (stable infrastructure, low churn rate)
