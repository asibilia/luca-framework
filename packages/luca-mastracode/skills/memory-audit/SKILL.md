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
  trust-tier changes. Pass `--auto` with `--apply` to skip per-promotion
  confirmation prompts.
---

# memory-audit Skill

Audit the active MuninnDB vault. Walk every reachable engram. For each, judge whether its current trust tier matches the discipline. Promote or demote via `mcp__muninn__muninn_trust`. Persist a resumable cursor and a per-run report so re-invocations pick up where the previous run stopped and the judgment history is durable.

## Scope guard — read first

This skill is **read-then-trust only**. It mutates trust tier and nothing else. Trust mutations: `verified` and `inferred` only (never `untrusted`; `external` is left untouched).

<!-- forbidden-tools-list-start -->

The following MuninnDB tools are FORBIDDEN inside this skill. Do not call them under any circumstance, even if the audit surfaces a "duplicate" or "stale" engram:

- `mcp__muninn__muninn_remember`
- `mcp__muninn__muninn_remember_batch`
- `mcp__muninn__muninn_forget`
- `mcp__muninn__muninn_consolidate`
- `mcp__muninn__muninn_evolve`
- `mcp__muninn__muninn_link`
- `mcp__muninn__muninn_state`
- `mcp__muninn__muninn_decide`
- `mcp__muninn__muninn_add_child`
- `mcp__muninn__muninn_remember_tree`
- `mcp__muninn__muninn_restore`

If a memory looks wrong, log it in the report. Do not delete, link, decide, restore, transition state, or otherwise mutate it.

<!-- forbidden-tools-list-end -->

## Tier rule (canonical)

The skill judges each engram against this rule. The rule is the single source of truth — do not invent additional tiers.

- **`verified`** — content cites a specific source (file:line+SHA, PR id, user-message id, external URL) AND the claim is testable from that source AND content is factual not interpretive. Promotion to `verified` requires citation evidence to be present in the engram content.
- **`inferred`** — DEFAULT. Patterns, lessons, opinions, predictions, recommendations, AI-derived findings. This is the engine default; assigning `inferred` is always safe.
- **`external`** — imported from outside this repo (rare; e.g. seeded preferences memory). Leave untouched.
- **`untrusted`** — never assigned by an agent. Reserved for human override. Do not emit.

### Citation-presence check (gate for `verified`)

A memory may be promoted to `verified` only if its content (or `summary` field) contains at least one of:

1. A file path with a line number — `\b\w[\w/.\-]+\.(?:ts|tsx|js|jsx|py|go|rs|md|json):\d+\b`
2. A commit SHA, PR id, ULID, or issue id — `\b[a-f0-9]{7,40}\b` OR `#\d+` OR `01[A-Z0-9]{24}`
3. An absolute URL — `\bhttps?://\S+`
4. A quoted source attribution AND a verifiable reference (e.g. `"per user @alec on 2026-05-07 in PR #143"` — bare quoted prose without a verifiable anchor does NOT pass).

If none of these are present, the proposed tier is `inferred` regardless of how factual the content sounds.

## Arguments

- `--dry-run` (default ON) — judge memories, write report, **do not call** `mcp__muninn__muninn_trust`.
- `--apply` — required to actually mutate trust tiers. If `--dry-run` is also present, dry-run wins (apply is suppressed; a warning is logged).
- `--auto` — only meaningful with `--apply`. Skips per-promotion `ask_user` confirmation. Without `--auto`, every `verified` promotion AND every `verified → inferred` demotion requires explicit user approval.
- `--vault <name>` — override the resolved vault. Must match `^[a-zA-Z0-9_\-]{1,64}$`.
- `--resume` — read cursor from `.planning/audits/memory/state.json` and continue from there.
- `--limit <n>` — max engrams to process this invocation (default 50, max 200; bounded by underlying MCP tool).

Vault resolution: `.planning/config.json` → `muninn.vault`, fallback `"default"`.

### Pre-flight argument validation

Before Step 1, validate arguments:

1. If both `--dry-run` and `--apply` are present: clear `--apply`, log warning "dry-run wins; mutations suppressed". Do not abort.
2. If `--limit <n>` is set: clamp to `[1, 200]`. If `n < 1`, error and abort.
3. If `--vault <name>` is set: assert `name` matches `^[a-zA-Z0-9_\-]{1,64}$`. If not, error and abort.
4. If `--auto` is set without `--apply`: log warning "`--auto` is a no-op without `--apply`" and proceed.

## State file schema

`.planning/audits/memory/state.json`:

```json
{
  "vault": "<resolved-vault-name>",
  "cursor": "<opaque-string-or-empty>",
  "lastRunAt": "<ISO-timestamp-or-empty>",
  "judgedByTier": { "verified": 0, "inferred": 0, "external": 0, "untrusted": 0 },
  "appliedByTier": { "verified": 0, "inferred": 0 },
  "totalProcessed": 0,
  "complete": false
}
```

Field semantics:

- `vault` — pinned at first call. Compared against the resolved vault on every resume; mismatch aborts the run.
- `lastRunAt` — empty string `""` on fresh seed. Set to the current ISO timestamp in Step 5 immediately before persisting state. The 24-hour idempotency guard reads this field and skips when it is `""`.
- `judgedByTier` — count of judgments emitted (incremented for every engram processed, regardless of mode).
- `appliedByTier` — count of `mcp__muninn__muninn_trust` calls that returned successfully (only `verified`/`inferred` tiers are mutated, so only those keys exist).
- `totalProcessed` — running total of engrams visited.
- `complete` — set `true` when both primary and semantic passes exhaust their cursors.

## Step 1 — Resolve vault and load state

1. Resolve vault: read `.planning/config.json` → `muninn.vault`; fall back to `"default"`. If `--vault <name>` was passed and it differs from the config-derived value, prefer `--vault` and log: "Using --vault override; differs from .planning/config.json".
2. Try to read `.planning/audits/memory/state.json`. If absent OR `--resume` is not set, seed a fresh state:
   ```
   { vault: <resolvedVault>, cursor: "", lastRunAt: "",
     judgedByTier: {verified:0,inferred:0,external:0,untrusted:0},
     appliedByTier: {verified:0,inferred:0},
     totalProcessed: 0, complete: false }
   ```
3. **Vault drift guard (always-on)**: if a state.json was loaded AND `state.vault` is non-empty AND `state.vault !== resolvedVault`, abort with: "Vault mismatch: state.json was created for vault '<state.vault>' but current resolution is '<resolvedVault>'. Delete state.json or pass --vault <state.vault> to resume against the original vault." This check fires regardless of how the vault was resolved (config.json, --vault override, fallback).
4. Validate the parsed state shape: `vault` non-empty string matching the vault regex, `cursor` is a string with `length <= 4096`, `complete` is a boolean, `totalProcessed` is a non-negative integer. On validation failure, treat state as corrupt: seed fresh state and log a warning in the report. Do not abort — re-scanning is safer than propagating a tampered cursor.
5. Idempotency guard: if `state.complete === true` AND `state.lastRunAt !== ""` AND parsing `state.lastRunAt` yields a timestamp within the last 24 hours, emit a no-op report ("vault was fully audited at <lastRunAt>; no work to do; new memories added since then may not have been audited") and exit. Do not call any MCP tool.

## Step 2 — Pre-apply confirmation gate

If `--apply` is in effect AND `--auto` is NOT set, before proceeding to pagination, prompt:

```
ask_user(
  question: "About to mutate trust tiers in vault '<resolvedVault>' with --apply. Trust changes are last-write-wins and effectively irreversible. Pass --auto to skip per-promotion prompts, or proceed with per-promotion confirmation.",
  options: [
    { label: "Proceed", description: "Continue; ask before each verified promotion or demotion" },
    { label: "Abort",   description: "Stop now; rerun with --dry-run to preview" }
  ]
)
```

If the user aborts, exit cleanly. If `--auto` is set, skip this gate and proceed.

## Step 3 — Paginate vault (hybrid cursor + semantic)

The MCP surface does **not** expose a generic `muninn_list`. Use a hybrid pass:

1. **Primary cursor pass** — call `mcp__muninn__muninn_get_enrichment_candidates(vault, cursor: state.cursor, limit: argLimit)`. Iterate via `next_cursor` until exhausted or `--limit` reached. Walks under-enriched memories in ULID order.
2. **Semantic complement pass** (optional, only when primary is exhausted in this run) — `mcp__muninn__muninn_recall(vault, context: ["audit-coverage"], mode: "deep", limit: argLimit, threshold: 0.1)` plus a few diverse contexts to surface enriched memories the primary pass would miss. The `trust` field is included on each result — read it directly, no extra lookup needed.

For each batch, collect `{id, concept, content, summary, currentTrust}` tuples. Cap each LLM-judging round at 15 memories — if `argLimit > 15` or the MCP call returns more, split into sub-batches of 15 before judging. Add the coverage caveat to the report (see § Caveats).

## Step 4 — LLM-judge batch against tier rule

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

Increment `state.judgedByTier[proposedTrust] += 1` for every emitted judgment (regardless of mode).

When `--apply` is set AND `--auto` is NOT set, before applying a `verified` promotion OR a `verified → inferred` demotion, prompt:

```
ask_user(
  question: "<promote|demote> engram <id> ('<concept>') from <previousTrust> to <proposedTrust>? Cited evidence: <quote>",
  options: [
    { label: "Approve", description: "Apply mcp__muninn__muninn_trust(id, '<proposedTrust>')" },
    { label: "Skip",    description: "Leave at previousTrust" }
  ]
)
```

If `--auto` is set, the citation-presence check is the sole gate.

## Step 5 — Apply trust corrections (gated)

For each judgment where `proposedTrust !== previousTrust` AND the proposed tier is `verified` or `inferred`:

- If `--apply` is NOT in effect (dry-run): **do not call** `mcp__muninn__muninn_trust`. Log the proposed change to the report only. Do not increment `appliedByTier`.
- If `--apply` is in effect: call `mcp__muninn__muninn_trust(id, proposedTrust, vault)` for each id, sequentially. After each call returns successfully, increment `state.appliedByTier[proposedTrust] += 1`.

Increment `state.totalProcessed += batchSize` regardless of mode.

## Step 6 — Persist cursor and write report

**Ordering invariant**: write the cursor only AFTER all `mcp__muninn__muninn_trust` calls in the batch return. The cursor is **batch-granular** — if any trust call in the batch fails, log the failure to the report, do not advance the cursor, and exit. The next `--resume` re-processes the entire batch; `mcp__muninn__muninn_trust` is last-write-wins, so re-trusting the same tier is a no-op. `writePlanningFile` is non-atomic; idempotent re-trust on resume makes this safe.

1. Update `state.cursor` to the latest `next_cursor`. If primary pass exhausted and semantic complement also done, set `state.complete = true`.
2. Set `state.lastRunAt` to the current ISO timestamp (e.g. `2026-05-08T18:04:00Z`). This step is required — without it, the 24-hour idempotency guard in Step 1.5 cannot fire on the next run.
3. `writePlanningFile(action: "write", path: "audits/memory/state.json", scope: "root", content: JSON.stringify(state, null, 2))`.
4. Append a per-run report to `.planning/audits/memory/<lastRunAt-fs-safe>.md` (where `<lastRunAt-fs-safe>` is the ISO timestamp from `state.lastRunAt` with colons normalized to dashes, e.g. `2026-05-08T18-04-00Z.md`):

```markdown
# Memory Audit — <lastRunAt>

**Vault**: <vault>
**Mode**: <dry-run|apply>
**Started**: <lastRunAt>
**Batch processed**: <N>
**Cursor advanced**: <fromCursor> → <toCursor>

## Judgments

| id | concept | previousTrust | proposedTrust | rationale |
|----|---------|---------------|---------------|-----------|
| 01KR... | research:foo | inferred | verified | Content cites src/foo.ts:42 + URL https://... |
| ...    | ...          | ...      | ...      | ...                                            |

## Totals

- Judged this run: verified=<n>, inferred=<n>, external=<n> (untouched), untrusted=<n> (untouched)
- Applied this run: verified=<n>, inferred=<n>
- Cumulative processed: <totalProcessed>

## Notes

- See § Caveats below.
- Re-run with `--resume` to continue from cursor.
```

## Step 7 — Resume / completion

- If `state.complete === false` and the user did not pass `--limit`: print "More work remaining; run `/memory-audit --resume` to continue."
- If `state.complete === true`: print "Audit complete. Vault was walked at <lastRunAt>. New memories added since then may not have been audited; delete `state.json` or wait 24 h for delta re-audit."
- On any error from MCP, persist current cursor and exit with the error context in the report. Do not silently retry.

## Failure modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| `state.json` exists with different `vault` than current resolution | Vault changed under skill (config drift or `--vault` override) | Abort per Step 1.3; instruct user to delete `state.json` or pass matching `--vault` |
| `writePlanningFile` fails (path traversal, size limit) | Bad cursor or oversized report | Truncate report at 200 KB, persist cursor on next run |

## Caveats

- The audit is non-exhaustive — it covers under-enriched memories via cursor and a semantic-recall complement. Fully-enriched memories not surfaced by recall queries may not be visited until `muninn_list_all` exists.
- Trust corrections are last-write-wins. Run-history is the only durable record of prior judgments — see the per-run report files.
- Re-running on a complete vault produces a no-op summary; the skill does not re-walk unless 24 h have elapsed or `state.json` is deleted. Memories added after `state.complete` was set will not be visited until then.
