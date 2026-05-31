---
"@alecsibilia/luca": patch
---

Add write-time trust-tier discipline at all `muninn_remember` callsites. New `MEMORY_TIER_DISCIPLINE` constant (single source of truth) is injected into both the mode-agent prefix (`agent-constraints.ts`) and the subagent prefix (`subagents/shared-prefix.ts`). Verified-tier writes get an explicit `muninn_trust` follow-up via the 2-RPC pattern (`muninn_remember` returns id → `muninn_trust(id, "verified", vault)`). Three prose-snapshot tests guard the contract: `memory-tier-prefix` (constant + dual injection), `memory-tier-callsite` (every `muninn_remember(` site has a tier marker within 30 lines preceding), and `memory-tier-verified-followup` (every verified marker has a `muninn_trust(` follow-up within 50 lines).
