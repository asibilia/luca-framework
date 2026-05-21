# CONTEXT — Phase C Discussion (full-auto defaults)

## Decisions

| # | Question | Decision | Rationale |
|---|---|---|---|
| D1 | Schema migration: rename or extend? | **Extend additively** + **memory re-seed** in this PR. Keep existing field names (`titleFormat`, `versionBump`) as canonical; add NEW richer fields (`titleTemplate`, `titleExamples`, `forbidden`, `commits.trailers`, `commits.subjectMaxLength`, `tracker.linkFormat`). Do NOT rename existing fields — backward compat with downstream consumers. | Non-breaking. Phase C prose can reference either old or new field names without runtime fail. Memory re-seed via `projectPreferences(action:"seed")` writes a new payload that conforms to extended schema. |
| D2 | Commit `.planning/preferences.json`? | **YES** — commit it for luca-framework. Add a single-file commit with the canonical seeded values. | RISK-3 fix: fresh clones get correct preferences without running luca-init. |
| D3 | Register `plan` mode for `projectPreferences`? | **YES** — one-line add in `tool-manifest.ts`: `[MODES.plan]: ['consult', 'consult-section']`. (`plan` is a stock mode key, not in MODES object — use literal `'plan'`.) | RISK-2 fix: `pr-title-format.md` rule fires in plan mode; without registration, runtime fail every turn. |
| D4 | Pre-commit recall: replace or supplement? | **Supplement** — keep the free-form `muninn_recall` for historical pitfalls AND add a `consult-section('commits')` for structured types/scopes/trailers. | RISK-5: information narrowing if recall is fully replaced. Two-call pattern is what Phase B used in architect.md (resolve + consult). |
| D5 | `Closes #` literal in instructions/skills | **Drive from `tracker.linkFormat`** (memory has `"Closes #{issue}"`). Schema needs `linkFormat?: SAFE_FREEFORM` extension. | Generic across consumer projects; luca-framework keeps its `Closes #` value via stored memory. |
| D6 | `Refs: #` in commit trailers vs `Closes #` in PR body | **Keep distinction**. `commits.trailers.issueRef` for commit-trailer prefix; `tracker.linkFormat` for PR-body close-keyword. Different conventions historically. | Allows consumers to use `Refs:` in commits, `Closes:` in PR bodies, or any combo. |
| D7 | `commands/milestone-new.md` and `commands/repo-cleanup.md` | **Audit-only, no edit** unless they hardcode conventions. | Phase C todo says audit. Edits unjustified without findings. |
| D8 | `gh-issue-triage` SKILL Closes # references | **Leave as-is**. They're descriptive (documenting how PRs close issues), not prescriptive. | Out of scope per research. |
| D9 | Plan-mode rule body defensive check | **Skip** — D3 registers plan mode, so rule body can call tool unconditionally. | Cleaner than runtime tool-presence check. |
| D10 | Schema enum aliasing (`"conventional-commits"` etc.) | **Update memory to use schema enum values** (`"conventional"`, `"github"`). Re-seed in this PR. | Cleaner than schema-side aliasing; canonical schema is authoritative. |
| D11 | `no-luca-leak.test.ts` grep test | **YES** — bundle in this PR. Asserts no `framework\|mastracode\|studio\|config\|docs\|repo` literal in `rules/`/`skills/`/`src/instructions/` (whitelist tests + memory blob). | RISK-7 prose-regression guard. |
| D12 | Vault-resolution boilerplate stripping | **Strip ONLY where the adjacent recall is fully replaced by `projectPreferences`.** Keep where raw `muninn_*` calls remain (e.g. finalize.md Step 1 pattern pruning, execute.md pre-commit recall supplement). | RISK-8 caution. |

## Out of scope

- Renaming `titleFormat → titleTemplate` (D1): future cleanup todo.
- Schema migration framework (`schemaVersion: 2`): not needed for additive extension.
- Plan-mode permission audit beyond `projectPreferences`: separate todo.
- `commands/milestone-new.md` overhaul.
