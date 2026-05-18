---
title: "Spawn-site-invariant coverage expansion + prose-directive rule pack"
area: framework
created: 2026-05-17
priority: high
source: pr-feedback-audit
---

## Task

Spawn-site-invariant coverage expansion + prose-directive rule pack

## Problem

Prose-directive bugs in mode `.md` files keep slipping through:
- Fenced blocks treated as docs not directives (PR #247 luca:5-review bug — all 4 reviewers `success:false` for 2 runs)
- Placeholder tokens emitted verbatim (`<ts>` instead of `Date.now()`)
- Field-completeness directives inconsistent across mode files (batch-5)
- Round-number placeholders in examples (`inputTokens: 12000`)

Current `spawn-site-invariant.test.ts` only covers 5 mode files; other instruction files are uncovered.

## Recommendations

- **R7.1** Extend `spawn-site-invariant.test.ts` to ALL mode files (currently 5 of N). Per-mode region extraction.
- **R7.2** Rule pack entry: scan instruction `.md` files for `record-subagent` / `record-recall` / `workflowState` calls inside ``` fences → MUST-FIX.
- **R7.3** Rule pack entry: reject `<placeholder>` tokens in instruction files unless preceded by `e.g.` or inside ``` (examples are fine; directives are not).
- **R7.4** Promote MEMORY_TIER_DISCIPLINE pattern: every shared prefix has a size ceiling test, default `< 3000` chars.

## Acceptance

- [ ] spawn-site-invariant covers all mode files in `src/modes/*.md`
- [ ] Rule pack flags fenced executable directives
- [ ] Rule pack flags `<placeholder>` tokens outside examples
- [ ] Shared-prefix size ceiling test exists for every prefix constant

## Memory References

- `01KRHXK6NZQSQ2P8W90JQTF412` — fenced-code-blocks-treated-as-documentation-not-directives
- `01KRHXK6P22ARGBHFG4892RK39` — literal-placeholder-tokens-emitted-verbatim-by-agents
- `01KRKTNYR298R5VHRG49JT4C6H` — inline-directive-vs-fenced-block
- `01KRHWV7KB26PJR902AQ9Q54AK` — prose-fenced-block-vs-inline-directive-execution

## Source

PR feedback audit 2026-05-17 (Theme 7).
