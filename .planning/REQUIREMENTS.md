# Requirements — v2.5.0 Operational Intelligence & Distribution Hardening

## Overview

Make Luca's runtime smarter (real token accounting, context pruning, convergence detection, role-based routing), fix distribution blockers (version sync, harness-aware update), and lay the DX foundation (status command, doctor, presets) for community adoption.

## Source

- Todos: `.planning/todos/pending/01-25` (25 todos, 14 absorbed into v2.5.0)
- WSJF Prioritization: lu-pm-planner session 2026-03-01

## Requirements

### R1: Distribution Pipeline Fix

**Priority:** CRITICAL | **Source:** Todo #5

- ~~R1.1: LUCA_VERSION constant propagated correctly through build pipeline~~ **Complete**
- ~~R1.2: `package.json` version and LUCA_VERSION in sync at publish time~~ **Complete**
- ~~R1.3: npm publish pipeline functional with correct version metadata~~ **Complete**
- ~~R1.4: Version reported by CLI matches published package version~~ **Complete**

### R2: Harness-Aware Update Command

**Priority:** HIGH | **Source:** Todo #10

- ~~R2.1: `bun luca update` reads `manifest.harnesses` to determine which harness dirs to update~~ **Complete**
- ~~R2.2: Per-harness file diffing and conflict detection~~ **Complete**
- ~~R2.3: New harness files scaffolded when harness added post-init~~ **Complete**
- ~~R2.4: Removed harness files cleaned up when harness removed~~ **Complete**

### R3: CLI Status Command

**Priority:** HIGH | **Source:** Todo #19

- ~~R3.1: `bun luca status` command exists and is registered in CLI~~ **Complete**
- ~~R3.2: Shows current version, active harnesses, config profile, test count~~ **Complete**
- ~~R3.3: Shows state machine status (idle/active phase/milestone)~~ **Complete**
- ~~R3.4: Clean, formatted terminal output~~ **Complete**

### R4: Harness-Aware Doctor

**Priority:** HIGH | **Source:** Todo #21

- ~~R4.1: `bun luca doctor` checks Bun runtime (not Node)~~ **Complete**
- ~~R4.2: Per-harness directory validation (expected files exist)~~ **Complete**
- ~~R4.3: Config schema validation against current config.json~~ **Complete**
- ~~R4.4: Drift detection (source vs compiled output)~~ **Complete**

### R5: Progressive Config Presets

**Priority:** MEDIUM | **Source:** Todo #11

- ~~R5.1: Three preset tiers: Starter, Standard, Full~~ **Complete**
- ~~R5.2: Wizard offers preset selection during init~~ **Complete**
- ~~R5.3: Each preset maps to a valid config.json with appropriate defaults~~ **Complete**
- ~~R5.4: Preset can be changed post-init via config command~~ **Complete**

### R6: Real Token Accounting

**Priority:** HIGH | **Source:** Todo #2

- ~~R6.1: Tokenizer integration (tiktoken or equivalent) replaces chars/4 heuristic~~ **Complete**
- ~~R6.2: Quality zone boundaries calculated from real token counts~~ **Complete**
- ~~R6.3: Budget calculations in iteration engine use real counts~~ **Complete**
- ~~R6.4: Memory compression triggers based on accurate token measurement~~ **Complete**

### R7: Role-Based Model Routing

**Priority:** HIGH | **Source:** Todo #1

- ~~R7.1: Agent roles mapped to model profiles (research->capable, execution->balanced, quick->fast)~~ **Complete**
- ~~R7.2: Quality-zone-aware model upgrades (upgrade model when approaching degrading zone)~~ **Complete**
- ~~R7.3: Model routing respects per-agent modelTier from agent definitions~~ **Complete**
- ~~R7.4: Routing decisions logged for observability~~ **Complete**

### R8: Context Pruning Extensions

**Priority:** HIGH | **Source:** Todo #4

- ~~R8.1: Stale ResultEnvelopes auto-digested at degrading zone~~ **Complete**
- ~~R8.2: Section-level pruning with configurable retention policies~~ **Complete**
- ~~R8.3: Pruning preserves critical context (active task, current plan)~~ **Complete**
- ~~R8.4: Pruning events logged to WORKING.md~~ **Complete**

### R9: WORKING.md Auto-Compaction

**Priority:** MEDIUM | **Source:** Todo #25

- ~~R9.1: Auto-compaction triggers at degrading quality zone~~ **Complete**
- ~~R9.2: Sections compacted by age/relevance scoring~~ **Complete**
- ~~R9.3: Compacted content summarized, not deleted~~ **Complete**
- ~~R9.4: Session continues after compaction (no hard stop)~~ **Complete**

### R10: Verification Parity Matrix

**Priority:** MEDIUM | **Source:** Todo #22

- R10.1: Build-time structural assertions across all compilation formats
- R10.2: Agent count parity across .claude/, .cursor/, .pi/
- R10.3: Skill count parity verification
- R10.4: Rule count parity verification
- R10.5: Drift report generated as part of build pipeline

### R11: Semantic Convergence Detection

**Priority:** MEDIUM | **Source:** Todo #3

- R11.1: Cosine similarity added to convergence detector
- R11.2: Iteration loops terminate on semantically equivalent errors
- R11.3: Configurable similarity threshold
- R11.4: Convergence reason included in iteration log

### R12: Agent Effectiveness Scorecard

**Priority:** MEDIUM | **Source:** Todo #7

- R12.1: Per-agent telemetry aggregation (invocations, success rate, avg duration)
- R12.2: Scorecard data persisted across sessions
- R12.3: Scorecard queryable for routing decisions
- R12.4: Dashboard or report output available

### R13: Compiler Plugin Registry

**Priority:** MEDIUM | **Source:** Todo #8

- R13.1: Pluggable registry replaces hardcoded switch in compile.ts
- R13.2: Plugin interface defined for new compilation targets
- R13.3: Existing Claude/Cursor/Pi compilers refactored as plugins
- R13.4: Registration API for community-contributed targets

---

_Requirements created: 2026-03-01_
