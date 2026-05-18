---
title: "Reviewer-test-quality perspective + assertion utilities"
area: review
created: 2026-05-17
priority: medium
source: pr-feedback-audit
---

## Task

Reviewer-test-quality perspective + assertion utilities

## Problem

Tests that pass but don't actually assert the intended invariant — recurring smell across 4+ PRs:
- Vacuous mocks: mock override equals beforeEach default → test exercises zero new path
- Presence-only assertions: `.toContain('Date.now()')` passes even if directive regresses to `<ts>` (PR #247)
- Positional anchors coupled to wording (twin positional tests with same probe string)
- Doc-comment mismatch with implementation (header claims `\d{10,}` check, impl uses `\d{14}`)

## Recommendations

- **R6.1** New reviewer perspective `reviewer-test-quality` (or fold into `reviewer-dx`). Checklist:
  - (a) does test fail if change reverts?
  - (b) anchor invariant guards on positional assertions?
  - (c) mock override actually differs from default?
  - (d) doc-comment claims match implementation?
- **R6.2** Add `assertWouldFailWithoutChange` test utility for high-risk regression tests (runs test against a snapshot of pre-change code).
- **R6.3** Codify "fence-split regression test" pattern (PR #247 lineage) as a shared helper in `src/__tests__/helpers/`.

## Acceptance

- [ ] Reviewer perspective added (new role or DX extension) with checklist
- [ ] `assertWouldFailWithoutChange` helper exists OR documented why infeasible
- [ ] Fence-split helper extracted and reused across spawn-site-invariant tests
- [ ] Reviewer prompt documents the 4-question test-quality lens

## Memory References

- `01KREK86JWK8J5VW4NREWSJVFW` — vacuous-mock-no-op-test-after-contract-change
- `01KREKVSM0CN3PB9ET28VKJGEG` — test-contract-change-invalidates-old-test-vacuous-smell
- `01KRKBC8ZZDK8GP5DBB8TBK69H` — pr-review-presence-only-test-too-permissive
- `01KRHD73TVJR7FDEPS95D2SX8R` — positional-test-needs-anchor-invariant-guard

## Source

PR feedback audit 2026-05-17 (Theme 6).
