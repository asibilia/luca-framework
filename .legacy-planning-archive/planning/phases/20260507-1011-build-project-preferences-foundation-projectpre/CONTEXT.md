# Context — Phase A Project Preferences Foundation

**Mode**: full-auto. Discussion subagent skipped; decisions taken from research recommendations.

## Decisions

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| D1 | Tool ↔ MuninnDB boundary | **(b)** Tool manages local cache + state flag; skill/instruction prose handles all MuninnDB I/O | Tools have no MCP access; (b) is testable, cache-coherent, survives MuninnDB outages |
| D2 | Persistence layer | `.planning/preferences.json` (authoritative cache) mirrored to MuninnDB on seed/update | Local cache always available; MuninnDB is async-enriched index for cross-repo discovery |
| D3 | Action surface | `consult`, `consult-section`, `seed`, `update`, `invalidate` | Five actions cover read/write/cache control. `seed` for first-time, `update` for incremental edits |
| D4 | Schema location | `src/state/project-preferences.ts` (shared module) | Schema consumed by tool + skill prose + future Phase B/C tools |
| D5 | Sentinel binding | Triage step 1.5 only; Phase B/C use `fallback: true` | Prevents execute-mode deadlock; preserves backward compat |
| D6 | Vault helper | Add `resolveProjectVault()` in `src/state/vault.ts` (Phase A scope, narrow use) | Pays D1 debt for new tool; full prose-site migration is separate todo |
| D7 | Skill name vs CLI command | Skill `/luca-init`, CLI `luca init` (vault setup) — DIFFERENT surfaces | CLI handles infra (vault auth); skill handles repo conventions |
| D8 | Concurrent seed safety | `op_id: "project-preferences:<vault>"` on `muninn_remember` | Established pattern (postmortem.ts:425) |
| D9 | Probing UX | Filesystem-first; show detected → single ask_user confirm; `--auto` for CI | Grill-me principle; Risk 9 mitigation |
| D10 | Schema versioning | `schemaVersion: z.literal(1).default(1)`; all fields optional+default; merge-on-seed | Risk 4: avoid Zod parse breakage when Phase B/C adds fields |

## Out of Scope (Phase A)

- Migrating 16 vault-resolution prose sites to use new helper (separate todo)
- Refactoring `ensureFeatureBranch` to consult preferences (Phase B)
- PR/release/changeset preference consumption (Phase C)
- Shared mode instruction prefix mechanism (separate todo)

## Versions Confirmed
- `@mastra/core`, `zod`, `typescript` — catalog-pinned (pnpm workspace catalog)
- luca-mastracode v11.6.0
