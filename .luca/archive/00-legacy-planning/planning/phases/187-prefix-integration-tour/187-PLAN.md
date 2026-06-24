---
phase: 187
plan: 1
type: implementation
autonomous: true
wave: 1
complexity: SIMPLE
---

# Phase 187: Prefix Integration & Tour

## Objective

End-to-end verification and completion of custom prefix flow. Ensure all template files use EJS branding tags so custom-prefixed installations (e.g., prefix "pt" producing /pt, pt-executor) render correctly.

## Context

@packages/luca-framework/templates/framework/
@packages/luca-framework/templates/harness/
@packages/luca-framework/src/commands/vault-init.ts
@packages/luca-framework/src/utils/tour.ts
@packages/luca-framework/templates/harness/claude/skills/post-init-tour/SKILL.md

## Tasks

### Task 1: Template remaining hardcoded branding references [type="auto"]

Scan and fix all hardcoded `Luca`, `lu-`, and `/lu` references across:

- 28 framework template files (workflows, references, templates)
- 9 harness rule and agent templates
- 3 JSON config templates (settings, hooks, index)
- vault-init.ts runtime output

**Verification:**

- [ ] No hardcoded `Luca` in any template .md file
- [ ] No hardcoded `lu-` agent names in template .md files (except source filename examples)
- [ ] No hardcoded `/lu` command references in template .md files
- [ ] JSON templates use EJS branding tags
- [ ] vault-init.ts uses correct /help (not /lu-help)
- [ ] TypeScript compiles without new errors

## Success Criteria

- Zero hardcoded `Luca` or `lu-` agent/command references in EJS-processed template files
- Custom prefix installations render all agent names and commands correctly
- Post-init tour template already uses correct branding (verified, no changes needed)
- vault-init.ts /help bug fixed
