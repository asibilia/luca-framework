---
"@alecsibilia/luca": patch
---

Add `/memory-audit` skill — paginated LLM-judged retro pass over MuninnDB vault.

- New `skills/memory-audit/SKILL.md` walks the active vault via hybrid pagination (`muninn_get_enrichment_candidates` cursor + semantic recall complement), judges each engram against the trust-tier discipline, and applies corrections via `muninn_trust`.
- New `commands/memory-audit.md` slash command shim with `--dry-run` (default), `--apply`, `--vault`, `--resume`, `--limit`, `--auto` flags.
- Resumable cursor state at `.planning/audits/memory/state.json`; per-run reports at `.planning/audits/memory/<ISO>.md`.
- `repo-cleanup.ts` ROOT_WHITELIST_DIRS now includes `audits` so complete-phase doesn't flag the audit directory.
- Hard prohibition on 11 MuninnDB write/mutation tools (`muninn_remember`, `muninn_remember_batch`, `muninn_forget`, `muninn_consolidate`, `muninn_evolve`, `muninn_link`, `muninn_state`, `muninn_decide`, `muninn_add_child`, `muninn_remember_tree`, `muninn_restore`) enforced by a fenced block and asserted by tests — audit only mutates trust tier via `muninn_trust`.
