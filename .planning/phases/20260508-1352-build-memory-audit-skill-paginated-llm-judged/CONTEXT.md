# Context: /memory-audit skill

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Skill is markdown only — no new TS module beyond test | Skills are prompt injections; install-bundled-assets symlinks `skills/` whole. Zero installer code change. |
| D2 | Whitelist target is `ROOT_WHITELIST_DIRS` not `ROOT_WHITELIST` | Spec said wrong constant. `audits/` is a dir at .planning root. Lines 90-95. |
| D3 | No `muninn_list` — hybrid pagination | `muninn_get_enrichment_candidates(cursor)` primary; `muninn_recall(deep, since/before)` complementary. Skill documents non-exhaustive limitation. |
| D4 | `--dry-run` default ON; `--apply` flag required for mutations | LLM judgment unreliability on cold archived memories is CRITICAL risk. Default-safe. |
| D5 | Skill emits ONLY `verified` or `inferred` | Discipline: agents never assign `untrusted`. `external` left untouched. |
| D6 | Citation-presence check required for `verified` | Prevents speculation→verified corruption. Memory content must contain file path / PR id / URL / quoted source. |
| D7 | Per-memory confirm gate for `verified` in non-full-auto | Batch promotion to verified is the most dangerous failure mode. |
| D8 | Hard-prohibition block on muninn_remember/forget/consolidate/evolve in SKILL.md + CI regex test | Agent default behavior includes these. Must explicitly forbid. |
| D9 | Cursor advance AFTER trust calls per batch | Crash mid-batch = re-process is idempotent (last-write-wins). Reverse ordering loses progress. |
| D10 | State file at `.planning/audits/memory/state.json`; reports at `.planning/audits/memory/<ISO>.md` | Per-task spec. ROOT_WHITELIST_DIRS update covers both. |
| D11 | Use `writePlanningFileTool` for state + reports | Skill must run in mode with this tool (research/architect/execute/review/build/fast). Auto-mkdirs parents. |
| D12 | Slash command shim follows `commands/luca-init.md` template | 270-byte minimal pattern. `$ARGUMENTS` passthrough. |
| D13 | Tests: file existence + tier-marker present + forbidden-tool absence | No prior per-skill test pattern. Match `no-luca-leak.test.ts` regex-scan style. |
| D14 | Tier markers required on any muninn_remember in SKILL.md | callsite test scans `skills/`. Skill should NOT call muninn_remember at all (per D8) — but if it logs audit-summary memory, mark `inferred`. |
| D15 | Resolved vault pinned in state.json on first call | Mid-run config.json change won't cross-vault contaminate. Re-validate on resume. |
| D16 | Idempotent no-op on cursor-terminal + lastRunAt recent | Re-running fully-audited vault = summary report only, no API calls. |
| D17 | Batch size 10-15 memories per LLM judgment | Context budget; cursor resume handles vault-size scaling. |
| D18 | Each report logs `{id, concept, previous_trust, proposed_trust, rationale}` | Only durable judgment history (muninn_trust last-write-wins). muninn_provenance(id) recovers prior. |

## Constraints

- Skills run in caller agent context — tool surface = caller's surface.
- `mcp__muninn__muninn_<func>` double-prefix in all skill prose.
- `<!-- Tier: X -->` HTML comment required before any `muninn_remember` block.
- `writePlanningFileTool` 512 KB content limit (split large outputs).

## Out of Scope

- New MCP `muninn_list_all` tool (separate todo created).
- Bulk merge / forget / consolidate.
- Cross-vault audit (single-vault per run).
- Concurrent run safety (document single-run assumption).
- Report retention / pruning.
