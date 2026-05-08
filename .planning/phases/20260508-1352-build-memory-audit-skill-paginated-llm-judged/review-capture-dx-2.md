# Review Capture — DX [Wave 2]

**Verdict**: REQUEST_CHANGES (1 MUST-FIX, 2 SHOULD-FIX)

## MUST-FIX
- **D2-1** SKILL.md:103 — `lastRunAt` field-semantics says "Set to the current ISO timestamp in **Step 5**" but the actual assignment is in Step 6 sub-item 2. Stale cross-reference from iteration 1 — schema section was not updated when assignment was placed in Step 6. Reader builds wrong mental model. Fix: change "Step 5" → "Step 6 sub-item 2".

## SHOULD-FIX
- **D2-S1** `commands/memory-audit.md:6` — `--auto` is missing from the slash-command shim's argument enumeration. Flag is fully documented in SKILL.md but invisible from the command surface. Test gap: no assertion enforces presence.
- **D2-S2** "Step 1.5" / "Step 1.3" cross-refs use informal sub-item notation that breaks under editing pressure (insert/delete bullets). Replace with named anchors or labels.

## NOTE
- N1: lastRunAt step-number error (line 103) not caught by any test — adding `expect(SKILL).not.toMatch(/lastRunAt.*Step 5/)` would catch it.
- N2: SF-1/SF-2/SF-7/SF-8 all confirmed resolved.

## VERIFIED RESOLVED
- MF-1 (vault always-on, abort path), MF-3 (--auto fully self-contained at lines 68/82/125/171/183).
