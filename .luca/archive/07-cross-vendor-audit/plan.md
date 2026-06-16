---
id: 07-cross-vendor-audit
title: Cross-Vendor / Independence Audit (REQ-10)
waves: 1
tasks: 2
---

# Plan: Cross-Vendor / Independence Audit (REQ-10)

## Objective
Add a CRITICAL-only, opt-in, read-only "independence" auditor that catches single-model blind spots via cold/adversarial fresh-eyes review. REQ-10 is low-priority and cuttable — ceiling is one reviewer perspective plus one gated execute step. No new subagent file, CLI verb, or config schema.

## Context
Cross-vendor is a phantom capability here: all model tiers are Anthropic (`packages/luca-mastracode/src/integration/model-routing.ts:15-19`), so REQ-10's faithful adaptation is independence-framed (cold isolation, diff-only, NO other reviewers' findings, skeptical framing) — NOT a literal different-vendor spawn. Mirror the existing gated §8.5 Design Tribunal (`phase-execute/index.ts:1461-1503`): skip-line + config-flag (`c.workflow?.cross_vendor_audit_enabled ?? false`, DEFAULT FALSE) + CRITICAL-only + changed-files-exist. Reuse `reviewer.ts` (allowedTools already read-only) with a 7th `independence` perspective.

## Phases

### Phase 1: Independence Audit

#### Wave 1: Tracer slice (disjoint files, parallel-safe)

- [ ] **Task 1.1.1**: Add a 7th `independence` perspective to the reviewer subagent — cold/adversarial/read-only fresh-eyes framing, plus a one-line comment noting it is the REQ-10 cross-vendor adaptation (single-vendor harness → independence approximation). Add `independence` to the perspectives prose (~line 41), the output-format token list (~line 111), and the audit-slug list (~line 108).
  - Files: `packages/luca-tools/src/artifacts/subagents/reviewer.ts`
  - Verification: ac-01, ac-02, anti-01, anti-04, anti-06

- [ ] **Task 1.1.2**: Add a gated `### 8.6. Cross-Vendor / Independence Audit (Conditional)` step immediately after §8.5, mirroring §8.5's structure: skip-line + gate-check reading `c.workflow?.cross_vendor_audit_enabled ?? false` + `COMPLEXITY === "CRITICAL"` only + changed-files-exist; a single cold `Task(subagent_type="Code Reviewer", PERSPECTIVE: independence)` spawn receiving diff-only and explicitly NONE of the other reviewers' findings; merge its output into §8.1 routing. Include one honest line that single-vendor → independence approximates cross-vendor.
  - Files: `packages/luca-tools/src/artifacts/skills/phase-execute/index.ts`
  - Verification: ac-03, ac-04, ac-05, ac-06, anti-01, anti-02, anti-03, anti-05

## Deliverables
- **D1**: 7th `independence` reviewer perspective (cold/adversarial/read-only, REQ-10-noted) → ac-01, ac-02
- **D2**: Gated CRITICAL-only opt-in §8.6 independence-audit execute step wired into §8.1 → ac-03, ac-04, ac-05, ac-06

## Verification Criteria
- **ac-01**: `grep -ci "independence" packages/luca-tools/src/artifacts/subagents/reviewer.ts` returns ≥1 (was 0 as-built).
- **ac-02**: `grep -niE "cold|adversarial|fresh.eyes|cross-vendor" packages/luca-tools/src/artifacts/subagents/reviewer.ts` returns ≥1 (independence framing + REQ-10 note present).
- **ac-03**: `grep -c "cross_vendor_audit_enabled" packages/luca-tools/src/artifacts/skills/phase-execute/index.ts` returns ≥1 (was 0 as-built).
- **ac-04**: `grep -n "8.6" packages/luca-tools/src/artifacts/skills/phase-execute/index.ts` returns the `### 8.6.` independence-audit heading (was absent).
- **ac-05**: `grep -niE "CRITICAL" packages/luca-tools/src/artifacts/skills/phase-execute/index.ts` confirms the §8.6 block gates on `COMPLEXITY === "CRITICAL"` (grep the §8.6 region shows a CRITICAL-only skip condition).
- **ac-06**: `bunx --bun tsc --noEmit` exits 0.

### Anti-criteria (regression guards)
- **anti-01**: MUST NOT claim a real different-vendor/model performs the audit — `grep -niE "gemini|openai|different vendor|vendor x" <new code in both files>` returns nothing asserting a real different-vendor mechanism (independence-framed only).
- **anti-02**: MUST NOT default the toggle ON — `grep "cross_vendor_audit_enabled" phase-execute/index.ts` shows `?? false`, never `?? true`.
- **anti-03**: MUST NOT add a new subagent artifact, CLI verb, or `.luca/config.json` workflow schema — `git status --porcelain` shows only `reviewer.ts` + `phase-execute/index.ts` modified, no new files under `subagents/`, `commands/`, or core schemas.
- **anti-04**: MUST NOT make the auditor non-read-only — `reviewer.ts` `allowedTools` stays `['Read','Grep','Glob','Write']` (no Edit/Bash/Task added).
- **anti-05**: MUST NOT gate the §8.6 block at or below COMPLEX — the skip condition fires for everything except CRITICAL.
- **anti-06**: MUST NOT create `.test.ts` files or run `bun test` — verification is `tsc --noEmit` + grep only.

## Risks & Mitigations
- **Phantom-capability drift** (dominant pitfall): body must frame independence, not vendor X. Mitigated by anti-01 grep guard + explicit honest note in both files.
- **Over-building a cuttable feature**: ceiling is 1 perspective + 1 gated step. Mitigated by anti-03 (no new files/verbs/schema).
- **Meta-doc key drift**: `cross_vendor_audit_enabled` must be spelled identically everywhere referenced. Mitigated by ac-03 exact-string grep.

## Decisions
- 2026-06-15 — Cross-vendor reality: harness is single-vendor (all Anthropic); REQ-10 adapted as independence-framed cold/adversarial read-only auditor, NOT a literal different-vendor spawn.
- 2026-06-15 — Default OFF (`?? false`): opt-in/cuttable, unlike tribunals which default true.
- 2026-06-15 — CRITICAL-only gate: strictest, smallest blast radius for a low-priority feature.
- 2026-06-15 — Perspective name = `independence` (avoids the phantom "vendor" word); no `model:` pin (non-goal in single-vendor harness).
