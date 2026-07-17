# Test-Quality Audit — trace-insights P2 (commit 813eadd)

Verdict: REQUEST_CHANGES (4 must-fix, 2 should-fix, 1 note).

Non-vacuous and well-pinned (verified): `mode: "recent"` (unique to F3 read), `no MuninnDB writes (including the cursor)` (unique to dry-run row), `not.toContain('MuninnDB persistence is P2')` (good negative anchor).

## Must-fix

1. **index.test.ts:144 (routing test)**: asserts only concept-slug presence — vault assignments can be swapped/deleted without failure. Pin actual table rows (`` `pitfall:trace-<fingerprint>` | `default` ``, `` `metric:trace-insights-cursor` | `<repo_vault>` ``) plus the binding header.
2. **index.test.ts:151 (recall-then-evolve test)**: vacuous — every asserted token also appears outside F1 (scope guard line 29, F3's "do NOT muninn_evolve", Notes best-effort). Anchor to F1-unique literals (dedup-mandate line, flat-engram constraint).
3. **index.test.ts:157**: cursor-corruption fallback unguarded — `fall back to a \`7d\` window` also satisfied by args section. Add corruption-path-unique assertions (`treat the cursor as corrupt`, `schemaVersion` validation / do-not-abort).
4. **index.test.ts:143 (block)**: write-ordering invariant + remember-latest-wins semantics (cursor only AFTER all F1/F2 writes; skip on partial failure; never evolve cursor) have no assertions.

## Should-fix

5. **:23**: forbidden-triple assertions are presence-only — pass if inverted to permitted; anchor the prohibition context line.
6. **:167**: dry-run READ-permitted carve-out unasserted.

## Note

7. Prefer short stable tokens over long prose literals (brittleness).
