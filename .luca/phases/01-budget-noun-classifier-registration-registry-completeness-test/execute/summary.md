# Execution Summary — Phase 01: budget noun classifier registration + registry-completeness test

## Status: all 4 tasks complete (2 waves)

| Wave | Task | File | Status | Evidence |
|------|------|------|--------|----------|
| 1 | 1.1.1 classifier edits | hook/helpers/classify-bash-command.ts | complete (staged) | budget/confidence/graph/status/statusline/start/stop registered; READ_VERBS += summary/render/gate with G-ARCH-001 leak comment; 3 sets exported; 86 tests green |
| 1 | 1.1.2 CLI export | cli.ts | complete (staged) | `export const CLI_SUBCOMMANDS` hoist (satisfies SubCommandsDef), 34 keys byte-identical; run.ts smoke exit 0 |
| 2 | 1.2.1 registry test | classify-bash-command-registry.test.ts (new) | complete (staged) | 65 pass: inv-1 31 noun-coverage, inv-2 16 verb-equality (thunk-resolved), inv-3 16 dead-entry, +hook disjointness |
| 2 | 1.2.2 behavioral cases | classify-bash-command.test.ts | complete (staged) | +7 cases (budget check→luca-write; confidence read/summary/gate/render→readonly; graph→readonly; statusline→luca-write); 93 pass total |

## Notes

- All changes in packages/luca-cli; anti-01/anti-02 porcelains (luca-core, luca-tools) empty throughout.
- Executor deviation (1.1.2, self-corrected): a prettier --write attempt was caught and reverted; final diff is the pure hoist in repo style.
- Executor observation (1.2.1): `luca checks run --file` help text says "commands array" but the schema wants a BARE array, not {"commands":[...]} — minor doc mismatch, backlog-worthy.
- Wave-1 executor flag: state.json sessionId empty → its wave telemetry run id fell back to "." (cosmetic; orchestrator telemetry uses the minted run id).
- Prepared commit message: `fix(classifier): register budget + 5 drifted nouns, confidence verbs, registry-completeness test`.
