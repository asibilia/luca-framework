# Review Capture — DX [Wave 1]

**Subagent**: reviewer
**Perspective**: dx
**Verdict**: REQUEST_CHANGES

## MUST-FIX (3)
- **DX-1** SKILL.md:126-138 references `full-auto` oversight as branch condition with no definition / no flag / no detection mechanism. Agent cannot determine which branch to take.
- **DX-2** SKILL.md:85 (state-schema) says abort on vault mismatch; SKILL.md:89 (Step 1 body) says warn only. Contradiction. Top-to-bottom reader follows warn path → silent cross-vault corruption.
- **DX-3** `state.lastRunAt` never assigned in any step. Schema seeds template string `"<ISO-timestamp>"`; Step 5 doesn't say to update before writing. 24-hour guard at line 91 is non-functional.

## SHOULD-FIX (3)
- **DX-S1** Bare-remember test (memory-audit.test.ts:101-107) uses call-form regex; siblings use identifier-only. Asymmetric (same root issue as ARCH-1).
- **DX-S2** Argument validation block missing — pre-flight checks for `--dry-run + --apply`, `--limit` bounds, `--vault` non-empty.
- **DX-S3** `state.totalsByTier` accounting ambiguous (proposed vs applied). Dry-run accumulates → cumulative totals overstate.

## NOTE
- Slash-command description jargon-heavy.
- G-DX-003 / G-DX-001 codes in test names reference unindexed external IDs.
- Batch-size guidance (10-15) has no enforcement path for `--limit 200`.
