# Plan: PR #138 Code Review

**Note:** This is the code review plan (review task specification). The original feature implementation plan was completed and archived. This plan covers the multi-perspective audit phase.

## Objective

Perform a structured multi-perspective code review of PR #138 (`feat/system-reminder-tui-notifications`) in its final state — after all initial review feedback has been addressed. Produce a consolidated REVIEW report with pass/fail verdict and any remaining issues.

## Context

PR #138 adds system-reminder TUI notifications to Luca pipeline mode transitions. The diff spans 3 commits:

- `d42b273d3` — feat: initial implementation (PIPELINE_STEPS_ORDERED, buildPipelineProgressHeader, wrapInSystemReminder, mode_changed subscriber update)
- `942c046a3` — fix: address Copilot review feedback (escapeSystemReminderBody, derive PIPELINE_STEPS from PIPELINE_STEP_IDS)
- `d8be4ee0c` — fix: restore ROADMAP.md and gitignore runtime artifacts

**Changed files:**
- `packages/luca-mastracode/src/index.ts` (+77 / -2)
- `.gitignore` (+5 / -0)
- `.planning/ROADMAP.md` (restored to full 1,069-line version)

**Prior review status:** 4 Copilot comments all addressed. Two rounds of `/pr-address` completed. No open threads.

**tsc status:** Pass (0 errors).

## Phases

### Phase 1: PR #138 Code Review

#### Wave 1: Parallel multi-perspective review

Spawn 4 reviewer subagents in parallel, each from a different lens:

- [ ] **Task 1.1.1**: Architecture review
  - Scope: `packages/luca-mastracode/src/index.ts` full diff
  - Focus: coupling, single-responsibility, data shape contracts, module boundaries, future extensibility
  - Verification: Findings categorized by severity (MUST-FIX / SHOULD-FIX / NOTE)

- [ ] **Task 1.1.2**: DX review
  - Scope: `packages/luca-mastracode/src/index.ts` full diff + `.gitignore` additions + `.planning/ROADMAP.md` restoration
  - Focus: code clarity, naming, JSDoc quality, footgun documentation, test coverage gaps; confirm gitignore entries are well-commented; confirm ROADMAP restoration is complete (1,069 lines)
  - Verification: Findings categorized by severity

- [ ] **Task 1.1.3**: Security review
  - Scope: `packages/luca-mastracode/src/index.ts` diff — escapeSystemReminderBody, wrapInSystemReminder
  - Focus: escape completeness, injection vectors, trust boundary verification
  - Verification: Findings categorized by severity

- [ ] **Task 1.1.4**: Simplification review
  - Scope: `packages/luca-mastracode/src/index.ts` full diff
  - Focus: dead code, unnecessary abstraction, ternary clarity, derivation opportunities
  - Verification: Findings categorized by severity

#### Wave 2: Consolidate and produce final report

- [ ] **Task 1.2.1**: Consolidate findings from all 4 reviewers
  - Deduplicate cross-perspective findings
  - Categorize: MUST-FIX (blockers) / SHOULD-FIX (advisories) / NOTES
  - Verify no new MUST-FIX issues have been introduced since last review round
  - Write `.planning/REVIEW-2.md` with consolidated findings
  - Verification: Report written, verdict declared (APPROVED / REQUEST_CHANGES)

## Verification Criteria

- All 4 reviewer perspectives complete
- Findings deduplicated and consolidated into REVIEW-2.md
- Verdict declared: APPROVED if zero MUST-FIX, REQUEST_CHANGES if any MUST-FIX remain
- If APPROVED: transition to Finalize

## Risks & Mitigations

- **escapeSystemReminderBody may be over-broad**: Escaping `<`, `>`, `"`, `'` means continuation messages with angle brackets or quotes will be HTML-entity-encoded when shown in the amber box. Risk: reduced readability of code snippets or paths in kick-off messages. Mitigation: reviewers should flag if this is a real rendering concern.
- **PIPELINE_STEPS_ORDERED label strings still duplicate mode .name fields**: Noted advisory from prior review, not yet fixed. Reviewers should confirm whether this remains acceptable advisory-only.
