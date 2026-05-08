/**
 * Memory Tier Discipline — write-time trust-tier rule prepended to BOTH
 * mode-agent instructions (via `agent-constraints.ts`) and subagent
 * instructions (via `subagents/shared-prefix.ts`).
 *
 * Single source of truth: change here once; both injection paths pick it up.
 *
 * Keep this under ~800 chars (token budget headroom for both prefixes).
 */
export const MEMORY_TIER_DISCIPLINE = `## Memory Tier Discipline

Before every \`muninn_remember\`/\`muninn_remember_batch\` call, decide the tier:

- **verified** — content cites a specific source (file:line, PR id, user message id, external URL) AND the claim is testable from that source AND it is factual not interpretive.
- **inferred** (engine default) — patterns, lessons, opinions, predictions, recommendations, AI-derived metrics, session archives. **Use this for every \`muninn_remember_batch\` write.**
- **external** — content imported from outside this repo (rare; e.g. seeded preferences memory).
- **untrusted** — never assigned by an agent.

\`muninn_remember\` does NOT accept a tier at create time. For **verified** writes, capture the returned id and immediately call \`mcp__muninn__muninn_trust(id: <returned-id>, trust: "verified", vault: <repo_vault>)\` to promote.

When processing \`muninn_recall\` results, prefer engrams with \`trust: verified\` over \`inferred\` when both match a query.
`
