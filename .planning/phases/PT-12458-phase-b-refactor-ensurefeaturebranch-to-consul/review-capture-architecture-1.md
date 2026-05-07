# Review Capture — Architecture [Wave 1]

**Subagent**: reviewer
**Perspective**: architecture
**Timestamp**: 2026-05-07T16:00:00Z

## Findings

**MUST-FIX**:

ARCH-1: `finalize.md:344` calls `ensureFeatureBranch({ action: "consult" })` but `tool-manifest.ts` only grants finalize `['status', 'assert-not-default']`. The `consult` action will be rejected at runtime by mode scoping. Either (a) add `'consult'` to finalize's manifest entry, or (b) rewrite finalize.md to read base from `state.prBase ?? state.baseBranch ?? 'main'` without consulting the tool.

**Architecture invariants confirmed**:
- Flat z.object + z.enum dispatch; per-action runtime parse — ✓
- resolve pure (no writes/git mutations) — ✓
- apply git-first then state — ✓ (verified at lines 752-769)
- G-DX-003 carve-out wired (resolve sets needsConfirmation; apply refuses without confirmedBase; architect.md prose enforces ask_user) — ✓
- guardedBranches defense-in-depth (.min(1) at schema + ['main'] runtime fallback) — ✓
- Schema additivity, schemaVersion stays 1 — ✓
- baseBranch/prBase written by apply — ✓
- PT-12458 regression covers both surfaces — ✓
- Apply gate logic verified safe: `needsConfirmation && (base === undefined || confirmedBase === undefined)` correctly fires when needsConfirmation && !confirmedBase regardless of base presence

## Verdict

REQUEST_CHANGES — 1 MUST-FIX (consult action permission gap in finalize)
