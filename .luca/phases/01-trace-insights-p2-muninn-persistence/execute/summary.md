# Execute Summary — trace-insights-p2-muninn-persistence

Wave 1 of 1, status: **success**. Branch `dad-xstate-migration` (P1 baseline commit 4b6d112c2).

## What changed

- **Stage F — Memory persistence** appended after untouched Stage E (GitHub issue feed): F1 recall-then-evolve insight dedup (best-effort, fingerprint-derived stable slugs — Stage E fingerprint kebab-cased `/`→`-`), F2 `metric:trace-report-<date>` compact JSON digest, F3 remember-latest-wins analysis cursor (`metric:trace-insights-cursor`, bounded JSON `{schemaVersion, lastAnalyzedUntil, seenTraceIds, updatedAt}`, recall `mode: "recent"` limit 1, corrupt → fresh state + 7d fallback + warn, cursor written only after all Stage F writes succeed).
- **Scope guard**: third permitted write surface (bounded MuninnDB writes — remember/evolve only, Stage F routing table concepts only, never under `--dry-run`); `muninn_forget`/`muninn_state`/`muninn_consolidate` and out-of-table writes stay FORBIDDEN.
- **Vault routing table**: `pitfall:trace-*`/`pattern:trace-*` → `default`; `metric:trace-report-<date>`/`metric:trace-insights-cursor` → repo vault (`.luca/config.json` → `muninn.vault`, fallback `"default"`). Cursor vault-pinning note (cursor lives in the invoking repo's vault).
- **`--since auto`** new default: window from cursor `lastAnalyzedUntil` minus 1h trailing overlap; 7d fallback; cursor READ allowed under `--dry-run`.
- **`--dry-run`**: no GitHub issues, no MuninnDB writes (including the cursor).
- Header doc comment + `description` updated for P2; Summary-to-caller gains a memories-created/evolved + cursor bullet.
- Tests: `scope-guard` P1 prohibition flipped to P2 assertions; new `memory-persistence` describe block (routing, recall-then-evolve, cursor semantics + 7d fallback, dry-run skip).

## Commits

| Task | Commit | Message |
|---|---|---|
| 1.1.1 | c4c3883932e68a870b450de762e3e5d2b93a4f92 | feat(tools): trace-insights stage F memory persistence + analysis cursor |
| 1.1.2 | 813eaddeccd0507ffa9b11789dbaa91009e6c803 | test(tools): flip trace-insights P1 prohibition into P2 persistence assertions |
| 1.1.3 | — (gates only, zero regressions) | |

## Gate results

- ac-19 `bunx --bun tsc --noEmit` — PASS
- ac-20 targeted test file — PASS (27 pass / 0 fail, 60 expects)
- ac-21 `bun test packages/luca-tools` — PASS (54 pass / 0 fail, 4 files, 133 expects)
- ac-01…ac-18 grep probes — 22/22 PASS (incl. binding `pattern:trace-` literal per advisory G-CRIT-001); anti-01…anti-04 all hold; all 5 test-contract strings survive verbatim.

## Deviations

1. Subagent `Write` of this summary + `execute/progress.jsonl` blocked by hooks (executor allowlist) — persisted by orchestrator instead.
2. Minor addition: Summary-to-caller bullet for memories created/evolved + cursor advance (keeps caller output consistent with Stage F).
3. Plan-gap resolution (confidence logged, medium): trailing overlap fixed at 1 hour; `seenTraceIds` bounded to that overlap window.
4. Design choice (confidence logged, high): insight concept slugs derive from the Stage E fingerprint, kebab-cased with `/`→`-`.
