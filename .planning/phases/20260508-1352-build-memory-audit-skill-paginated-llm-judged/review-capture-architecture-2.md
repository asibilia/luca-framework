# Review Capture — Architecture [Wave 2]

**Verdict**: REQUEST_CHANGES (2 SHOULD-FIX, 0 MUST-FIX)

## SHOULD-FIX
- **A2-S1** Two stale step-number cross-refs after 5→7 renumbering: SKILL.md:103 says "Step 5" (should be Step 6); SKILL.md:199 says "Step 1.5" (informal sub-item notation, no anchor exists). Reader following these is misdirected.
- **A2-S2** `--auto` bypass of Step 2 gate is under-specified — could read as "skip prompt only" or "skip Step 2 entirely". Add clarifying sentence.

## NOTE
- N1: --auto bypass leaves no audit trail.
- N2: FORBIDDEN_TOOLS array missing comment that bare muninn_remember handled by regex.
- N3: Field semantics block forward-references Step 6.

## VERIFIED RESOLVED
- MF-1, MF-2 (functional), MF-3 (zero "full-auto" matches), MF-4 (11 tools), MF-5 (negative-lookahead).
