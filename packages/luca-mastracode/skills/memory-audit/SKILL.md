---
name: memory-audit
description: >
  Paginated, LLM-judged retro-pass over the active MuninnDB vault that classifies
  each engram against the trust-tier rule and applies corrections via
  `mcp__muninn__muninn_trust`. Resumable cursor at `.planning/audits/memory/state.json`.
  Per-run audit reports at `.planning/audits/memory/<ISO>.md`.

  Use when user says "audit memory", "audit muninn", "audit vault",
  "memory audit", "retro tier pass", or invokes `/memory-audit`.
  Default mode is `--dry-run` (no mutations). Pass `--apply` to commit
  trust-tier changes.
---

# memory-audit Skill

Audit the active MuninnDB vault. Walk every reachable engram. For each, judge whether its current trust tier matches the discipline. Promote or demote via `mcp__muninn__muninn_trust`. Persist a resumable cursor and a per-run report so re-invocations pick up where the previous run stopped and the judgment history is durable.

## Scope guard — read first

This skill is **read-then-trust only**. It never creates, deletes, merges, evolves, or consolidates engrams. The trust tier is the only state it mutates.

<!-- forbidden-tools-list-start -->

The following MuninnDB tools are FORBIDDEN inside this skill. Do not call them under any circumstance, even if the audit surfaces a "duplicate" or "stale" engram:

- `mcp__muninn__muninn_remember`
- `mcp__muninn__muninn_remember_batch`
- `mcp__muninn__muninn_forget`
- `mcp__muninn__muninn_consolidate`
- `mcp__muninn__muninn_evolve`

If a memory looks wrong, log it in the report. Do not delete it.

<!-- forbidden-tools-list-end -->

This skill never assigns `untrusted` or modifies `external` tier memories. Only `verified` and `inferred` are emitted.

## Tier rule (canonical)

The skill judges each engram against this rule. The rule is the single source of truth — do not invent additional tiers.

- **`verified`** — content cites a specific source (file:line+SHA, PR id, user-message id, external URL) AND the claim is testable from that source AND content is factual not interpretive. Promotion to `verified` requires citation evidence to be present in the engram content.
- **`inferred`** — DEFAULT. Patterns, lessons, opinions, predictions, recommendations, AI-derived findings. This is the engine default; assigning `inferred` is always safe.
- **`external`** — imported from outside this repo (rare; e.g. seeded preferences memory). Leave untouched.
- **`untrusted`** — never assigned by an agent. Reserved for human override. Do not emit.

### Citation-presence check (gate for `verified`)

A memory may be promoted to `verified` only if its content (or `summary` field) contains at least one of:

1. A file path with a line number (e.g. `src/foo.ts:42`).
2. A commit SHA, PR id, or issue id (e.g. `#143`, `01KR1...` ULID, `a1b2c3d4`).
3. An absolute URL.
4. A quoted source attribution (e.g. `"per user @alec on 2026-05-07"`).

If none of these are present, the proposed tier is `inferred` regardless of how factual the content sounds.

## Arguments

- `--dry-run` (default ON) — judge memories, write report, **do not call** `mcp__muninn__muninn_trust`.
- `--apply` — required to actually mutate trust tiers. Combine with `--dry-run` is a no-op (dry-run wins).
- `--vault <name>` — override the resolved vault.
- `--resume` — read cursor from `.planning/audits/memory/state.json` and continue from there.
- `--limit <n>` — max engrams to process this invocation (default 50, max 200; bounded by underlying MCP tool).

Vault resolution: `.planning/config.json` → `muninn.vault`, fallback `"default"`.

## State file schema

`.planning/audits/memory/state.json`:

```json
{
  "vault": "<resolved-vault-name>",
  "cursor": "<opaque-string-or-empty>",
  "runId": "<ISO-timestamp>",
  "lastRunAt": "<ISO-timestamp>",
  "totalsByTier": { "verified": 0, "inferred": 0, "external": 0, "untrusted": 0 },
  "totalProcessed": 0,
  "complete": false
}
```

`vault` is pinned at first call; if `--vault` differs from the persisted vault, abort with an error (cross-vault contamination guard).

## Step 1 — Resolve vault and load state

1. Read `.planning/config.json` → `muninn.vault`. Fallback `"default"`. If `--vault <name>` is passed, use that instead but warn if it differs from config.
2. Try to read `.planning/audits/memory/state.json`. If absent or `--resume` is not set, seed an empty state (cursor `""`, totals 0, `complete: false`, `runId` = current ISO timestamp).
3. If `state.complete === true` AND `state.lastRunAt` is within the last 24 hours: emit a no-op report (`"vault was fully audited at <lastRunAt>; no work to do"`) and exit. Do not call any MCP tool.
4. Pin the resolved `vault` into the state object for this run.

## Step 2 — Paginate vault (hybrid cursor + semantic)

The MCP surface does **not** expose a generic `muninn_list`. Use a hybrid pass:

1. **Primary cursor pass** — call `mcp__muninn__muninn_get_enrichment_candidates(vault, cursor: state.cursor, limit: argLimit)`. Iterate via `next_cursor` until exhausted or `--limit` reached. This walks under-enriched memories in ULID order.
2. **Semantic complement pass** (optional, only when primary is exhausted in this run) — `mcp__muninn__muninn_recall(vault, context: ["audit-coverage"], mode: "deep", limit: argLimit, threshold: 0.1)` plus a few diverse contexts to surface enriched memories the primary pass would miss. The `trust` field is included on each result — read it directly, no extra lookup needed.

Document this limitation in the report: the audit cannot guarantee exhaustive enumeration until `muninn_list_all` exists.

For each batch, collect `{id, concept, content, summary, currentTrust}` tuples (10–15 memories per LLM-judging round to stay within context budget).

## Step 3 — LLM-judge batch against tier rule

For each batch, judge each engram against the tier rule above. Produce per-memory:

```json
{
  "id": "<ULID>",
  "concept": "<short label>",
  "previousTrust": "verified|inferred|external|untrusted",
  "proposedTrust": "verified|inferred",
  "rationale": "<one-sentence explanation citing the rule>"
}
```

Rules:

- If `previousTrust === "external"`: emit `proposedTrust: "external"` (untouched).
- If `previousTrust === "untrusted"`: emit `proposedTrust: "untrusted"` (untouched; reserved for human).
- If the engram passes the citation-presence check: `proposedTrust: "verified"`.
- Otherwise: `proposedTrust: "inferred"`.

In non-`full-auto` oversight, when a `verified` promotion is proposed, gate it with `ask_user`:

```
ask_user(
  question: "Promote engram <id> ('<concept>') to verified? Cited evidence: <quote>",
  options: [
    { label: "Approve", description: "Apply muninn_trust(id, 'verified')" },
    { label: "Skip",    description: "Leave at previousTrust" }
  ]
)
```

In `full-auto`, skip the prompt — citation-presence check is the sole gate.

## Step 4 — Apply trust corrections (gated)

For each judgment where `proposedTrust !== previousTrust` AND the proposed tier is `verified` or `inferred`:

- If `--dry-run` is in effect: **do not call** `mcp__muninn__muninn_trust`. Log the proposed change to the report only.
- If `--apply` is in effect: call `mcp__muninn__muninn_trust(id, proposedTrust, vault)` for each id, sequentially.

Update `state.totalsByTier[proposedTrust] += 1` per applied change. Increment `state.totalProcessed += batchSize`.

## Step 5 — Persist cursor and write report

**Ordering invariant**: write the cursor only AFTER all `mcp__muninn__muninn_trust` calls in the batch return. If a crash occurs between trust calls and cursor persist, the next `--resume` will re-process the batch — `mcp__muninn__muninn_trust` is last-write-wins, so re-trusting the same tier is a no-op. Reverse ordering loses progress.

`writePlanningFile` is non-atomic; idempotent re-trust on resume makes this safe.

1. Update `state.cursor` to the latest `next_cursor`. If primary pass exhausted and semantic complement also done, set `state.complete = true`.
2. `writePlanningFile(action: "write", path: "audits/memory/state.json", scope: "root", content: JSON.stringify(state, null, 2))`.
3. Append a per-run report to `.planning/audits/memory/<runId>.md` (where `<runId>` is the ISO timestamp from state, e.g. `2026-05-08T18-04-00Z.md` — colons normalized to dashes for filesystem safety):

```markdown
# Memory Audit — <runId>

**Vault**: <vault>
**Mode**: <dry-run|apply>
**Started**: <runId>
**Batch processed**: <N>
**Cursor advanced**: <fromCursor> → <toCursor>

## Judgments

| id | concept | previousTrust | proposedTrust | rationale |
|----|---------|---------------|---------------|-----------|
| 01KR... | research:foo | inferred | verified | Content cites src/foo.ts:42 + URL https://... |
| ...    | ...          | ...      | ...      | ...                                            |

## Totals (cumulative for this run)

- verified: <n>
- inferred: <n>
- external: <n> (untouched)
- untrusted: <n> (untouched)

## Notes

- Coverage caveat: hybrid pagination is non-exhaustive until `muninn_list_all` exists.
- Re-run with `--resume` to continue from cursor.
```

## Step 6 — Resume / completion

- If `state.complete === false` and the user did not pass `--limit`: print "More work remaining; run `/memory-audit --resume` to continue."
- If `state.complete === true`: print "Audit complete. Vault was walked at <lastRunAt>. Re-run after 24 h for delta re-audit."
- On any error from MCP, persist current cursor and exit with the error context in the report. Do not silently retry.

## Failure modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| `state.json` exists with different `vault` | Vault changed under skill | Abort, instruct user to delete `state.json` or pass matching `--vault` |
| `mcp__muninn__muninn_get_enrichment_candidates` returns 0 items at start | Vault fully enriched | Skip primary pass, run semantic complement only |
| `mcp__muninn__muninn_trust` returns error | Invalid id or vault | Log to report, do not advance cursor for that id |
| `writePlanningFile` fails (path traversal, size limit) | Bad cursor or oversized report | Truncate report at 200 KB, persist cursor on next run |
| User passed `--apply` and `--dry-run` together | Conflicting flags | dry-run wins; print warning |

## Caveats

- The audit is non-exhaustive — it covers under-enriched memories via cursor and a semantic-recall complement. Fully-enriched memories not surfaced by recall queries may not be visited.
- Trust corrections are last-write-wins. Run-history is the only durable record of prior judgments — see the per-run report files.
- Re-running on a complete vault produces a no-op summary; the skill does not re-walk unless 24 h have elapsed or `state.json` is deleted.
