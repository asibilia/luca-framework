# Coding Conventions

**Analysis Date:** 2026-02-04

## Naming Patterns

**Files:**
- kebab-case for all files (`lu-help.md`, `code-architect.md`, `taskmaster.mdc`)
- Test files: `.test.ts` or `.spec.ts` suffix with kebab-case base name (`user-service.test.ts`)
- Type definition files: `.d.ts` suffix with kebab-case (`global-types.d.ts`)
- Configuration files follow tool conventions when required (`next.config.js`), otherwise kebab-case

**Directories:**
- kebab-case for all directory names (`lu-codebase-mapper/`, `code-lint/`, `taskmaster/`)
- Domain-organized structure (`agents/`, `skills/`, `rules/`, `workflows/`)

**Luca Framework Commands:**
- `lu-` prefix for all Luca framework commands (`lu-help`, `lu-plan-phase`, `lu-execute-phase`)
- Kebab-case after prefix (`lu-map-codebase`, `lu-verify-work`, `lu-address-pr`)

**Agent Names:**
- Domain-focused names (`lu-planner`, `lu-executor`, `lu-verifier`)
- Specialized agents (`code-architect`, `dx-advocate`, `security-auditor`)
- Descriptive, action-oriented (`lu-codebase-mapper`, `lu-plan-checker`)

**Rule Files:**
- `.mdc` extension for Cursor rules (`file-naming.mdc`, `api-snake-case.mdc`)
- Descriptive names matching rule purpose (`no-classes.mdc`, `schema-first-parsing.mdc`)

**Variables & Functions:**
- camelCase for variables and functions (`projectName`, `getTasks`)
- No special prefix for async functions
- Descriptive names indicating purpose

**Types & Interfaces:**
- PascalCase for types and interfaces (`ComponentProps`, `TaskStatus`)
- No `I` prefix for interfaces
- Descriptive names matching domain concepts

**Constants:**
- SCREAMING_SNAKE_CASE for constants (`MAX_RETRIES`, `API_BASE_URL`)
- Object keys in constants use snake_case (matches API conventions)

## Documentation Conventions

**Frontmatter Pattern:**
All documentation files use YAML frontmatter delimited by `---`:

```yaml
---
description: Clear, one-line description
globs: path/to/files/*.ext
alwaysApply: true
---
```

**SKILL.md Format:**
Skills use structured frontmatter:

```yaml
---
name: skill-name
description: When to use this skill and what it does
---
```

Location: `.cursor/skills/{skill-name}/SKILL.md`

**Agent Format:**
Agent files use extended frontmatter:

```yaml
---
name: agent-name
description: Agent purpose and when spawned
tools: Read, Write, Bash, Grep
color: green
---
```

Location: `.cursor/agents/{agent-name}.md`

**Rule File Format (.mdc):**
Rule files follow strict structure:

```yaml
---
description: Clear, one-line description of what the rule enforces
globs: path/to/files/*.ext, other/path/**/*
alwaysApply: boolean
---
```

Content uses:
- Bold for main points (`**Main Points in Bold**`)
- Bullet points for sub-points
- Code examples with ✅ DO and ❌ DON'T patterns
- File references using `[filename](mdc:path/to/file)` syntax

**Template Files:**
Templates use structured markdown with:
- YAML frontmatter for metadata
- XML-like tags for structured sections (`<role>`, `<process>`, `<step>`)
- Clear section headers with `##`
- Examples in code blocks
- Guidelines sections explaining usage

**Workflow Documentation:**
Workflows use XML-like step tags:

```xml
<step name="step_name" priority="first">
Step content with instructions
</step>
```

Patterns:
- `<purpose>` - High-level goal
- `<philosophy>` - Core principles
- `<process>` - Step-by-step workflow
- `<success_criteria>` - Completion checklist

**Summary Files:**
Phase summaries use extensive frontmatter for dependency tracking:

```yaml
---
phase: XX-name
plan: YY
subsystem: auth|payments|ui|api|database|infra|testing
tags: [jwt, stripe, react, postgres]
requires: []
provides: []
affects: []
tech-stack:
  added: []
  patterns: []
key-files:
  created: []
  modified: []
---
```

## Code Style

**Formatting:**
- Markdown files use standard markdown formatting
- Code blocks specify language for syntax highlighting
- Consistent indentation (2 spaces for YAML, 4 for code examples)

**Linting:**
- No explicit linting config detected for markdown files
- Code examples follow TypeScript/JavaScript conventions from referenced standards

**Import Organization:**
- Documentation files use relative paths for references
- File references use `mdc:` protocol: `[filename](mdc:path/to/file)`
- Cross-references between rules use `mdc:` links

**Path Aliases:**
- `mdc:` protocol for Cursor rule references
- Relative paths for template references (`@./.cursor/origin/templates/`)
- Absolute paths discouraged in documentation

## Error Handling

**Patterns:**
- Documentation errors handled gracefully (check for file existence before reading)
- Bash scripts use error checking: `[ -f "$file" ] || echo "MISSING"`
- Verification scripts check existence before substantive checks

**Error Types:**
- Missing files: Check existence first, report MISSING status
- Stub detection: Pattern matching for TODO/FIXME/placeholder
- Wiring failures: Check connections between components

## Logging

**Framework:**
- No explicit logging framework in framework code
- Bash scripts use `echo` for status messages
- Verification scripts output structured status (EXISTS, MISSING, VERIFIED, FAILED)

**Patterns:**
- Status messages: `echo "EXISTS: $file"` or `echo "MISSING: $file"`
- Structured output for verification: `VERIFIED`, `FAILED`, `PARTIAL`
- Progress indicators in workflows: `◆ Spawning planner...`

## Comments

**When to Comment:**
- Explain why, not what (documentation purpose)
- Document business logic and patterns
- Explain non-obvious algorithms or workarounds
- Avoid obvious comments

**Documentation Comments:**
- JSDoc/TSDoc not used in framework (markdown documentation instead)
- Inline comments in bash scripts explain complex logic
- Template files include `<guidelines>` sections explaining usage

**TODO Comments:**
- Pattern: `TODO:` or `FIXME:` in code
- Tracked in verification patterns for stub detection
- Not systematically tracked in framework codebase

## Function Design

**Size:**
- Bash functions kept focused (single responsibility)
- Documentation functions (like verification checks) are small and composable
- Workflow steps are self-contained units

**Parameters:**
- Bash functions use positional parameters or environment variables
- Documentation templates use frontmatter for configuration
- Agent prompts use structured context objects

**Return Values:**
- Bash functions return status codes (0 = success)
- Verification functions return structured strings (`VERIFIED`, `FAILED`)
- Workflows return structured markdown summaries

## Module Design

**Exports:**
- Documentation files don't export (markdown content)
- Bash scripts are executable, not imported
- Agent files define behavior, not exports

**Barrel Files:**
- Not applicable to documentation structure
- Skills organized by directory (`skills/{name}/SKILL.md`)
- Agents organized by directory (`agents/{name}.md`)

**File Organization:**
- Domain-organized: `agents/`, `skills/`, `rules/`, `workflows/`
- Templates organized by purpose: `templates/codebase/`, `templates/research-project/`
- References organized by topic: `references/verification-patterns.md`

## Documentation Structure

**Section Headers:**
- Use `##` for major sections
- Use `###` for subsections
- Consistent hierarchy (h2 → h3 → h4)

**Code Examples:**
- Always specify language in code fences
- Use ✅ DO and ❌ DON'T patterns for examples
- Include file paths in examples for clarity

**Cross-References:**
- Use `mdc:` protocol for rule references
- Use relative paths for template references
- Use `@` prefix for file references in agent prompts

**Template Usage:**
- Templates stored in `.cursor/origin/templates/`
- Templates include examples and guidelines
- Templates are fill-in-the-blank structures

## Workflow Patterns

**Step Definition:**
- Steps use XML-like tags: `<step name="step_name">`
- Steps have priority attributes: `priority="first"`
- Steps contain structured instructions

**Structured Returns:**
- Workflows return markdown-formatted summaries
- Status indicators: `✓`, `✗`, `⚠️`
- Tables for structured data presentation

**Checkpoint Patterns:**
- Checkpoints use structured XML format
- Types: `checkpoint:human-verify`, `checkpoint:decision`, `checkpoint:human-action`
- Clear instructions for user interaction

## Verification Patterns

**Three-Level Verification:**
1. **Existence** - File/directory exists
2. **Substantive** - Content is real implementation, not stub
3. **Wired** - Connected to rest of system

**Stub Detection:**
- Pattern matching for TODO/FIXME/placeholder
- Empty return checks (`return null`, `return {}`)
- Hardcoded value detection

**Status Values:**
- `VERIFIED` - All checks pass
- `FAILED` - One or more checks fail
- `PARTIAL` - Some checks pass, some fail
- `MISSING` - File doesn't exist
- `STUB` - File exists but is placeholder

---

*Convention analysis: 2026-02-04*
*Update when patterns change*
