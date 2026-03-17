# Phase 191 — Compiler EJS Output: Context

## Decision Summary

### 1. Template format strategy [researched]

**Decision:** Keep compiler internals unchanged. Add a post-compile template transform layer that wraps compiler output and applies branding transforms.

**Rationale:** The existing `compileAgentClaude()`, `compileSkillClaude()`, `compileRuleClaude()` functions produce correct markdown. The branding tokens (lu-, Luca, /lu) are a thin layer on top. Rather than modifying every entity's `toClaudeFormat()` method (high risk, many files), we reuse the battle-tested transform logic from `copy-harness-templates.ts` and move it into the compiler domain.

**Implementation:** Create `src/compilers/__helpers/template-transform.ts` that exports:

- `transformOutputsToTemplates(outputs: Map<string, string>): Map<string, string>` — applies branding transforms to both paths (filenames) and content
- Reuses the existing `transformBrandingContent()`, `transformBrandingFilename()`, `transformBrandingDirname()` logic from `scripts/copy-harness-templates.ts`
- The transform functions MOVE from `scripts/` into `src/compilers/__helpers/` (proper domain placement, T3 Build tier)

**NOT doing:** Adding a new `SupportedFormat: "TEMPLATE"` — the template mode is a post-compile transform, not a compilation format.

### 2. Branding token set [researched]

**Decision:** Use the complete set already defined in `copy-harness-templates.ts`. No new tokens needed.

**Tokens:**
| Token | Pattern | EJS Tag |
|-------|---------|---------|
| Command prefix | `lu-{name}` | `<%= branding.commandPrefix %>-{name}` |
| Skill dir | `skills/lu/` | `skills/<%= branding.commandPrefix %>/` |
| Slash command | `/lu` | `/<%= branding.commandSlash %>` |
| Framework name | `Luca` | `<%= branding.frameworkName %>` |
| Dir path | `.claude/luca/` | `.claude/<%= branding.nameLowercase %>/` |

**Filename tokens:**
| Pattern | Template |
|---------|----------|
| `lu-router.md` | `__branding.commandPrefix__-router.md` |
| `lu/` (dir) | `__branding.commandPrefix__/` |

### 3. Scope of transform [researched]

**Decision:** Transform agents and skills only (same as current `brandedDirs` in copy-harness-templates.ts). Rules, hooks, and settings.json are copied raw.

**Rationale:** Rules don't reference lu- branding. Hooks are shell wrappers named by function (post-edit-format, pre-commit-gate), not brand. Settings.json has hook paths that don't need branding. This matches the existing behavior.

### 4. Exclusion list [researched]

**Decision:** Keep the existing `CONTENT_EXCLUSIONS` array and `SOURCE_FILE_PATTERN` regex. These protect strings like `luca-framework`, `luca-bridge`, `luca-state`, etc. from being transformed.

**No changes needed** — the exclusion list is already correct and battle-tested.

## Deferred

- Build pipeline split (Phase 192) — this phase only creates the transform module
- Wiring to build:compile (Phase 192) — this phase validates the transform produces correct output
- Removing copy-harness-templates.ts (Phase 194) — the transform functions move, then the script is removed

## Scope Guardrail

This phase ONLY:

1. Creates `src/compilers/__helpers/template-transform.ts` with the transform functions
2. Exports `transformOutputsToTemplates()` from `src/compilers/index.ts`
3. Validates the transform produces output identical to `copy-harness-templates.ts`

It does NOT modify build-all.ts, build-shared.ts, or any build scripts.
