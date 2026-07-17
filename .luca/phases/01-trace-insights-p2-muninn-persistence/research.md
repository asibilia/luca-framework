# Research — trace-insights-p2-muninn-persistence

## Summary

P2 is a pure prompt-artifact change: extend the `trace-insights` skill body (a markdown template literal in `packages/luca-tools/src/artifacts/skills/trace-insights/index.ts`) with a MuninnDB persistence stage + analysis cursor, and flip the P1-prohibition assertions in its sibling `index.test.ts`. No runtime code references the skill body; the only external consumers are the skills barrel (name-level import, unaffected) and the dist-built `SKILL.md` validated by `skill-validation.test.ts` in luca-cli. Strong precedents exist in-repo for every directive needed: cursor schema/resume semantics (memory-audit), recall-then-evolve dedup (seed-memory + learner), vault resolution phrasing (near-universal `` `.luca/config.json` → `muninn.vault`, fallback `"default"` ``), and `metric:*` repo-vault writes (finalize mode).

## Scope — exact P1 text that must change

All in `/Users/alecsibilia/Github/luca-framework/packages/luca-tools/src/artifacts/skills/trace-insights/index.ts` (confidence: HIGH, all line-verified):

1. **File header doc comment, lines 10–12** — "P1 scope … MuninnDB persistence (pitfall/pattern/metric/cursor memories) is P2 and is explicitly FORBIDDEN in this version's scope guard." Must be rewritten to describe P2 scope.
2. **Scope guard, lines 22–32** — currently "exactly two permitted write surfaces" (scratchpad, `gh issue`); the FORBIDDEN list at line 29 bans `muninn_remember`, `muninn_remember_batch`, `muninn_evolve`, `muninn_forget`, `muninn_state`, `muninn_consolidate` with "(MuninnDB persistence is P2)". P2 must add a third permitted write surface (bounded MuninnDB writes per routing table) while keeping `muninn_forget`/`muninn_state`/`muninn_consolidate` (and `.luca/` writes, `luca` CLI mutations, LangSmith mutations) forbidden. Line 25 says "only after the dedup search (Stage E)" — stage-letter reference will need updating if stages are renumbered (see Open Questions).
3. **Arguments table, line 51** — `--since` default is `7d` with validation `^\d+[dh]$` or ISO date. P2 changes default to `auto` (cursor-driven, 7d first-run fallback) and validation must accept `auto`.
4. **`--dry-run` row, line 54** — "report only; no GitHub issues created" → must also state no MuninnDB writes (including no cursor update).
5. **Stage E header + dry-run text, lines 180, 191** — "Stage E — GitHub issue feed (skipped under `--dry-run`)"; the new memory-persistence stage lands after it.
6. **Notes, line 220** — "(An analysis cursor memory arrives in P2.)" — replace with the actual cursor behavior; also the claim "Re-runs over an overlapping window are safe — the issue fingerprint dedup absorbs repeats" should be extended to cover the memory evolve path.
7. **Note, line 221** — "This skill records nothing to `.luca/`" stays true (cursor lives in MuninnDB, not on disk) — keep, but confirm wording still reads correctly next to the new stage.
8. **Description, lines 227–231** — ends "Read-only over LangSmith; no MuninnDB writes (P1)." and documents `--since <7d|ISO>` (default 7d). Both must change (`--since <auto|7d|ISO>` default auto; MuninnDB persistence now in scope).

### Test assertions that must change

In `/Users/alecsibilia/Github/luca-framework/packages/luca-tools/src/artifacts/skills/trace-insights/index.test.ts` (confidence: HIGH):

- **`scope-guard` describe, lines 16–30**: `it('forbids MuninnDB writes in P1')` (lines 17–20) asserts `body` contains `'mcp__muninn__muninn_remember'` and `'MuninnDB persistence is P2'`. The second assertion MUST flip (that string must disappear); the first will likely still pass incidentally (the routing directives will name `muninn_remember`) but should be rewritten to assert the routing table + still-forbidden tools (`muninn_forget`, `muninn_consolidate`, `muninn_state`). The other two `scope-guard` its (lines 22–29: `.luca/` writes, `luca state advance`, "queried read-only") should keep passing unchanged.
- **New assertions needed** (per phase spec): routing table presence (`pitfall:trace-` / `pattern:trace-` → default vault; `metric:trace-report-` / `metric:trace-insights-cursor` → repo vault), dedup/evolve directive (`muninn_recall` before write, `muninn_evolve` on match), cursor semantics (`--since auto`, 7d fallback, cursor updated at end of successful run), and `--dry-run` skipping memory writes.
- **`github-issue-feed` describe, lines 117–134**: assertions reference Stage E strings (`'Dedup search — mandatory before every create'`, `'would-be issues'`) — these survive as long as the issue-feed text is untouched; only stage lettering could ripple.

## Precedent Patterns (exact quotes worth mirroring)

### Cursor memory — memory-audit skill (`packages/luca-tools/src/artifacts/skills/memory-audit/index.ts`) — confidence HIGH

- Concept + storage: line 76 — "The resumable cursor is a single MuninnDB memory in the audited vault — concept `memory-audit:cursor`, with a JSON content body" followed by an explicit JSON schema block (lines 78–88) with per-field semantics (lines 90–97).
- Read pattern: line 102 — `mcp__muninn__muninn_recall({ vault: <resolvedVault>, context: ["memory-audit:cursor"], mode: "recent", limit: 1 })` … "parse the latest one's JSON content as the cursor state. Otherwise seed a fresh state".
- Corruption handling: line 110 — "On a validation failure, treat the cursor as corrupt: seed a fresh state and log a warning … Do not abort — re-scanning is safer than propagating a tampered cursor."
- Write ordering: line 174 — "**Ordering invariant**: write the cursor only AFTER all … calls in the batch return"; line 178 — "Persist the cursor: `mcp__muninn__muninn_remember({ vault, concept: "memory-audit:cursor", content: JSON.stringify(cursor) })` … The latest `memory-audit:cursor` memory wins on the next `--resume` recall."
- Note: memory-audit **updates its cursor by writing a new `muninn_remember` each run and recalling the latest** ("latest wins"), it does NOT evolve the cursor. Decide whether trace-insights mirrors that (simplest, proven) or evolves the cursor memory in place — see Open Questions.

### Dedup/evolve discipline — seed-memory skill (`packages/luca-tools/src/artifacts/skills/seed-memory/index.ts`) — confidence HIGH

The spec's "same as memory-audit" dedup/evolve attribution is actually seed-memory's pattern (memory-audit FORBIDS `muninn_evolve` at its line 24). The canonical phrasing to mirror:

- Line 51: "`muninn_recall({ vault, context: ["<the entity's natural-language description, NOT its slug>"], mode: "balanced", limit: 5 })` and inspect whether any returned engram's `concept` exactly equals the target concept."
- Line 52: "If a returned engram's concept matches AND it is a **FLAT** engram … capture its `id` (ULID) and `muninn_evolve(id, new_content)` it. Evolve is safe for flat engrams only."
- Lines 218–224 ("Idempotency (best-effort, NOT guaranteed)"): "MuninnDB has **no concept lookup** … On a vault with no/weak embedder the recall can miss an existing engram, in which case re-running **will create a duplicate**." — the acceptance criterion "zero duplicate memories" should be phrased with this best-effort caveat or the skill overpromises.
- learner.ts line 106 restates the same: "the dedup is **best-effort** … Prefer a distinctive, stable `concept:` slug per learning".
- Evolve semantics for recurrence: milestone-complete line 41 — "`muninn_evolve` (by ULID) to append a 'validated' note to the flat pitfall engram" — matches the spec's "increment occurrence count, append latest evidence + trace URL".

### `metric:*` write phrasing — finalize mode (`packages/luca-tools/src/artifacts/modes/finalize.ts`) — confidence HIGH

Line 135: "**Persist** one memory per complexity bucket to the repo vault (resolved from `.luca/config.json` → `muninn.vault`, fallback `"default"` …) via a single batched write. Concept is `metric:outcome-kpi-<version>-<complexity>`". Same shape for `metric:trace-report-<date>`.

## Vault Resolution Conventions — confidence HIGH

The house phrasing, verbatim in ≥10 artifacts (e.g. `skills/gh-pr-address/index.ts:30`, `skills/arch-audit/index.ts:39`, `skills/memory-audit/index.ts:63`, `modes/finalize.ts:74`):

> Resolve `<repo_vault>` from `.luca/config.json` → `muninn.vault`, falling back to `"default"`.

Routing-table phrasing precedent (seed-memory line 131): "**routing each entry's `vault` by its concept type** (vault-routing rule): `pattern:`/`pitfall:`/`preference:` → `default` (cross-cutting); `decision:`/`convention:` → the **repo vault** (`.luca/config.json` → `muninn.vault`, fallback `default`; project-scoped). Do NOT put them all in `default`." The lu skill (line 117) and learner (lines 107–108) use the same split. Ground truth in this repo: `.luca/config.json` has `muninn.vault: "luca-monorepo"` (verified) — note the phase prompt said `luca-monorepo`, matching. The P2 routing (`pitfall:trace-*`/`pattern:trace-*` → default; `metric:*` → repo vault) is fully consistent with the global vault-guard rule table.

## Files To Change (exact list) — confidence HIGH

1. `/Users/alecsibilia/Github/luca-framework/packages/luca-tools/src/artifacts/skills/trace-insights/index.ts` — body (scope guard, args table, new persistence stage, Notes) + `description` field + header doc comment.
2. `/Users/alecsibilia/Github/luca-framework/packages/luca-tools/src/artifacts/skills/trace-insights/index.test.ts` — flip `scope-guard` P1 assertions; add routing-table / cursor / evolve / dry-run-skip assertions.

Nothing else references the skill: grep for `traceInsightsSkill|trace-insights` across `packages/` hits only these two files plus the barrel `packages/luca-tools/src/artifacts/skills/index.ts` (lines 59/105/154 — name-level only, no change needed). No `packages/luca/dist/claude/skills/trace-insights/` exists yet (dist is stale relative to the uncommitted P1), so no generated file edits — dist regenerates via `bun run build`.

## Risks

- **Stage lettering collision (HIGH)**: The phase spec calls the new memory stage "Stage E", but P1's Stage E is already the GitHub issue feed (body line 180), and the scope guard (line 25) cross-references "(Stage E)". Either the memory stage becomes Stage F, or the issue feed is renamed — every cross-reference and the `github-issue-feed` test block strings must stay consistent.
- **Test-assertion drift (HIGH)**: `index.test.ts:19` asserts the literal `'MuninnDB persistence is P2'` — the P2 body must not retain that string anywhere (including the file header is fine — the test reads only `traceInsightsSkill.body`, not the doc comment). Conversely, keep `` 'Any `Write` under `.luca/`' ``, `'luca state advance'`, `'queried read-only'` verbatim or update those assertions too.
- **`skill-validation.test.ts` (MEDIUM)**: `packages/luca-cli/src/init/helpers/skill-validation.test.ts` validates the built `dist/claude/skills/*/SKILL.md` — only frontmatter presence + a forbidden-token list (line 74 includes `.planning/`). The new directives reference `.luca/config.json` (safe). No description-length constraint exists (`defineSkill` in `packages/luca-tools/src/define/skill.ts:45` requires only `min(1)`); backtick-heavy markdown inside the template literal must keep escaping `` \` ``/`\\` correctly or the TS file breaks — `bunx --bun tsc --noEmit` catches this.
- **Dry-run/cursor interaction (MEDIUM)**: acceptance says `--dry-run` = zero MuninnDB writes — that must explicitly include NOT updating the cursor, and `--since auto` under dry-run should still READ the cursor (reads are fine per the read-only stance). Spell this out or an executor may leave it ambiguous.
- **Overlapping-window dedup overpromise (MEDIUM)**: recall-based dedup is best-effort (seed-memory line 224, learner line 106 — embedder-dependent). Mirror the "distinctive stable concept slug" mitigation (e.g. fingerprint-derived slugs like `pitfall:trace-<fingerprint>`) so `muninn_consolidate` can merge any slip-throughs.
- **Cursor vault pinning (LOW)**: memory-audit aborts on cursor/vault mismatch (line 109 "Vault drift guard"). trace-insights runs across ALL repos but the cursor lives in THIS repo's vault (`luca-monorepo`) — running the skill from a different repo would resolve a different vault and silently start a fresh cursor. Worth a one-line note in the body.

## Open Questions

1. **Stage letter for the new persistence stage** — F (after the existing E issue feed), or renumber? Spec text says "Stage E memory persistence … after report + GitHub issue feed", which is self-contradictory with P1's lettering. Recommend: new **Stage F — Memory persistence**, leaving E untouched (minimizes test churn).
2. **Cursor update mechanism** — mirror memory-audit exactly (`muninn_remember` a fresh `metric:trace-insights-cursor` each run, `mode: "recent", limit: 1` recall, latest-wins) or `muninn_evolve` the existing cursor memory in place (avoids cursor-memory accumulation, consistent with the P2 evolve discipline)? memory-audit precedent is remember-latest-wins; the evolve path is cleaner for a `metric:` memory. Planner should pick one explicitly.
3. **Cursor content** — spec says "last-analyzed timestamp + hash/set of seen trace ids". A full seen-id set grows unboundedly; a bounded design (e.g. last-run ISO timestamp + ids from the final overlap window only, or a count+hash) should be decided at plan time.
4. **Does `metric:trace-report-<date>` store the whole report or a digest?** Report bodies can be large; precedent (`metric:outcome-kpi-*`) stores a compact JSON payload, not prose. Recommend digest (headline stats + finding fingerprints + issue numbers).
