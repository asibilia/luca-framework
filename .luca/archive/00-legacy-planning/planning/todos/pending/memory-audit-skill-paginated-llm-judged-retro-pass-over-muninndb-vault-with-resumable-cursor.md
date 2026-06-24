---
title: "memory-audit skill: paginated LLM-judged retro pass over MuninnDB vault with resumable cursor"
area: memory
created: 2026-05-08
priority: high
source: discuss
---

## Task

memory-audit skill: paginated LLM-judged retro pass over MuninnDB vault with resumable cursor

## Goal

Build a one-shot (and re-runnable) audit skill that walks every memory in the active vault, has the LLM judge each engram against the tier-decision rule, and applies trust corrections via `muninn_trust`. Resumable so large vaults don't bust context.

## Deliverables

- `packages/luca-mastracode/skills/memory-audit/SKILL.md` — paginates vault using `muninn_get_enrichment_candidates` or a paginated entity-walk, judges each memory in batches of 10–20, calls `muninn_trust(id, tier)`, writes per-run report.
- `packages/luca-mastracode/commands/memory-audit.md` — `/memory-audit` slash command shim (matches the luca-init pattern).
- Report path: `.planning/audits/memory/<ISO-timestamp>.md` (per-run, append-only history).
- Cursor state: `.planning/audits/memory/state.json` — `{ vault, cursor, lastRunAt, totalsByTier, judgmentLog }`. Resumable: re-running the skill reads cursor, picks up where it stopped, completes vault, then writes a final summary report.
- Add `.planning/audits/` to ROOT_WHITELIST in `repo-cleanup.ts` so complete-phase doesn't flag it.

## Tier-decision rule (skill prompt)

```
verified — content cites a specific source (file:line+SHA, PR-id, user-message-id, external URL) AND claim is testable from that source AND content is factual not interpretive.
external — content imported from outside this repo (rare; e.g. seeded preferences memory).
inferred — DEFAULT. Patterns, lessons, opinions, predictions, recommendations.
untrusted — never assigned by an agent (reserved for human override).
```

## Skill flow

1. Read `state.json` (or seed empty if first run). Determine vault from `.planning/config.json` → `muninn.vault`.
2. Page through vault in batches of 20 memories. For each batch, render an LLM-judging prompt that includes the tier rule + the memory content/summary/entities, and ask for `{id, currentTier, suggestedTier, rationale}`.
3. For each judgment where `suggestedTier !== currentTier`, call `muninn_trust(id, suggestedTier)`.
4. Append batch judgments to the report and update cursor + totalsByTier in state.json.
5. On vault exhaustion: write a final "complete" report with totals, top promotions, top demotions.
6. If interrupted (context limit, error), state.json holds the last persisted cursor — next `/memory-audit` resumes.

## Tests

- Cursor resumability: simulate vault of 50 memories, run with batch=20, assert state.json cursor advances correctly across 3 invocations.
- Report format: snapshot test on a fixture-vault run.
- Idempotency: re-running on a fully-audited vault produces a no-op report.

## Out of scope

- Bulk merge/forget — audit only adjusts trust tier.
- Cross-vault audit — single-vault per run.
