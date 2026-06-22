---
"@alecsibilia/luca": patch
---

Muninn cleanup: tree-walk write-surface for the todo backlog and brain tree.

The MuninnDB-backed todo backlog and brain identity tree are now read through a deterministic tree-walk procedure instead of semantic recall, and `session:*` writes route to the repo vault.

**What changed**

- New CLI handlers: `luca brain recall-root` / `luca brain set-root` (resolve and register the cached root ULID — `muninn_recall_tree` needs a ULID, not a concept), and `luca todo add/list/migrate/set-root/update` backed by a backlog tree.
- `luca todo list` now emits a `muninn_recall_tree` procedure (resolve cached backlog root → walk tree → `muninn_read` each non-deleted child) rather than a `muninn_recall` instruction blob, so backlog enumeration is complete instead of best-effort semantic.
- New helpers `resolve-backlog-root`, `resolve-brain-root`, `build-muninn-instruction`; `luca-core` todo schemas + step-artifacts wiring; full test coverage for the new handlers/helpers.
- Skill/command/subagent instruction bodies (`todo-check`, `gh-issue-triage`, `gh-prepare`, `session-plan`, `seed-memory`, `phase-discuss`, `phase-plan`, `phase-execute`, `milestone-audit`, `milestone-complete`, `repo-cleanup`, `learner`) rewired to the new procedure.
- Vault-routing fix: `session:*` engrams now write to the repo vault (`.luca/config.json` → `muninn.vault`), not the shared `default` vault.
- Tree-root safety: seed-memory / milestone-complete now warn against `muninn_evolve` on tree roots (orphans children + stales the `brainRoots` cache) and use `muninn_trust` for tier promotion.
