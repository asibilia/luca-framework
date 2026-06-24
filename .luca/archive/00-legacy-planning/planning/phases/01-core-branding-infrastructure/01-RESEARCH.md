# Phase 1: Core Branding Infrastructure - Research

**Researched:** 2026-03-18
**Domain:** TypeScript utility authoring — Bun file I/O, branding config
**Confidence:** HIGH

## Summary

Phase 1 adds two utilities to an already well-patterned codebase. `branding.ts` already exports `defaultBranding`, `mergeBranding()`, `validateBranding()`, and `createBrandingContext()`. The new `readProjectBranding()` function is a thin async reader that follows the established `Bun.file() → safeSanitizeJsonParse() → mergeBranding()` pattern used in `vault-setup.ts` and `files.ts`.

`alias-skill.ts` is a new file in the same `utils/` directory. It uses `Bun.file()` / `Bun.write()` for all I/O and `node:fs/promises` (`readdir`, `mkdir`, `rm`) for directory operations — the same split used in `luca-home.ts` and `files.ts`. No new dependencies are required.

**Primary recommendation:** Follow the `vault-setup.ts` config-read pattern exactly: `Bun.file().exists()` guard, `safeSanitizeJsonParse()` for safe JSON parsing, graceful fallback to `defaultBranding` on any error.

## Standard Stack

### Core (already in package — no installs needed)

| API                                         | Purpose                                        | Source                   |
| ------------------------------------------- | ---------------------------------------------- | ------------------------ |
| `Bun.file(path).exists()`                   | Existence check before read                    | Bun built-in             |
| `Bun.file(path).text()`                     | Read file as string                            | Bun built-in             |
| `Bun.write(path, content)`                  | Write file                                     | Bun built-in             |
| `node:fs/promises` `readdir`, `mkdir`, `rm` | Directory operations                           | Node compat layer        |
| `pathe` `join`                              | Path joining (already imported in other utils) | Existing dep             |
| `safeSanitizeJsonParse()`                   | Safe JSON parse + prototype pollution guard    | `./sanitize`             |
| `mergeBranding()`                           | Merge partial config with defaults             | `./branding` (same file) |
| `defaultBranding`                           | Fallback value                                 | `./branding` (same file) |

No new `bun add` calls needed.

## Architecture Patterns

### Recommended Project Structure

```
packages/luca-framework/src/utils/
├── branding.ts          # MODIFY: add readProjectBranding()
├── alias-skill.ts       # NEW: createAliasSkill() + cleanupStaleAlias()
└── sanitize.ts          # Existing: safeSanitizeJsonParse() lives here
```

### Pattern 1: Graceful Config Reading (vault-setup.ts lines 259-266)

**What:** Read a JSON file with Bun.file(), parse safely, fall back silently on any error.
**When to use:** Any async reader that must never throw.

```typescript
// Source: packages/luca-framework/src/utils/vault-setup.ts:259-266
const file = Bun.file(configPath);
if (await file.exists()) {
  try {
    config = sanitizeJsonParse(await file.text()) as Record<string, unknown>;
  } catch {
    // Corrupted JSON — use defaults
  }
}
```

For `readProjectBranding()`, use `safeSanitizeJsonParse()` (the non-throwing variant from `sanitize.ts`) instead of the bare `sanitizeJsonParse` + try/catch, since that is the cleaner pattern for graceful degradation:

```typescript
// Pattern to use in readProjectBranding()
const file = Bun.file(join(projectDir, ".planning", "config.json"));
if (!(await file.exists())) return defaultBranding;
const result = safeSanitizeJsonParse(await file.text());
if (!result.success) return defaultBranding;
const raw = result.data as Record<string, unknown>;
return mergeBranding((raw.branding ?? {}) as Partial<BrandingConfig>);
```

### Pattern 2: Directory Scan for Cleanup (files.ts line 324)

**What:** Use `node:fs/promises` `readdir` to list entries, then check each with `Bun.file`.

```typescript
// Source: packages/luca-framework/src/utils/files.ts:324
const hookFiles = await readdir(hookScriptsDir);
```

`cleanupStaleAlias()` scans `.claude/skills/*/SKILL.md` for the marker, uses `readdir` to get skill dir entries, then `Bun.file().text()` to check content.

### Pattern 3: Mkdir + Bun.write (luca-home.ts + vault-setup.ts)

**What:** Create parent directory then write file.

```typescript
// Source: packages/luca-framework/src/utils/luca-home.ts:109
await mkdir(dir, { recursive: true });
// Then:
await Bun.write(path, content);
```

### Anti-Patterns to Avoid

- **Don't use `node:fs` `readFile`** — all existing utils use `Bun.file().text()` for reads
- **Don't throw from readProjectBranding** — must return `defaultBranding` on all error paths
- **Don't use JSON.parse directly** — always use `safeSanitizeJsonParse` to prevent prototype pollution

## Don't Hand-Roll

| Problem                              | Don't Build                   | Use Instead                                 |
| ------------------------------------ | ----------------------------- | ------------------------------------------- |
| JSON parse with error handling       | Custom try/catch + JSON.parse | `safeSanitizeJsonParse()` from `./sanitize` |
| Merge partial branding with defaults | Spread operator manually      | `mergeBranding()` from `./branding`         |
| Path joining                         | String concatenation          | `join()` from `pathe`                       |

## Common Pitfalls

### Pitfall 1: Forgetting the `exists()` guard

**What goes wrong:** `Bun.file(path).text()` on a missing file throws an unhandled rejection.
**How to avoid:** Always `await file.exists()` before `.text()` in graceful-degradation functions.
**Warning signs:** Missing guard when config file may not yet exist (new project).

### Pitfall 2: Passing `undefined` to `mergeBranding`

**What goes wrong:** `raw.branding` may be `undefined` if the config has no branding section.
**How to avoid:** Use `(raw.branding ?? {}) as Partial<BrandingConfig>` — matches the existing pattern in `loadConfigFromFile` (`wizard.ts:352`).

### Pitfall 3: Scanning `.claude/skills/` when it doesn't exist

**What goes wrong:** `readdir` throws `ENOENT`.
**How to avoid:** Check `Bun.file(skillsDir).exists()` — or wrap in try/catch that returns early. The directory only exists after first install, so `cleanupStaleAlias()` must tolerate absence.

### Pitfall 4: Removing the currently-valid alias

**What goes wrong:** `cleanupStaleAlias(newPrefix)` removes the directory for `newPrefix` itself.
**How to avoid:** Skip directories where the dir name equals `newPrefix`.

## Code Examples

### readProjectBranding() — complete implementation sketch

```typescript
// Source pattern: vault-setup.ts:259-266, wizard.ts:348-353
export async function readProjectBranding(
  projectDir: string = process.cwd(),
): Promise<BrandingConfig> {
  const configPath = join(projectDir, ".planning", "config.json");
  const file = Bun.file(configPath);
  if (!(await file.exists())) return defaultBranding;
  const result = safeSanitizeJsonParse(await file.text());
  if (!result.success) return defaultBranding;
  const raw = result.data as Record<string, unknown>;
  return mergeBranding((raw.branding ?? {}) as Partial<BrandingConfig>);
}
```

### createAliasSkill() — SKILL.md content

```
<!-- luca-alias: auto-generated -->
# /{prefix}

{frameworkName} entry point — delegates to the canonical /lu skill.

## main

Invoke the canonical lu skill with all arguments passed through:

Skill(skill: "lu", args: "$ARGS")
```

### cleanupStaleAlias() — directory scan sketch

```typescript
// Source pattern: files.ts:324 + luca-home.ts:107-109
import { readdir, rm } from "node:fs/promises";
const skillsDir = join(projectDir, ".claude", "skills");
const file = Bun.file(skillsDir);
if (!(await file.exists())) return;
const entries = await readdir(skillsDir);
for (const entry of entries) {
  if (entry === newPrefix) continue;
  const skillMd = join(skillsDir, entry, "SKILL.md");
  const f = Bun.file(skillMd);
  if (!(await f.exists())) continue;
  const content = await f.text();
  if (content.startsWith("<!-- luca-alias: auto-generated -->")) {
    await rm(join(skillsDir, entry), { recursive: true, force: true });
  }
}
```

## Open Questions

1. **Bun.file on a directory path** — `Bun.file(dir).exists()` returns false for directories. Use `existsSync` from `node:fs` or try `readdir` wrapped in try/catch for the skills-dir existence check. Low risk since `files.ts` already imports `readdir` from `node:fs/promises`.

## Sources

### Primary (HIGH confidence)

- `packages/luca-framework/src/utils/branding.ts` — existing exports, `mergeBranding()`, `defaultBranding`
- `packages/luca-framework/src/utils/sanitize.ts` — `safeSanitizeJsonParse()` API
- `packages/luca-framework/src/utils/vault-setup.ts:259-276` — canonical Bun.file + config-read pattern
- `packages/luca-framework/src/utils/luca-home.ts` — mkdir + Bun.write pattern
- `packages/luca-framework/src/utils/files.ts:324` — readdir pattern
- `packages/luca-framework/src/types.ts` — `BrandingConfig` interface (4 fields)
- `.planning/phases/01-core-branding-infrastructure/01-CONTEXT.md` — locked decisions

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all APIs are already used in this package
- Architecture: HIGH — patterns are directly copied from existing files
- Pitfalls: HIGH — derived from reading actual implementations

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (stable internal codebase)
