# Research: Phase C — PR/Release/Commit Conventions Consult Preferences

## Summary

Phase C must replace luca-framework-specific PR/release/commit conventions hardcoded in 6-7 instruction/skill/rule/command files with `projectPreferences.consult-section` calls. Phase A's tool, schema, and `/luca-init` skill are in place; Phase B established the `consult → resolve → confirm? → apply` pattern verbatim. Phase C is **prose-only edits** — no new TS code — but **two CRITICAL prerequisites must be addressed before merge**: (1) a three-way schema-vs-memory field-name drift causes `consult-section('pr')` to silently strip luca-framework's stored values and (2) `consult-section` reads `.planning/preferences.json` which is not committed to the repo, so fresh clones fall back to schema defaults. A third high-severity issue: the `pr-title-format.md` `alwaysApply:true` rule fires in `plan` mode where `projectPreferences` is not registered.

## Scope

### Files to edit (7)
| File | Change | Why |
|---|---|---|
| `packages/luca-mastracode/rules/pr-title-format.md` | Full rewrite — drop hardcoded scopes/title format; add consultative prose | `alwaysApply:true` ships luca-framework conventions to all consumers |
| `packages/luca-mastracode/skills/gh-prepare/SKILL.md` | Replace bump-map prose (line 100), PR title template (lines 137,196), body template (lines 141-160), Closes # refs (130,144,174,196) | Skill is workhorse of PR creation; hardcoded values leak |
| `packages/luca-mastracode/src/instructions/finalize.md` | Replace title-format prose (lines 298,347) and Closes # (line 349) with consult-section('pr') + tracker.linkFormat | Ad-hoc recall is replaced by structured consult |
| `packages/luca-mastracode/src/instructions/execute.md` | Replace pre-commit recall + types enum (lines 388-409) with consult-section('commits') | Pre-commit hook should be deterministic |
| `packages/luca-mastracode/commands/gh-pr-address.md` | Line 128 "conventional commit" prose → consult reference | Prescriptive framing |
| `packages/luca-mastracode/commands/milestone-new.md` | Audit (likely no change) | Audit-only per Phase C todo |
| `packages/luca-mastracode/commands/repo-cleanup.md` | Audit (likely no change) | Audit-only per Phase C todo |

### Out of scope
- `skills/gh-issue-triage/SKILL.md` — the Closes #N refs are descriptive (it documents how PRs close issues), not prescriptive. Leave.
- New TS code, new tool actions, schema migration of `projectPreferences` — Phase A territory unless we extend the schema.

### Blast radius
- `pr-title-format.md` (alwaysApply) — injected into EVERY mode of EVERY consumer via `loadAlwaysApplyRules() → getAgentConstraints()` (`agent-constraints.ts:43-47`). Highest blast radius.
- `gh-prepare` skill — invoked from finalize and on-demand. Determines PR title, bump level, body.
- `finalize.md` — runs once per phase to create PR.
- `execute.md` — runs on every commit during executor wave.

## Architecture

### Phase B's consult-pattern (verbatim, ready to mirror)

Triage sentinel (triage.md:75-88) — ONLY place `fallback:false` is used:
```
result = projectPreferences(action: "consult", fallback: false)
// result.preferences === null → invoke /luca-init skill, then continue
```

Non-triage consultation (template Phase C must use):
```
projectPreferences({ action: "consult-section", section: "pr", fallback: true })
// → { success: true, section: <PrSection or DEFAULTS> }
// NEVER throws; always check section !== null when fallback omitted
```

### Tool-manifest scope (`tool-manifest.ts:237-254`)
| Mode | Actions |
|---|---|
| triage | consult, consult-section, seed, update |
| research / architect / execute / review / finalize / discuss | consult, consult-section |
| build / fast | * |
| **plan** | **NOT REGISTERED** (RISK-2) |

### Persistence layer (RISK-3)
- `consult-section` → `loadProjectPreferences()` → `.planning/preferences.json` (file). NOT MuninnDB.
- The MuninnDB memory `01KR1BMR4M1M6MR496C80KC6WS` is the canonical record/restore source. Tool never reads it.
- `.planning/preferences.json` is NOT in `.gitignore` and is NOT committed. Fresh clones return schema defaults.
- Fix: either (a) commit `.planning/preferences.json` for luca-framework, or (b) accept that consumer projects must run `/luca-init` once.

### Rule loader injection
`loadAlwaysApplyRules()` concatenates all `alwaysApply:true` rules into every mode prompt. Rule body must be:
- Defensive: graceful degradation in modes without `projectPreferences` (e.g. `plan`)
- Self-contained: cannot invoke skills mid-turn; instructions must reference triage's sentinel for seeding

## Patterns

### Verbatim consult-pattern from Phase B
Step 1 — Consult (pure read):
```
ensureFeatureBranch({ action: "consult" })
```
Step 4 — Apply (mutating; only after confirmation):
```
ensureFeatureBranch({ action: "apply", resolution: <result>, ... })
```
For Phase C, only Step 1-equivalent applies (consult is read-only; no resolve/apply needed for PR title or commits).

### Skill SKILL.md frontmatter
```yaml
---
name: <kebab>
description: >
  <folded scalar>
---
```
Tool calls in fenced code blocks (no lang tag). Failure-modes / Flags tables at end.

### Rule frontmatter
```yaml
---
description: "<inline double-quoted>"
alwaysApply: true
---
```
Rules use `mcp__muninn__` full prefix (run outside pipeline).

### Command frontmatter
```yaml
---
name: <kebab>
description: <unquoted single-line>
---
```
Bare tool calls without prefix. `## Parse Arguments` then `## Steps`.

### Canonical luca-framework values (memory `01KR1BMR4M1M6MR496C80KC6WS`)
- `pr.titleTemplate`: `{type}({scope}): {version} #{issue} {description}` (memory uses `titleTemplate`; **schema uses `titleFormat`** — drift)
- `pr.titleExamples`: `["feat(mastracode): v10.2.0 #143 ...", "fix(framework): v9.4.1 #178 ..."]` (NOT in schema)
- `pr.forbidden`: `[{pattern: "\\(#\\d+\\)", reason: "..."}]` (NOT in schema)
- `release.bumpMapping`: `{feat: minor, fix: patch, ...}` (memory uses `bumpMapping`; **schema uses `versionBump`** — drift)
- `commits.scopes`: `[framework, mastracode, studio, config, docs, repo]`
- `commits.types`: `[feat, fix, refactor, chore, docs, test, style]`
- `commits.trailers.issueRef`: `"Closes #"` (NOT in schema)
- `tracker.linkFormat`: `"Closes #{issue}"`

## Dependencies

### Tool-permission gap
- `plan` mode → no `projectPreferences` → alwaysApply rule fails at runtime (RISK-2)

### Skill invocation
- `gh-prepare` invoked from finalize. Both have `consult-section`. ✓

### changesets / gh CLI
- `gh-prepare` reads `.changeset/config.json` for fixed-group info (auto-detected, separate from preferences).
- Bump-MAP per commit type lives in `release.versionBump`.
- `gh pr create --title` receives the templated title.

### Schema vs memory drift (CRITICAL)
| Field | Schema | Memory |
|---|---|---|
| PR title template | `pr.titleFormat` | `pr.titleTemplate` |
| Bump map | `release.versionBump` | `release.bumpMapping` |
| Commit convention enum | `'conventional'\|'none'` | `"conventional-commits"` (rejected) |
| Tracker kind enum | `'github'` | `"github-issues"` (rejected) |
| Schema version key | `schemaVersion` | `version` |
| Schema gaps | — | `pr.forbidden`, `pr.titleExamples`, `commits.trailers`, `commits.subjectMaxLength` |

### Consumer impact
- Repos using luca-mastracode without seeded preferences hit `/luca-init` on triage Step 1.6 (full-auto safe; SKILL.md:53-57 auto-seeds).
- Outside the triage flow, consumers see schema defaults silently.

## Risks

(Ordered by severity descending; full table in `research-capture-risk.md`)

### 🔴 RISK-1 + RISK-4: Schema/memory field-name drift (CRITICAL)
Memory has `titleTemplate`, `bumpMapping`. Schema exposes `titleFormat`, `versionBump`. Phase C prose that follows the memory's field names returns `undefined` and silently falls through to hardcoded fallbacks. **Migration becomes a no-op.**

**Mitigation paths**:
- (a) Extend schema: add `titleTemplate`/`titleExamples`/`forbidden`/`trailers`/`subjectMaxLength`, accept `bumpMapping` as alias of `versionBump` OR rename `versionBump → bumpMapping`
- (b) Re-seed memory using `projectPreferences(action: "seed")` with schema-valid field names
- (c) Use Zod field names (`titleFormat`, `versionBump`) in Phase C prose

**Recommended**: extend schema + re-seed memory using fixture (see Recommendations).

### 🔴 RISK-3: `.planning/preferences.json` not committed (CRITICAL)
`consult-section` reads file, not memory. File is NOT in repo, NOT in `.gitignore`. Fresh clones get schema defaults silently.

**Mitigation**: commit `.planning/preferences.json` for luca-framework as part of Phase C.

### 🔴 RISK-2: alwaysApply rule fires in `plan` mode (HIGH)
`plan` mode lacks `projectPreferences`. Rule body referencing `projectPreferences.consult-section` errors on every turn in plan mode.

**Mitigation**: register `project_preferences` for `plan` mode in `tool-manifest.ts` (one-line add) OR write rule body defensively (`if tool available → consult; else fall back to current branch context`).

### 🟠 RISK-5: Pre-commit recall info narrowing (MEDIUM)
Free-form recall returns trailers, max length, historical pitfalls. Schema's `commits` section is narrower. Replacing recall with consult loses information.

**Mitigation**: extend schema with `trailers` + `subjectMaxLength` (driven by RISK-1's schema migration anyway).

### 🟠 RISK-6: Auto-init in non-triage stalls (MEDIUM)
Rule body must NOT instruct non-triage modes to invoke luca-init (skill not callable mid-turn; finalize/execute can't seed).

**Mitigation**: rule body says "consult with `fallback:true`; preferences are seeded in triage Step 1.6".

### 🟠 RISK-7: Zero prose tests (MEDIUM)
Phase C is prose-only; no automated verification.

**Mitigation**: add grep-based test asserting `framework|mastracode|studio|config|docs|repo` does NOT appear in `rules/`, `skills/`, `src/instructions/` (excluding fixtures + memory blob).

### 🟡 RISK-8: Vault boilerplate over-stripping (LOW-MED)
Don't strip vault prose from raw `muninn_*` call sites. Per-location audit.

### 🟢 RISK-9: Security (LOW)
SAFE_FREEFORM allowlist + JSON-blob seed handoff already mitigate. Parsed object return for consult-section. No new injection surface.

## Recommendations

### Architectural prerequisites (do BEFORE prose edits)
1. **Schema extension** in `state/project-preferences.ts`:
   - Add `pr.titleTemplate?` (alias-or-replacement of `titleFormat`)
   - Add `pr.titleExamples?: string[]` (max 5, SAFE_FREEFORM each)
   - Add `pr.forbidden?: { pattern, reason }[]`
   - Add `commits.trailers?: { coAuthor: boolean, issueRef: string }`
   - Add `commits.subjectMaxLength?: number` (default 72)
   - Decide: rename `release.versionBump → release.bumpMapping` OR accept `bumpMapping` as alias. Prefer rename for memory compatibility.
   - Decide: accept `commits.convention: "conventional-commits"` as alias of `"conventional"`, OR coerce in `mergePreferences`. Prefer alias for compat.
   - Decide: accept `tracker.kind: "github-issues"` as alias of `"github"`. Prefer alias.

2. **Re-seed luca-framework memory** via `projectPreferences(action:"seed")` AFTER schema extension. Memory ID `01KR1BMR4M1M6MR496C80KC6WS` either evolves or new memory written.

3. **Commit `.planning/preferences.json`** with the seeded values so fresh clones return correct preferences.

4. **Register `plan` mode** in `tool-manifest.ts` for `project_preferences: ['consult', 'consult-section']`.

### Prose edit prerequisites
5. **Use schema field names** (`titleFormat` or `titleTemplate` post-rename; `versionBump` or `bumpMapping` post-rename) consistently.
6. **All non-triage consults use `fallback: true`** — never instruct non-triage modes to invoke luca-init.

### Prose edits (Wave 2-style work)
7. **`pr-title-format.md`** — rewrite to consultative; defensive in `plan` mode.
8. **`gh-prepare/SKILL.md`** — single `consult` at skill start; reuse for bump map, title, body, draft default, Closes # via `tracker.linkFormat`.
9. **`finalize.md`** — replace title-format prose with `consult-section('pr')` template apply; replace `Closes #` with `tracker.linkFormat` interpolation.
10. **`execute.md`** — pre-commit guard already has `assert-not-default` from Phase B; add `consult-section('commits')` for types/scopes/trailers.
11. **`gh-pr-address.md`** — replace prescriptive "conventional commit" prose with consult reference.
12. **`milestone-new.md`, `repo-cleanup.md`** — audit, no change expected.

### Tests (RISK-7 mitigation)
13. Add `__tests__/no-luca-leak.test.ts` — grep-based: assert no `framework|mastracode|studio|config|docs|repo` literal in `rules/`, `skills/`, `src/instructions/` (whitelist fixtures + tests).
14. Add `__tests__/preferences-roundtrip.test.ts` — seed memory blob, write to file, parse, verify all stored fields survive.

## Open Questions

1. **Schema migration scope** — extend schema additively (option A) or rename existing fields (option B)? B has cleaner final shape; A is non-breaking. Architect decision.
2. **Should `.planning/preferences.json` be repo-committed for luca-framework, or should the framework just trust luca-init?** Committing makes consumers' lives clearer; not committing forces them through the wizard.
3. **Should `commits.types` and `commits.scopes` arrays be defensively non-empty in luca-framework's seed?** Currently `scopes: []` in fixture but memory has 6 entries. Fixture should match memory.
4. **Refs: # vs Closes #** — `execute.md:407` uses `Refs: #` in commit trailers; memory has `Closes #`. Intentional differentiation? Architect decision.
5. **Is `plan` mode a priority consumer?** If yes, register tool. If `plan` is rarely used, defensive prose may suffice.
6. **gh-prepare unseeded behavior** — current skill says "if MuninnDB unreachable, log and continue". Phase C acceptance #4 says "trigger auto-init". These conflict. Architect must decide hard-fail vs soft-fallback.
