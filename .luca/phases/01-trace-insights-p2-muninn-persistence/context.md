# Context — trace-insights-p2-muninn-persistence

User decisions from phase discussion (2026-07-16). All four research open questions resolved. Downstream agents (planner, executor) treat these as LOCKED.

## Decisions

### 1. Stage lettering [user-input]

The new memory-persistence stage is **Stage F — Memory persistence**, appended AFTER the existing Stage E (GitHub issue feed). Stage E and all its cross-references (scope guard "(Stage E)" ref, `github-issue-feed` test-block strings) stay untouched. Resolves the spec's self-contradiction ("Stage E memory persistence … after report + issue feed") in favor of minimal churn.

### 2. Cursor update mechanism [user-input]

**remember-latest-wins** (memory-audit precedent, exact): each run persists the updated cursor as a fresh `muninn_remember({ vault: <repo-vault>, concept: "metric:trace-insights-cursor", content: JSON.stringify(cursor) })`. Reads use `muninn_recall({ vault, context: ["metric:trace-insights-cursor"], mode: "recent", limit: 1 })` — latest wins. NOT `muninn_evolve` for the cursor (evolve stays reserved for insight-memory recurrence). Corruption handling mirrors memory-audit: on parse/validation failure treat cursor as corrupt, seed fresh state (7d fallback), log warning, do not abort.

### 3. Cursor content bounds [user-input]

Bounded cursor JSON: **last-run ISO timestamp + seen-trace-ids from the overlap window only** (ids whose start_time falls within a small trailing overlap of the analyzed window), NOT an unbounded all-time seen set. Fields at minimum: `{ schemaVersion, lastAnalyzedUntil (ISO), seenTraceIds (bounded array), updatedAt (ISO) }`. Planner defines the exact schema block in the skill body (memory-audit style).

### 4. metric:trace-report-<date> payload [user-input]

Compact **JSON digest**, never full report prose. Contents: headline stats (window, trace count, spend totals, error rate), finding fingerprints, GitHub issue numbers created/deduped. Matches `metric:outcome-kpi-*` precedent (finalize mode).

## Standing constraints (from phase spec + research, reaffirmed)

- Vault routing: `pitfall:trace-*` / `pattern:trace-*` → `default` vault; `metric:trace-report-<date>` / `metric:trace-insights-cursor` → repo vault (resolve from `.luca/config.json` → `muninn.vault`, fallback `"default"`).
- Dedup/evolve for INSIGHT memories (not cursor): `muninn_recall` before write; on concept match of a FLAT engram, `muninn_evolve` by ULID (occurrence count + latest evidence + trace URL). Phrase as best-effort (seed-memory precedent) with distinctive stable fingerprint-derived concept slugs as mitigation.
- `--since auto` becomes the default: reads cursor; 7d fallback when no/corrupt cursor. Validation accepts `auto` | `^\d+[dh]$` | ISO date.
- `--dry-run` = zero MuninnDB writes INCLUDING no cursor update; cursor READ under dry-run is allowed.
- Still-forbidden tools stay forbidden: `muninn_forget`, `muninn_state`, `muninn_consolidate`, `.luca/` writes, `luca` CLI mutations, LangSmith mutations.
- Cursor vault pinning: one-line body note that the cursor lives in the invoking repo's vault — running from another repo starts a fresh cursor there.
- Test strings that must survive verbatim: `` 'Any `Write` under `.luca/`' ``, `'luca state advance'`, `'queried read-only'`, `'Dedup search — mandatory before every create'`, `'would-be issues'`. Literal `'MuninnDB persistence is P2'` must disappear from the body.
- Files to change: ONLY `packages/luca-tools/src/artifacts/skills/trace-insights/index.ts` (body + description + header comment) and `index.test.ts`.

## Deferred (not this phase)

- Ledger join / per-phase dollar attribution → P3 (`todo:trace-insights-p3-ledger-join`).
- `luca init` metadata enrichment + weekly schedule → P4 (`todo:trace-insights-p4-enrichment-cadence`).
