---
id: 123-01
title: Extract shared SQL sanitization utility
wave: 1
tasks:
  - id: 1
    title: Identify duplicated SQL sanitization patterns
    description: Read audit-findings.ts and ledger.ts to find SQL sanitization code that is duplicated
    verification: |
      - List the specific functions or code patterns that appear in both files
  - id: 2
    title: Create shared utility function
    description: Create a new shared utility in src/shared/ that consolidates the SQL sanitization logic
    verification: |
      - New utility file exists in src/shared/__helpers/
      - Function handles the identified SQL sanitization patterns
  - id: 3
    title: Update audit-findings.ts to use shared utility
    description: Replace inline SQL sanitization with import from shared utility
    verification: |
      - audit-findings.ts imports from shared utility
      - No duplicate SQL sanitization code remains
  - id: 4
    title: Update ledger.ts to use shared utility
    description: Replace inline SQL sanitization with import from shared utility
    verification: |
      - ledger.ts imports from shared utility
      - No duplicate SQL sanitization code remains
  - id: 5
    title: Verify code still works
    description: Run tests to ensure refactoring didn't break functionality
    verification: |
      - bun test passes
      - No TypeScript errors
---

# Plan: Extract shared SQL sanitization utility

## Objective

Extract shared SQL sanitization utility from audit-findings.ts and ledger.ts to eliminate DRY violation identified in audit #4.

## Context

The v2.8.0 audit identified that SQL sanitization logic is duplicated between:

- `packages/luca-framework/src/agents/luca/__agents/eval-skills/audit-findings.ts`
- `packages/luca-framework/src/state/ledger.ts`

## Tasks

See YAML frontmatter for task breakdown.

## Dependencies

None - all tasks can be completed in order within a single wave.

## Verification Criteria

Each task has verification criteria in the YAML frontmatter.
