# DX Audit — trace-insights P2 (commits c4c3883, 813eadd)

Verdict: REQUEST_CHANGES (2 HIGH).

Consistent with house conventions (verified): vault-resolution phrasing byte-identical to gh-pr-address/arch-audit/repo-cleanup/gh-prepare; routing matches vault-routing rule; args table ↔ description agree on all six flags; kebab-case throughout; tests assert the real export.

## Findings

1. **HIGH — index.ts:252 (F3 cursor read)**: `muninn_recall(context: ["metric:trace-insights-cursor"], mode: "recent", limit: 1)` never checks the returned engram's `concept` equals the cursor concept. Recall is semantic, not concept lookup; other `session:*`/`metric:*` memories in the repo vault will frequently win limit-1, silently degrading every `--since auto` run to the 7d fallback. Fix: recall limit ~5, filter `concept === "metric:trace-insights-cursor"`, take most recent; "no concept-matching engram" (not just validation failure) is the fresh-cursor case.
2. **HIGH — index.ts:74 (A1 recipe)**: `--project <name>` flag is silently ignored — A1 curl hardcodes `$CC_LANGSMITH_PROJECT` and Preconditions abort when the env var is unset even if `--project` was passed. Fix: resolve PROJECT once (--project else env), reference it in A1 + precondition (abort only if both unset).
3. **MEDIUM — index.ts:217**: F1 covers "each high-confidence finding" but slug derives from the Stage E fingerprint which embeds `<luca_surface-slug>` — undefined for null surface. Scope F1 to non-null `luca_surface` (matching Stage E) or define a `no-surface` segment.
4. **MEDIUM — index.ts:223**: F1 dedup branches don't cover concept-match-but-NOT-flat; relabel the else branch.
5. **LOW — index.ts:273**: garbled failure-mode row ("list available project names is NOT possible read-safely").
6. **LOW — index.ts:50**: gh-auth precondition primes abort; Failure Modes prescribes graceful degradation — state the non-fatal path inline.
