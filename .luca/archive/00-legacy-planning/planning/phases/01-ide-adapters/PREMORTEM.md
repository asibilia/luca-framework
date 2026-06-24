# Pre-Mortem Risk Brief — Phase 1: IDE Adapters

**Phase:** 1 — IDE Adapters (Cursor, Windsurf, VS Code)
**Complexity:** MODERATE
**Appetite:** Medium (100K tokens, 50% context)

## Critical Risks

### 1. Silent String-Transform Corruption in Rule Compilation

Each adapter reinterprets `BaseRule.config.frontmatter` fields into IDE-specific formats, but `toClaudeFormat()` returns pre-baked Claude markdown. If adapters call `toClaudeFormat()` and re-parse, output can contain duplicate or contradictory frontmatter.

**Mitigation:** Each adapter MUST read from `rule.config.frontmatter` and `rule.config.sections` directly, never calling or re-parsing `toClaudeFormat()`. Add JSDoc warning on emitter functions.

### 2. Windsurf Character Budget Silently Truncates Mid-Section

`enforceCharacterBudget()` is brand new. Naive `content.slice(0, maxChars)` cuts mid-sentence or mid-YAML, producing invalid rule files that Windsurf rejects silently.

**Mitigation:** Truncate at section boundaries (split on `## ` headings), dropping lowest-priority sections first. Populate `EmitResult.warnings` when truncation occurs.

### 3. VS Code Tool Name Translation Map Incomplete or Stale

E03 hardcodes a `Record<string, string>` mapping Claude tool names to VS Code equivalents. Unmapped tools silently produce broken hook matchers.

**Mitigation:** Define exhaustive const map in `src/adapters/vscode/` with a `translateToolName()` function that warns on unmapped tools via `EmitResult.warnings`.

## Plan Constraints

1. Adapters MUST NOT call `toClaudeFormat()`. Compile from `entity.config.sections` and `entity.config.frontmatter` directly.
2. `enforceCharacterBudget()` must truncate at section boundaries, not raw character offsets.
3. VS Code tool name translation map must be validated at emit-time. Unmapped tools produce warnings, not silent drops.
