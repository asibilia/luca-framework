---
phase: 2
plan: 1
title: "Complexity Rule — Model-Tier-Only Scope Alignment"
type: improvement
autonomous: true
wave: 1
depends_on: []
---

# Phase 02 Plan 1: Complexity Rule — Model-Tier-Only Scope Alignment

## Objective

Update the complexity-gating rule file to reflect model-tier-only scope. Reframe "Iteration Count Scaling" as "Loop Budgets" to eliminate step-gating language. Add recallDepth row to the matrix table. Keep model routing table unchanged.

## Tasks

### 1. Update Rule Title and Description

**Type:** auto
**Depends on:** none

Changed JSDoc title and frontmatter description from "model routing and iteration scaling" to "model tier routing".

### 2. Update Core Statement

**Type:** auto
**Depends on:** none

Removed "and **iteration counts**" from the always-on statement, making it "controls **model tier** only".

### 3. Reframe Iteration Section

**Type:** auto
**Depends on:** none

Replaced "Iteration Count Scaling" section with "Loop Budgets (Not Step Gating)" section. Added "Used by" column to clarify what each parameter actually controls. Added recallDepth row for MuninnDB entry cap.

## Verification

1. `bunx --bun tsc --noEmit` passes
2. No "iteration scaling" or "step gating" language in the rule source
3. Model routing table unchanged
4. Loop budget table includes all parameters plus recallDepth

## Output Specification

- Modified: `src/rules/general/complexity-gating.rule.ts`
