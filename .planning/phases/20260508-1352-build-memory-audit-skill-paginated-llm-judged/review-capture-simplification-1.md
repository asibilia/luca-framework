# Review Capture — Simplification [Wave 1]

**Subagent**: reviewer
**Perspective**: simplification
**Verdict**: REQUEST_CHANGES

## MUST-FIX (0)

## SHOULD-FIX (7)
- **SIMP-S1** Non-exhaustiveness caveat stated 3× (lines 101, 184, 206). Collapse to Caveats canonical + cross-ref.
- **SIMP-S2** external/untrusted skip-rule stated 4× (lines 37, 45-46, 121-122, 179-180). Drop standalone line 37.
- **SIMP-S3** `runId` and `lastRunAt` are near-duplicate state fields. Drop `runId`, use `lastRunAt` for filename + heading.
- **SIMP-S4** ask_user/full-auto block (SKILL.md:126-138) is unimplemented mechanism + untested. (Same root as DX-1.)
- **SIMP-S5** memory-audit.test.ts: 13 separate readFileSync calls. Hoist to module scope `const SKILL = readFileSync(...)`.
- **SIMP-S6** Failure-modes table rows 2/3/5 duplicate body prose. Cut to rows 1+4.
- **SIMP-S7** totalsByTier.external + totalsByTier.untrusted always 0 by construction. Remove fields.

## NOTE
- SKILL.md ~1650 words; defensible but skim threshold.
- 6 heading-loop tests OK (orthogonal).
- extractOutsideFences clean.
- lastRunAt set-time gap (same as DX-3).
