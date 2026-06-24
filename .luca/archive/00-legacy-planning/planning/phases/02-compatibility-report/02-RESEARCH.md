# Phase 2: Compatibility Report CLI Integration - Research

**Researched:** 2026-03-25
**Domain:** Adapter compatibility validation and reporting
**Confidence:** HIGH

## Summary

Phase 2 requires creating a structured compatibility reporting system for compiled adapter output. The core work involves:

1. Creating Zod schemas for feature mappings and compatibility reports
2. Implementing three per-adapter validators that inspect EmitResult file paths and check IDE-specific constraints
3. Providing an aggregation utility for combining reports

CONTEXT.md explicitly defers CLI/build pipeline integration to future work. This phase is schema + validator creation only.

**Primary recommendation:** Follow the existing adapter helper pattern (standalone functions, not interface methods). All validators consume `EmitResult` from the adapter's `emit()` method.

## Standard Stack

### Core Libraries

| Library    | Version  | Purpose                              | Why Standard                                |
| ---------- | -------- | ------------------------------------ | ------------------------------------------- |
| Zod        | 3.x      | Schema validation and type inference | Single source of truth for report structure |
| Bun.file() | Built-in | Async file reading                   | Non-blocking, error-tolerant file access    |

### Key Patterns

| Pattern                    | Purpose                                                      | Location                                            |
| -------------------------- | ------------------------------------------------------------ | --------------------------------------------------- |
| Standalone validators      | Validate compiled output without modifying Adapter interface | `src/adapters/__helpers/compatibility-validator.ts` |
| Categorized file analysis  | Group files by feature (rules, skills, hooks, agents)        | Internal to each validator                          |
| Per-feature FeatureMapping | Report status per feature with degradation tracking          | CompatibilityReport schema                          |

## Architecture Patterns

### 1. Validator Signature Pattern

All validators follow the same signature:

```typescript
export async function validateXOutput(
  emitResult: EmitResult,
): Promise<CompatibilityReport>;
```

Each validator:

- Takes the `EmitResult` from an adapter's `emit()` call
- Reads file content via `Bun.file()` for each file path
- Categorizes files into: rules, skills, hooks, agents, other
- Applies IDE-specific constraints (character limits, required frontmatter, etc.)
- Returns a fully populated `CompatibilityReport`

### 2. File Categorization Helper

All three validators need to categorize file paths by feature type. Create an internal helper:

```typescript
type CategorizedFiles = {
  rules: string[];
  skills: string[];
  hooks: string[];
  agents: string[];
  other: string[];
};

function categorizeFiles(filePaths: string[]): CategorizedFiles;
```

This categorizes by path segment inspection (e.g., `/rules/`, `/skills/`, etc.).

### 3. Constraint Constants

Each validator has IDE-specific limits:

- **Windsurf workspace rule:** 12,000 char limit
- **Windsurf global rules:** 6,000 char total limit
- **Windsurf workflows:** 12,000 char limit
- **VS Code agents:** 30,000 char limit
- **Cursor:** No documented character limits

### 4. Frontmatter Extraction Pattern

Validators need to parse YAML frontmatter from markdown files. Lightweight helper (not full YAML parser):

```typescript
function extractFrontmatter(content: string): Record<string, string> | null {
  // Extract key: value lines from --- ... --- block
}
```

Used for:

- Cursor: Check `.mdc` files have `description` field
- Windsurf: Check workspace rules have `trigger` field with valid values
- VS Code: Check agent/skill files have `name`, `description` fields

## Don't Hand-Roll

| Problem             | Don't Build                | Use Instead                                    | Why                                                          |
| ------------------- | -------------------------- | ---------------------------------------------- | ------------------------------------------------------------ |
| YAML parsing        | Full yaml parser           | Simple line-based extraction                   | Frontmatter is always simple key:value, full parser overkill |
| File categorization | Custom matching logic      | Path segment inspection with lowercase compare | Safe, deterministic, no external deps                        |
| Report aggregation  | Manual object construction | `aggregateReports()` utility function          | Single place to ensure timestamp consistency                 |

## Common Pitfalls

### Pitfall 1: Async File Reading Without Error Handling

**What goes wrong:** `await Bun.file(path).text()` throws if file missing
**Why it happens:** Tempting to assume all files in EmitResult.filesPaths exist
**How to avoid:** Wrap in try/catch, return empty string on failure. Validators should degrade gracefully.
**Warning signs:** Validator throws instead of returning a report with degraded counts

### Pitfall 2: Hardcoding Feature Names Across Validators

**What goes wrong:** Three validators all define "rules", "skills", "hooks", "agents" — drift when one changes
**Why it happens:** Each validator independently categorizes files
**How to avoid:** Define `CategorizedFiles` type once, reuse in all three validators
**Warning signs:** Updating one validator's feature list requires checking all three

### Pitfall 3: Not Validating Against Schema

**What goes wrong:** Building CompatibilityReport manually without schema validation
**Why it happens:** Tempting to skip validation for "known good" data
**How to avoid:** Use `safeParse()` internally before returning (or assert parse is valid)
**Warning signs:** Type mismatch between what validator builds and what schema expects

### Pitfall 4: EmitResult.warnings Dropped

**What goes wrong:** Validator creates CompatibilityReport but doesn't include EmitResult.warnings
**Why it happens:** Focusing on file-level checks, forgetting result-level warnings
**How to avoid:** After per-feature validation, merge EmitResult.warnings into the appropriate feature
**Warning signs:** Adapter emit() warnings never appear in report

## Code Examples

### File Categorization (Reusable Pattern)

```typescript
// Source: validator implementation
function categorizeFiles(filePaths: string[]): CategorizedFiles {
  const categories: CategorizedFiles = {
    rules: [],
    skills: [],
    hooks: [],
    agents: [],
    other: [],
  };

  for (const filePath of filePaths) {
    const lower = filePath.toLowerCase();
    if (lower.includes("/rules/") || lower.endsWith(".mdc")) {
      categories.rules.push(filePath);
    } else if (lower.includes("/skills/") || lower.includes("skill.md")) {
      categories.skills.push(filePath);
    } else if (lower.includes("/hooks/") || lower.includes("hooks.json")) {
      categories.hooks.push(filePath);
    } else if (lower.includes("/agents/") || lower.endsWith(".agent.md")) {
      categories.agents.push(filePath);
    } else {
      categories.other.push(filePath);
    }
  }

  return categories;
}
```

### Constraint Checking Pattern

```typescript
// Windsurf rule character limit check
if (content.length > WINDSURF_WORKSPACE_RULE_CHAR_LIMIT) {
  warnings.push(
    `Rule file exceeds 12000 char limit (${content.length} chars): ${filePath}`,
  );
  degradedCount++;
}
```

### Feature Mapping Resolution

```typescript
// Determine final feature status from counts
function resolveStatus(
  itemCount: number,
  degradedCount: number,
  isSupported: boolean,
): FeatureMappingStatus {
  if (!isSupported) return "unsupported";
  if (degradedCount > 0) return "partially_mapped";
  return "fully_mapped";
}
```

## State of the Art

Current Luca patterns relevant to this work:

| Aspect                  | Current Pattern                | Location                        |
| ----------------------- | ------------------------------ | ------------------------------- |
| Standalone validators   | Already used for other domains | src/adapters/\_\_helpers/       |
| Schema-first validation | Established pattern            | src/\*/\_\_schemas/ + safeParse |
| Async file operations   | Bun.file() consistently        | Throughout codebase             |

## Open Questions

None. Context.md explicitly defers CLI/build wiring. This phase is purely schema + validators.

## Sources

### Primary (HIGH confidence)

- `src/adapters/__schemas/adapter.schemas.ts` — EmitResult structure definition
- `src/adapters/__helpers/adapter-registry.ts` — Adapter registration and retrieval pattern
- `.planning/phases/02-compatibility-report/02-CONTEXT.md` — Phase decisions and scope boundaries
- `.planning/phases/02-compatibility-report/PLAN.md` — Full specification for Phase 2

### Secondary (MEDIUM confidence)

- `scripts/check-domain-boundaries.ts` — Pattern for iterating source domains (similar file cataloging)
- Project rule: `schema-first-parsing.md` — Zod usage conventions
- Project rule: `api-snake-case.md` — API payload property naming (applied to schemas)

## Metadata

**Confidence breakdown:**

- Validator signatures: HIGH — EmitResult type is defined, signature matches pattern
- Constraint values: HIGH — Windsurf/VS Code constraints come from official documentation in code
- Schema structure: HIGH — Specification is explicit in PLAN.md
- File categorization approach: HIGH — Path segment inspection is deterministic and used elsewhere

**Research date:** 2026-03-25
**Valid until:** Stable (no breaking changes expected to EmitResult or validator signatures)
