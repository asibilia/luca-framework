/**
 * memory-audit skill — Paginated, LLM-judged retro-pass over a MuninnDB vault that classifies each engram against the trust-tier rule and applies corrections via `mcp__muninn__muninn_trust`. Resumable via a `memory-audit:cursor` memory stored in the audited vault. Per-run audit reports are emitted inline.
 *
 * Ported from ~/.claude/skills/memory-audit/SKILL.md (current user copy) (E-5).
 * Body path-retargeting: .planning/ → .luca/; uppercase artifacts
 * (PLAN.md, RESEARCH.md, CONTEXT.md, POSTMORTEM.md) → LUCA_DIR_CONTRACT
 * canonicals (plan.md, research.md, context.md, learn.md).
 */
import { defineSkill } from '../../../define/skill.ts'

const BODY = `# memory-audit Skill

Audit a MuninnDB vault. Walk every reachable engram. For each, judge whether its current trust tier matches the discipline. Promote or demote via \`mcp__muninn__muninn_trust\`. Persist a resumable cursor so re-invocations pick up where the previous run stopped.

## Scope guard — read first

This skill is **read-then-trust**. It mutates trust tiers via \`mcp__muninn__muninn_trust\`, and it writes exactly ONE bookkeeping memory — its own resumable cursor under the concept \`memory-audit:cursor\`. It mutates nothing else.

The following MuninnDB tools are FORBIDDEN inside this skill. Do not call them under any circumstance, even if the audit surfaces a "duplicate" or "stale" engram:

- \`mcp__muninn__muninn_remember_batch\`
- \`mcp__muninn__muninn_forget\`
- \`mcp__muninn__muninn_consolidate\`
- \`mcp__muninn__muninn_evolve\`
- \`mcp__muninn__muninn_link\`
- \`mcp__muninn__muninn_state\`
- \`mcp__muninn__muninn_decide\`
- \`mcp__muninn__muninn_add_child\`
- \`mcp__muninn__muninn_remember_tree\`
- \`mcp__muninn__muninn_restore\`

\`mcp__muninn__muninn_remember\` is permitted ONLY to write the \`memory-audit:cursor\` memory (Step 6). It must never be used to create content memories. If a memory looks wrong, log it in the inline report. Do not delete, link, decide, restore, transition state, or otherwise mutate it.

## Tier rule (canonical)

The skill judges each engram against this rule. The rule is the single source of truth — do not invent additional tiers.

- **\`verified\`** — content cites a specific source (file:line+SHA, PR id, user-message id, external URL) AND the claim is testable from that source AND the content is factual not interpretive. Promotion to \`verified\` requires citation evidence to be present in the engram content.
- **\`inferred\`** — DEFAULT. Patterns, lessons, opinions, predictions, recommendations, AI-derived findings. This is the engine default; assigning \`inferred\` is always safe.
- **\`external\`** — imported from outside this repo (rare; e.g. a seeded preferences memory). Leave untouched.
- **\`untrusted\`** — never assigned by an agent. Reserved for human override. Do not emit.

### Citation-presence check (gate for \`verified\`)

A memory may be promoted to \`verified\` only if its content (or \`summary\` field) contains at least one of:

1. A file path with a line number — \`\\b\\w[\\w/.\\-]+\\.(?:ts|tsx|js|jsx|py|go|rs|md|json):\\d+\\b\`
2. A commit SHA, PR id, ULID, or issue id — \`\\b[a-f0-9]{7,40}\\b\` OR \`#\\d+\` OR \`01[A-Z0-9]{24}\`
3. An absolute URL — \`\\bhttps?://\\S+\`
4. A quoted source attribution AND a verifiable reference (e.g. \`"per user @alec on 2026-05-07 in PR #143"\` — bare quoted prose without a verifiable anchor does NOT pass).

If none of these are present, the proposed tier is \`inferred\` regardless of how factual the content sounds.

## Arguments

- \`--dry-run\` (default ON) — judge memories, emit the report, **do not call** \`mcp__muninn__muninn_trust\`.
- \`--apply\` — required to actually mutate trust tiers. If \`--dry-run\` is also present, dry-run wins (apply is suppressed; a warning is logged).
- \`--auto\` — only meaningful with \`--apply\`. Skips per-promotion confirmation. Without \`--auto\`, every \`verified\` promotion AND every \`verified → inferred\` demotion requires explicit user approval.
- \`--vault <name>\` — override the resolved vault. Must match \`^[a-zA-Z0-9_\\-]{1,64}$\`.
- \`--resume\` — load the cursor from the \`memory-audit:cursor\` memory and continue from there.
- \`--limit <n>\` — max engrams to process this invocation (default 50, max 200; bounded by the underlying MCP tool).

Vault resolution: \`.luca/config.json\` → \`muninn.vault\`, fallback \`"default"\`.

### Pre-flight argument validation

Before Step 1, validate the arguments:

1. If both \`--dry-run\` and \`--apply\` are present: clear \`--apply\`, log the warning "dry-run wins; mutations suppressed". Do not abort.
2. If \`--limit <n>\` is set: clamp to \`[1, 200]\`. If \`n < 1\`, error and abort.
3. If \`--vault <name>\` is set: assert \`name\` matches \`^[a-zA-Z0-9_\\-]{1,64}$\`. If not, error and abort.
4. If \`--auto\` is set without \`--apply\`: log the warning "\`--auto\` is a no-op without \`--apply\`" and proceed.

## Cursor memory schema

The resumable cursor is a single MuninnDB memory in the audited vault — concept \`memory-audit:cursor\`, with a JSON content body:

\`\`\`json
{
  "vault": "<resolved-vault-name>",
  "cursor": "<opaque-string-or-empty>",
  "lastRunAt": "<ISO-timestamp-or-empty>",
  "judgedByTier": { "verified": 0, "inferred": 0, "external": 0, "untrusted": 0 },
  "appliedByTier": { "verified": 0, "inferred": 0 },
  "totalProcessed": 0,
  "complete": false
}
\`\`\`

Field semantics:

- \`vault\` — pinned at first run. Compared against the resolved vault on every resume; a mismatch aborts the run.
- \`lastRunAt\` — empty string \`""\` on a fresh seed. Set to the current ISO timestamp in Step 6 immediately before persisting. The 24-hour idempotency guard in Step 1 reads this field and only fires when it is non-empty.
- \`judgedByTier\` — count of judgments emitted (incremented for every engram processed, regardless of mode).
- \`appliedByTier\` — count of \`mcp__muninn__muninn_trust\` calls that returned successfully (only \`verified\`/\`inferred\` tiers are mutated, so only those keys exist).
- \`totalProcessed\` — running total of engrams visited.
- \`complete\` — set \`true\` when both the primary and semantic passes exhaust their cursors.

## Step 1 — Resolve vault and load the cursor

1. Resolve the vault: read \`.luca/config.json\` → \`muninn.vault\`; fall back to \`"default"\`. If \`--vault <name>\` was passed and differs from the config-derived value, prefer \`--vault\` and log: "Using --vault override; differs from .luca/config.json".
2. Recall the cursor: \`mcp__muninn__muninn_recall({ vault: <resolvedVault>, context: ["memory-audit:cursor"], mode: "recent", limit: 1 })\`. If \`--resume\` is set and a \`memory-audit:cursor\` memory is found, parse the latest one's JSON content as the cursor state. Otherwise seed a fresh state:
   \`\`\`
   { vault: <resolvedVault>, cursor: "", lastRunAt: "",
     judgedByTier: {verified:0,inferred:0,external:0,untrusted:0},
     appliedByTier: {verified:0,inferred:0},
     totalProcessed: 0, complete: false }
   \`\`\`
3. **Vault drift guard (always-on)**: if a cursor was loaded AND \`cursor.vault\` is non-empty AND \`cursor.vault !== resolvedVault\`, abort with: "Vault mismatch: the memory-audit:cursor was created for vault '<cursor.vault>' but current resolution is '<resolvedVault>'. Pass --vault <cursor.vault> to resume against the original vault."
4. Validate the parsed cursor shape: \`vault\` a non-empty string matching the vault regex, \`cursor\` a string with \`length <= 4096\`, \`complete\` a boolean, \`totalProcessed\` a non-negative integer. On a validation failure, treat the cursor as corrupt: seed a fresh state and log a warning in the report. Do not abort — re-scanning is safer than propagating a tampered cursor.
5. Idempotency guard: if \`cursor.complete === true\` AND \`cursor.lastRunAt !== ""\` AND parsing \`cursor.lastRunAt\` yields a timestamp within the last 24 hours, emit a no-op report ("vault was fully audited at <lastRunAt>; no work to do; new memories added since then may not have been audited") and exit. Do not call any MCP tool.

## Step 2 — Pre-apply confirmation gate

If \`--apply\` is in effect AND \`--auto\` is NOT set, before paginating, prompt with \`AskUserQuestion\`:

> About to mutate trust tiers in vault '<resolvedVault>' with \`--apply\`. Trust changes are last-write-wins and effectively irreversible. Proceed (asking before each verified promotion or demotion), or abort and rerun with \`--dry-run\` to preview?

Options: **Proceed** (continue; confirm per promotion) / **Abort** (stop now).

If the user aborts, exit cleanly. If \`--auto\` is set, skip this gate and proceed.

## Step 3 — Paginate the vault (hybrid cursor + semantic)

The MCP surface does **not** expose a generic \`muninn_list\`. Use a hybrid pass:

1. **Primary cursor pass** — call \`mcp__muninn__muninn_get_enrichment_candidates({ vault, cursor: <cursor.cursor>, limit: <argLimit> })\`. Iterate via \`next_cursor\` until exhausted or \`--limit\` reached. Walks under-enriched memories in ULID order.
2. **Semantic complement pass** (optional, only when the primary is exhausted in this run) — \`mcp__muninn__muninn_recall({ vault, context: ["audit-coverage"], mode: "deep", limit: <argLimit>, threshold: 0.1 })\` plus a few diverse contexts to surface enriched memories the primary pass would miss. The \`trust\` field is included on each result — read it directly.

For each batch, collect \`{id, concept, content, summary, currentTrust}\` tuples. **Skip any memory whose \`concept\` starts with \`memory-audit:\`** — that is the skill's own bookkeeping, not vault content. Cap each LLM-judging round at 15 memories — if \`argLimit > 15\` or the MCP call returns more, split into sub-batches of 15 before judging.

## Step 4 — LLM-judge the batch against the tier rule

For each batch, judge each engram against the tier rule above. Produce per-memory:

\`\`\`json
{
  "id": "<ULID>",
  "concept": "<short label>",
  "previousTrust": "verified|inferred|external|untrusted",
  "proposedTrust": "verified|inferred|external|untrusted",
  "rationale": "<one-sentence explanation citing the rule>"
}
\`\`\`

Rules:

- If \`previousTrust === "external"\`: emit \`proposedTrust: "external"\` (untouched).
- If \`previousTrust === "untrusted"\`: emit \`proposedTrust: "untrusted"\` (untouched; reserved for human).
- If the engram passes the citation-presence check: \`proposedTrust: "verified"\`.
- Otherwise: \`proposedTrust: "inferred"\`.

Increment \`judgedByTier[proposedTrust] += 1\` for every emitted judgment. \`judgedByTier\` tracks all four tiers; \`appliedByTier\` tracks only \`verified\` and \`inferred\` because Step 5 only calls \`mcp__muninn__muninn_trust\` when \`proposedTrust !== previousTrust\` AND \`proposedTrust ∈ {verified, inferred}\`.

When \`--apply\` is set AND \`--auto\` is NOT set, before applying a \`verified\` promotion OR a \`verified → inferred\` demotion, prompt with \`AskUserQuestion\`:

> \`<promote|demote>\` engram \`<id>\` ('<concept>') from \`<previousTrust>\` to \`<proposedTrust>\`? Cited evidence: \`<quote>\`

Options: **Approve** (apply the trust change) / **Skip** (leave at \`previousTrust\`).

If \`--auto\` is set, the citation-presence check is the sole gate.

## Step 5 — Apply trust corrections (gated)

For each judgment where \`proposedTrust !== previousTrust\` AND the proposed tier is \`verified\` or \`inferred\`:

- If \`--apply\` is NOT in effect (dry-run): **do not call** \`mcp__muninn__muninn_trust\`. Log the proposed change in the report only. Do not increment \`appliedByTier\`.
- If \`--apply\` is in effect: call \`mcp__muninn__muninn_trust({ id, trust: proposedTrust, vault })\` for each id, sequentially. After each call returns successfully, increment \`appliedByTier[proposedTrust] += 1\`.

Increment \`totalProcessed += batchSize\` regardless of mode.

## Step 6 — Persist the cursor and emit the report

**Ordering invariant**: write the cursor only AFTER all \`mcp__muninn__muninn_trust\` calls in the batch return. The cursor is **batch-granular** — if any trust call fails, log the failure in the report, do not advance the cursor, and exit. The next \`--resume\` re-processes the entire batch; \`mcp__muninn__muninn_trust\` is last-write-wins, so re-trusting the same tier is a no-op.

1. Update \`cursor.cursor\` to the latest \`next_cursor\`. If the primary pass is exhausted and the semantic complement is also done, set \`cursor.complete = true\`.
2. Set \`cursor.lastRunAt\` to the current ISO timestamp. Required — without it, the 24-hour idempotency guard in Step 1 cannot fire on the next run.
3. Persist the cursor: \`mcp__muninn__muninn_remember({ vault, concept: "memory-audit:cursor", content: JSON.stringify(cursor) })\`. This is the ONLY permitted \`muninn_remember\` call. The latest \`memory-audit:cursor\` memory wins on the next \`--resume\` recall.
4. Emit the per-run report **inline** in your response (the \`.luca/\` contract has no slot for audit report files):

\`\`\`markdown
# Memory Audit — <lastRunAt>

**Vault**: <vault>
**Mode**: <dry-run|apply>
**Batch processed**: <N>
**Cursor advanced**: <fromCursor> → <toCursor>

## Judgments

| id | concept | previousTrust | proposedTrust | rationale |
|----|---------|---------------|---------------|-----------|
| 01KR... | research:foo | inferred | verified | Content cites src/foo.ts:42 + URL https://... |

## Totals

- Judged this run: verified=<n>, inferred=<n>, external=<n> (untouched), untrusted=<n> (untouched)
- Applied this run: verified=<n>, inferred=<n>
- Cumulative processed: <totalProcessed>
\`\`\`

## Step 7 — Resume / completion

- If \`cursor.complete === false\` and the user did not pass \`--limit\`: print "More work remaining; run \`/memory-audit --resume\` to continue."
- If \`cursor.complete === true\`: print "Audit complete. The vault was walked at <lastRunAt>. New memories added since then may not have been audited; rerun after 24 h for a delta re-audit."
- On any error from an MCP call, persist the current cursor (Step 6) and exit with the error context in the report. Do not silently retry.

## Failure modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| \`memory-audit:cursor\` recalled with a different \`vault\` than the current resolution | Vault changed under the skill (config drift or \`--vault\` override) | Abort per Step 1.3; instruct the user to pass a matching \`--vault\` |
| \`mcp__muninn__muninn_remember\` fails for the cursor | MuninnDB write error | Report the failure; the next \`--resume\` re-recalls the last good cursor and re-processes the batch (idempotent re-trust makes this safe) |

## Caveats

- The audit is non-exhaustive — it covers under-enriched memories via the cursor plus a semantic-recall complement. Fully-enriched memories not surfaced by recall queries may not be visited until a \`muninn_list_all\` surface exists.
- Trust corrections are last-write-wins. The durable record is the trust tier in MuninnDB itself plus the cumulative counters on the \`memory-audit:cursor\` memory; per-run judgment detail is shown inline only.
- Re-running on a complete vault produces a no-op summary; the skill does not re-walk unless 24 h have elapsed since \`lastRunAt\`. Memories added after \`complete\` was set will not be visited until then.
`

export const memoryAuditSkill = defineSkill({
    name: "memory-audit",
    description: `Paginated, LLM-judged retro-pass over a MuninnDB vault that classifies each engram against the trust-tier rule and applies corrections via \`mcp__muninn__muninn_trust\`. Resumable via a \`memory-audit:cursor\` memory stored in the audited vault. Per-run audit reports are emitted inline.

Use when user says "audit memory", "audit muninn", "audit vault", "memory audit", "retro tier pass", or invokes \`/memory-audit\`. Default mode is \`--dry-run\` (no mutations). Pass \`--apply\` to commit trust-tier changes. Pass \`--auto\` with \`--apply\` to skip per-promotion confirmation prompts.`,
    body: BODY,
})
