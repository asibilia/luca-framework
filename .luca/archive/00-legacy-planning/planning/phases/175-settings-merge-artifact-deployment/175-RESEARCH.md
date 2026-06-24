# Phase 175: Settings Merge & Artifact Deployment - Research

**Researched:** 2026-03-16
**Domain:** Settings.json merge algorithm, file deployment, manifest tracking
**Confidence:** HIGH

## Summary

Phase 175 implements surgical settings.json merging and artifact deployment to `~/.claude/`. The existing `scripts/deploy-global.ts` already has a working implementation (938 lines) that performs all the core operations: deploying agents, skills, hooks, rules, statusline, merging settings.json, and writing a manifest. However, it has several deficiencies that Phase 175 must address:

1. **No backup before modifying settings.json** -- the current mergeSettings() overwrites without backup
2. **Crude hook identification** -- uses a hardcoded `lucaScripts` list instead of the composite key (event+matcher) approach decided in CONTEXT.md
3. **No conflict prompting** -- replaces all Luca hooks silently, no three-tier merge
4. **Primitive manifest** -- only tracks counts, not per-file hashes
5. **No backup rotation** -- no backup mechanism exists at all

The `packages/luca-framework/src/utils/manifest.ts` already has a robust manifest system with `hashFile()`, `createManifest()`, `compareFiles()` -- this should be reused for the deploy manifest rather than reinventing.

**Primary recommendation:** Refactor deploy-global.ts into a modular library of functions (settings-merger, artifact-deployer, backup-manager, deploy-manifest) that can be called both from the CLI script and from `luca init` / `luca update` commands.

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library        | Version  | Purpose                                 | Why Standard                                 |
| -------------- | -------- | --------------------------------------- | -------------------------------------------- |
| node:fs        | built-in | File operations (sync)                  | deploy-global.ts already uses it             |
| node:crypto    | built-in | SHA-256 hashing                         | manifest.ts already uses createHash          |
| pathe          | ^2.x     | Path manipulation                       | Already used in luca-home.ts, cross-platform |
| @clack/prompts | ^1.0.0   | Interactive conflict prompts            | Already in package.json, used by init.ts     |
| zod            | ^3.x     | Schema validation for manifest/settings | Project standard                             |

### Supporting

| Library          | Version  | Purpose                               | When to Use                          |
| ---------------- | -------- | ------------------------------------- | ------------------------------------ |
| citty            | ^0.2.0   | CLI command framework                 | If exposing as `luca deploy` command |
| lodash/orderBy   | existing | Sorting backup files by date          | Backup rotation                      |
| lodash/cloneDeep | existing | Deep cloning settings before mutation | Settings merge safety                |

### Alternatives Considered

| Instead of        | Could Use          | Tradeoff                                                                                    |
| ----------------- | ------------------ | ------------------------------------------------------------------------------------------- |
| node:fs (sync)    | Bun.file           | Bun.file is async, deploy-global.ts uses sync fs -- keep sync for consistency within script |
| Manual JSON merge | deep-merge library | Overkill -- settings.json merge is shallow at top keys, deep only in hooks[]                |

**Installation:**

```bash
# No new dependencies needed -- everything is already in the monorepo
```

## Architecture Patterns

### Recommended Project Structure

```
packages/luca-framework/src/
├── utils/
│   ├── luca-home.ts          # ~/.luca/ paths (EXISTS)
│   ├── manifest.ts           # Hash/compare utilities (EXISTS)
│   └── settings-merge.ts     # NEW: Settings.json merge algorithm
scripts/
├── deploy-global.ts          # REFACTOR: Use new merge/deploy modules
```

### Pattern 1: Composite Key Hook Identification

**What:** Identify hooks by `event + matcher` composite key, then compare individual hooks by `command` field within a slot.
**When to use:** Every settings.json merge operation.
**Example:**

```typescript
// Source: CONTEXT.md decision + existing settings.json structure analysis

/**
 * A "slot" is identified by the composite key: event name + matcher value.
 * Within a slot, individual hooks are identified by their command string.
 */
type HookSlotKey = string; // Format: "PostToolUse:Edit|Write" or "Stop:" (no matcher)

function buildSlotKey(event: string, matcher?: string): HookSlotKey {
  return `${event}:${matcher ?? ""}`;
}

function parseExistingSettings(
  settings: Record<string, unknown>,
): Map<HookSlotKey, HookEntry[]> {
  const slots = new Map<HookSlotKey, HookEntry[]>();
  const hooks = (settings.hooks ?? {}) as Record<
    string,
    Array<{ matcher?: string; hooks: HookEntry[] }>
  >;

  for (const [event, entries] of Object.entries(hooks)) {
    for (const entry of entries) {
      const key = buildSlotKey(event, entry.matcher);
      slots.set(key, entry.hooks ?? []);
    }
  }
  return slots;
}
```

### Pattern 2: Three-Tier Merge Strategy

**What:** Auto-merge new slots, auto-skip identical hooks, prompt for conflicts.
**When to use:** When Luca hooks need to be added to existing settings.json.
**Example:**

```typescript
// The three outcomes:
type MergeAction =
  | { type: "auto-merge"; reason: "new-slot" } // Slot doesn't exist -> add silently
  | { type: "auto-skip"; reason: "identical" } // Same command already in slot -> skip
  | { type: "conflict"; existing: HookEntry; proposed: HookEntry }; // Same slot, different command

// Non-interactive fallback (CI/piped stdin): default to "keep-both"
const isInteractive = process.stdin.isTTY !== false;
```

### Pattern 3: Backup-First Mutation

**What:** Always create a timestamped backup of settings.json before any modification.
**When to use:** Before every settings.json write.
**Example:**

```typescript
// Source: luca-home.ts paths + CONTEXT.md decision

async function backupSettings(
  settingsPath: string,
  backupsDir: string,
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(backupsDir, `settings-${timestamp}.json`);

  if (existsSync(settingsPath)) {
    const content = readFileSync(settingsPath, "utf-8");
    mkdirSync(backupsDir, { recursive: true });
    writeFileSync(backupPath, content);
  }

  // Rotate: keep only last 5
  await rotateBackups(backupsDir, 5);
  return backupPath;
}
```

### Anti-Patterns to Avoid

- **Overwriting settings.json without backup:** Always backup first. Corruption breaks all Claude Code hooks.
- **Hardcoding Luca script names for identification:** Use the canonical hook registry as the source of truth, not a manual list.
- **Mutating settings in place:** Always cloneDeep the settings object before modification, write atomically.
- **Silent conflict resolution:** When same slot has different commands, user must be prompted (or default to "keep-both" in CI).

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem                         | Don't Build                   | Use Instead                                                            | Why                                               |
| ------------------------------- | ----------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------- |
| File hashing                    | Custom hash function          | `hashFile()` from `manifest.ts`                                        | Already tested, uses SHA-256                      |
| Home directory resolution       | Manual `$HOME` reading        | `getLucaHomePaths()` from `luca-home.ts`                               | Zod-validated paths, handles edge cases           |
| Hook registry enumeration       | Hardcoded script name list    | `resolveCanonicalRegistry()` from `hook-registry.ts`                   | Single source of truth for all hooks              |
| Settings.json config generation | Manual hook JSON construction | `generateClaudeHooksConfigFromCanonical()` from `config-generators.ts` | Already handles event grouping, matcher alignment |
| Interactive prompts             | Raw readline                  | `@clack/prompts`                                                       | Already in package.json, used by init.ts          |
| Version resolution              | Hardcoded strings             | `LUCA_VERSION` from `manifest.ts`                                      | Build-time injection with dev fallback            |

**Key insight:** The hook-registry + config-generators pipeline already knows how to produce the exact JSON structure that settings.json expects. The merge algorithm should use this to generate the "proposed" Luca hooks, then diff against the "existing" hooks in settings.json.

## Common Pitfalls

### Pitfall 1: JSON Serialization Destroys Ordering

**What goes wrong:** JSON.stringify does not guarantee key order. User's carefully ordered settings.json gets shuffled.
**Why it happens:** Object key order in JavaScript is insertion-ordered but JSON.stringify may output differently.
**How to avoid:** Read the original file content, parse it, merge, then write with `JSON.stringify(settings, null, 2)`. Accept that order may change. Document this in the deploy log.
**Warning signs:** User complaints about settings.json diff noise.

### Pitfall 2: Quoted vs Unquoted Command Paths

**What goes wrong:** deploy-global.ts wraps commands in escaped quotes (`\"path\"`) while the monorepo settings.json uses `$CLAUDE_PROJECT_DIR` unquoted references. Comparing these string values for equality fails.
**Why it happens:** Global deploy uses absolute paths with quotes; local repo uses `$CLAUDE_PROJECT_DIR` references.
**How to avoid:** When identifying Luca hooks for merge, extract the script filename from the command string (the last path segment before .sh) rather than comparing full command strings. Use a normalization function.
**Warning signs:** Hooks being duplicated on re-deploy because command comparison fails.

### Pitfall 3: Non-Luca Hooks Get Clobbered

**What goes wrong:** A user has custom hooks (e.g., `cleanup-processes.sh`) in the same event slot, and the merge replaces the entire slot.
**Why it happens:** The current deploy-global.ts filters by Luca script names but a naive approach might replace the whole event array.
**How to avoid:** The three-tier merge must operate at the individual hook level within a slot, not at the slot level. Preserve any hook whose command does not match a known Luca script.
**Warning signs:** Users losing their custom hooks after running deploy.

### Pitfall 4: Backup Rotation Race Condition

**What goes wrong:** Multiple rapid deploys create more than 5 backups before rotation runs.
**Why it happens:** Rotation reads directory, sorts, deletes -- not atomic.
**How to avoid:** This is acceptable. Rotation is a best-effort cleanup. If 6-7 backups exist briefly, no harm done. Use readdir + sort by filename (ISO timestamp sorts lexically) + unlink oldest.
**Warning signs:** Not a real problem; the "last 5" is a guideline, not a hard constraint.

### Pitfall 5: Settings.json Parse Failure

**What goes wrong:** User's settings.json has trailing commas, comments, or is corrupted. `JSON.parse()` throws.
**Why it happens:** Manual editing, IDE auto-save issues, partial writes.
**How to avoid:** Wrap in try/catch, offer to back up the corrupted file and start fresh, or abort with instructions. Never silently overwrite a file we couldn't parse.
**Warning signs:** Errors during merge step.

### Pitfall 6: SessionStart Hooks Have Special Structure

**What goes wrong:** SessionStart has both a no-matcher entry (session-start.sh) and a matcher entry (`"compact"` for session-compact-restore.sh). These are different slots but share the same event.
**Why it happens:** The settings.json structure allows multiple entries per event, each with optional matcher.
**How to avoid:** The composite key approach (event+matcher) naturally handles this -- `"SessionStart:"` and `"SessionStart:compact"` are distinct slots.
**Warning signs:** compact-restore hook getting lost or duplicated.

## Code Examples

Verified patterns from the codebase:

### Settings.json Hook Structure (from ~/.claude/settings.json)

```json
// Source: ~/.claude/settings.json (actual production file)
{
  "hooks": {
    "SessionStart": [
      {
        // Slot key: "SessionStart:" (no matcher)
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/cleanup-processes.sh --startup",
            "timeout": 10
          },
          {
            "type": "command",
            "command": "\"/path/to/session-start.sh\"",
            "timeout": 15,
            "statusMessage": "..."
          }
        ]
      },
      {
        // Slot key: "SessionStart:compact"
        "matcher": "compact",
        "hooks": [
          {
            "type": "command",
            "command": "\"/path/to/session-compact-restore.sh\"",
            "timeout": 10
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        // Slot key: "PostToolUse:Edit|Write"
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "\"/path/to/post-edit-format.sh\"",
            "timeout": 10
          },
          {
            "type": "command",
            "command": "\"/path/to/post-edit-typecheck.sh\"",
            "timeout": 30,
            "async": true
          }
        ]
      },
      {
        // Slot key: "PostToolUse:" (no matcher)
        "hooks": [
          {
            "type": "command",
            "command": "\"/path/to/context-check-throttled.sh\"",
            "timeout": 10,
            "async": true
          }
        ]
      }
    ]
  }
}
```

### Generating Luca Hook Config from Canonical Registry

```typescript
// Source: src/hooks/__helpers/config-generators.ts (existing code)
import { resolveCanonicalRegistry } from "./hook-registry";
import { generateClaudeHooksConfigFromCanonical } from "./config-generators";

const registry = resolveCanonicalRegistry();
const lucaHooks = generateClaudeHooksConfigFromCanonical(registry, {
  commandPrefix: `"${globalHooksDir}"`,
  scriptExtension: ".sh",
});
// lucaHooks is a Record<string, Array<{ matcher?: string; hooks: HookEntry[] }>>
```

### Backup and Rotate Pattern

```typescript
// Source: luca-home.ts paths schema
import { getLucaHomePaths } from "../utils/luca-home";

const paths = getLucaHomePaths();
// paths.backups = "/Users/you/.luca/backups"
// Backup to: /Users/you/.luca/backups/settings-2026-03-16T12-00-00-000Z.json
```

### Existing Manifest with Hashing

```typescript
// Source: packages/luca-framework/src/utils/manifest.ts (existing code)
import { hashFile, LUCA_VERSION } from "../utils/manifest";

const hash = await hashFile("/path/to/agent.md");
// Returns: "a1b2c3..." (SHA-256 hex)
```

## State of the Art

| Old Approach                                 | Current Approach                                 | When Changed       | Impact                                                   |
| -------------------------------------------- | ------------------------------------------------ | ------------------ | -------------------------------------------------------- |
| Hardcoded lucaScripts[] list                 | Canonical hook registry                          | Phase 174          | Registry is source of truth for hook enumeration         |
| `$(dirname "$0")/../../` relative paths      | `$LUCA_PACKAGE_ROOT` env var + relative fallback | Phase 174          | Shell wrappers work in both global and monorepo contexts |
| Symlink mode (default)                       | Copy mode (for npm global)                       | Phase 175 decision | Copy is mandatory for npm global install                 |
| `.luca-deploy-manifest.json` in `~/.claude/` | `~/.luca/manifests/deploy-manifest.json`         | Phase 175          | Proper location in Luca home directory                   |
| No backup                                    | `~/.luca/backups/settings-{timestamp}.json`      | Phase 175          | Safety net for settings.json corruption                  |
| Silent hook replacement                      | Three-tier merge with conflict prompts           | Phase 175          | User control over non-Luca hook preservation             |

**Deprecated/outdated:**

- `rewriteWrapperPaths()` in deploy-global.ts: Phase 174 made wrappers context-aware via `$LUCA_PACKAGE_ROOT`. This function is still present as a transition mechanism but new deploys should not need it.
- `.luca-deploy-manifest.json` path in `~/.claude/`: Should move to `~/.luca/manifests/deploy-manifest.json` per LucaHomePathsSchema.

## Open Questions

Things that couldn't be fully resolved:

1. **Should deploy-global.ts be split into a library + CLI, or refactored in place?**
   - What we know: The script is 938 lines and contains reusable logic (deployFile, deployDir, copyDirRecursive, mergeSettings) that could serve both `luca deploy` CLI and `luca init` flows.
   - What's unclear: Whether `luca init` should call deploy functions directly or remain a separate flow.
   - Recommendation: Extract the merge and deploy logic into importable functions in `packages/luca-framework/src/utils/`. Keep deploy-global.ts as the CLI entry point that calls those functions.

2. **How should `$LUCA_PACKAGE_ROOT` be set for npm global install?**
   - What we know: Phase 174 added the env var support to shell wrappers. Session-start hook could set it.
   - What's unclear: For `npm install -g luca-framework`, the installed location varies by system. The deploy script needs to determine and persist this path.
   - Recommendation: During deploy, write `LUCA_PACKAGE_ROOT` to `~/.luca/env` and have session-start source it. Or inject it into settings.json `env` section.

3. **Should the deploy manifest use the existing `LucaManifest` type or a new `DeployManifest` type?**
   - What we know: `LucaManifest` in types.ts is designed for per-project manifests (.planning/manifest.json). The deploy manifest at `~/.luca/manifests/` tracks global artifacts.
   - What's unclear: Whether the schemas are compatible enough to share.
   - Recommendation: Create a new `DeployManifestSchema` in a Zod schema (follows project conventions) that includes `settings_backup` path. The per-file hash pattern from `LucaManifest` can be reused.

## Sources

### Primary (HIGH confidence)

- `scripts/deploy-global.ts` -- Full existing deploy implementation (938 lines)
- `.claude/settings.json` -- Monorepo hook structure (the generated output)
- `~/.claude/settings.json` -- Real production global settings (includes non-Luca hooks)
- `src/hooks/__helpers/hook-registry.ts` -- Canonical hook registry (14 hooks)
- `src/hooks/__helpers/config-generators.ts` -- Settings.json config generation
- `src/hooks/__helpers/generate-shell-wrappers.ts` -- Phase 174 context-aware wrappers
- `packages/luca-framework/src/utils/luca-home.ts` -- ~/.luca/ path schema
- `packages/luca-framework/src/utils/manifest.ts` -- Hash and manifest utilities

### Secondary (MEDIUM confidence)

- `packages/luca-framework/src/commands/init.ts` -- CLI orchestrator pattern
- `.planning/phases/175-settings-merge-artifact-deployment/175-CONTEXT.md` -- User decisions

### Tertiary (LOW confidence)

- None. All findings are from direct codebase analysis.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH -- All libraries already in the monorepo, no new deps needed
- Architecture: HIGH -- Existing code provides clear patterns for merge, deploy, manifest
- Pitfalls: HIGH -- Derived from analysis of actual production settings.json with non-Luca hooks
- Settings structure: HIGH -- Read directly from both monorepo and global settings.json files

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 (stable domain, no external dependencies changing)
