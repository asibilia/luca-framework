# Parity review #3 — Skills + commands fidelity

**Reviewer lens:** USER-FACING SKILLS + COMMANDS FIDELITY
**Branch:** refactor/repo-restructure
**Compile target verified:** `bun run --filter @alecsibilia/luca-tools compile:artifacts -- --out /tmp/r3-verify-83791` exited 0; emitted 40 skills + 17 commands as expected.
**Date:** 2026-05-23

---

## 1. Executive verdict

Phase H verdict: **CLEAR — WITH CAVEATS**.

Body-level prose porting is faithful. Path retargeting was completed on the headline transformation (`.planning/` → `.luca/`) but **partial / inherited drift** is widespread: 232 uppercase artifact references (STATE.md, ROADMAP.md, REQUIREMENTS.md, PROJECT.md, MILESTONE-AUDIT.md) survive across 25 ported skill bodies, and **67 dead `bun run packages/luca-framework/src/state/bridge.ts` references** survive across 20 ported skills. The new `luca` CLI verbs (`luca state read`, `luca state advance`, etc.) are used in the **commands** track but the **skills** track is still on the deleted bridge script.

These are NOT additions by the port — they were already in the legacy SKILL.md sources (mostly inherited verbatim by design). They are pre-existing drift now visible in the new artifact set.

Scope is clean: zero out-of-scope artifacts slipped in (no vercel:*, cloudflare:*, firecrawl-*, frontend-design:*, etc.).

Cross-artifact reference integrity has **one real break**: the `lu` SKILL references five skills (`jira-issue`, `git-feature`, `pr-address`, `debug`, `git-commit`) that were intentionally not ported and don't exist in the new bundle. The `/lu` *command* — which is the modernized orchestrator — does NOT have this problem.

One secondary regression: **4 skills had their "Use when …" trigger phrases dropped** from the YAML description when the block-scalar `>` form (with a blank-line paragraph break) was collapsed to a single-line string. This breaks Claude Code's skill auto-trigger surface for `luca-init`, `luca-telemetry-report`, `luca-write-surface`, `memory-audit`.

None of these issues block Phase H (legacy package deletion) — they are forward-fix items for v14.

---

## 2. Method

1. Enumerated the ported set:
   - `packages/luca-tools/src/artifacts/skills/<name>/index.ts` → 40 skill dirs (plus an `index.ts` barrel).
   - `packages/luca-tools/src/artifacts/commands/<name>.ts` → 17 command files (plus an `index.ts` barrel).
2. Compiled artifacts to `/tmp/r3-verify-83791/` and confirmed counts (40 skills/40 dirs, 17 commands/17 files).
3. Identified legacy sources per artifact:
   - `~/.claude/skills/<name>/SKILL.md` for items where that dir is a real file (32 of the user-dir entries are real, 70+ are dangling symlinks into the now-deleted `dist/claude/skills/`).
   - `git show fd0b169be^:packages/luca-framework/.claude/skills/<name>/SKILL.md` for items recovered from pre-D-4 history.
   - `git show fd0b169be^:packages/luca-framework/skills/skills/<name>/SKILL.md` for the smaller secondary tree.
   - All 17 commands sourced from `~/.claude/commands/<name>.md` (still real files).
4. Sampled deep diffs on 10 artifacts spanning categories:
   - Pipeline core: `lu` (skill + command), `phase-execute`, `phase-plan`, `phase-discuss`, `autopilot`.
   - Milestones: `milestone-new`.
   - Peripheral: `gh-prepare`, `gh-issue-triage`, `grill-me`, `memory-audit`, `luca-init`, `luca-telemetry-report`, `luca-write-surface`, `bug-diagnose`.
5. Bulk-scanned all 57 rendered outputs for:
   - `.planning/` survivors
   - Uppercase artifact filenames (PLAN.md, ROADMAP.md, STATE.md, REQUIREMENTS.md, PROJECT.md, CONTEXT.md, MILESTONE-AUDIT.md, MEMORY-SNAPSHOT.json, MILESTONE-CONTEXT.md, RESEARCH.md, POSTMORTEM.md, VERIFY.json, LEARN.md)
   - Mastra-era tool names (workflowState, writePlanningFile, writePhaseFile, writeAuditFile, writeMilestoneFile, writeBacklogFile, writeRoadmapFile, writeStateFile, writeConfigFile, writeRequirementsFile)
   - Deleted bridge invocations (`bun run packages/luca-framework/src/state/bridge.ts`, `luca-bridge`, `luca_gate_check`)
   - Out-of-scope skill names (vercel:*, cloudflare:*, firecrawl-*, frontend-design:*, skill-creator:*, aidesigner:*, impeccable, mastra, shadcn, playwright-cli, caveman)
6. Reconstructed the legacy skills/commands inventory at `fd0b169be^` for coverage analysis.
7. Cross-walked all `Skill(skill: "...")` and `/slash` references against the ported set.

---

## 3. Sampled-port findings

### 3.1 `lu` skill (legacy source: `fd0b169be^:packages/luca-framework/.claude/skills/lu/SKILL.md`)

- **Verdict: SUBSTANTIAL DRIFT** (relative to canonical contract; faithful to legacy).
- Sizes: legacy 193 lines → rendered 196 lines (close).
- Path retargeting `.planning/config.json` → `.luca/config.json`: OK.
- Persisted from legacy and not modernized:
  - `bun run packages/luca-framework/src/state/bridge.ts set-field/snapshot` invocations on lines 88-91, 191. The bridge script no longer exists (luca-framework is a husk).
  - `STATE.md` references (line 91: "Fallback: Update STATE.md directly if bridge unavailable"). `STATE.md` is not in `LUCA_DIR_CONTRACT` — state lives in `state.json`.
  - `luca_gate_check` reference (line 118). Should be `luca gate check` CLI verb.
- **Five broken `Skill(skill: ...)` cross-references**: `jira-issue`, `git-feature`, `pr-address`, `debug`, `git-commit`. None of these were ported to luca-tools; they will produce skill-not-found errors at runtime.
- Body prose otherwise faithful (Step 0–Step 7 structure preserved, agent delegation requirements preserved, model resolution table preserved).

### 3.2 `lu` command (legacy source: `~/.claude/commands/lu.md`)

- **Verdict: FAITHFUL** (and well-modernized).
- 75 lines, byte-identical between legacy and rendered output.
- Uses the new `luca state read`, `luca roadmap create`, `luca state advance`, `luca phase current`, `luca checks run` CLI verbs throughout. No bridge-script residue.
- Cross-references to `/phase-discuss`, `/phase-plan`, `/phase-execute`, `/milestone-new` all resolve to ported commands.
- This is the canonical "modernized" version; the `lu` SKILL above is the legacy long-form duplicate.

### 3.3 `phase-execute` skill (legacy source: `fd0b169be^:.../phase-execute/SKILL.md`)

- **Verdict: SUBSTANTIAL DRIFT** (inherited).
- Sizes: 1855 lines in defineSkill TS / similar count in rendered MD.
- `.planning/` → `.luca/` retargeting completed (0 residual `.planning/` refs, 10 `.luca/` refs).
- **7 dead `bun run packages/luca-framework/src/state/bridge.ts` invocations** at rendered lines 338, 448, 494, 617, 924, 1616, 1646 — read-status, suspend, resume-phase, read-complexity, transition. All exist verbatim in legacy.
- **Zero `luca <verb>` CLI invocations** — the skill was not modernized to the new CLI write surface.
- Contract-incompatible filename refs: `ROADMAP.md`, `REQUIREMENTS.md`, `PROJECT.md`, `STATE.md`. Used in shell snippets that would `cat .luca/ROADMAP.md` but those files don't exist in the new contract (only lowercase `roadmap.md` does, and there's no REQUIREMENTS/PROJECT slot at all).
- Body prose (waves, verification, executor delegation, learn) faithfully preserved.

### 3.4 `phase-execute` command (legacy source: `~/.claude/commands/phase-execute.md`)

- **Verdict: FAITHFUL.**
- 39 lines, identical apart from `description:` YAML quoting (escape characters added in port — semantically equivalent).
- No bridge refs, no uppercase artifact paths.

### 3.5 `phase-discuss` skill

- **Verdict: MOSTLY FAITHFUL** with retargeting drift.
- Sizes: 172/172 line match.
- Strong path retargeting: `CONTEXT.md` → `context.md` (8 places), `.planning/` → `.luca/` (4 places).
- Inherits 1 dead `bun run packages/luca-framework/src/state/bridge.ts read-complexity` invocation at line 50.
- Inherits 1 `STATE.md` reference (`.luca/STATE.md`, line 50 fallback).
- Body prose preserved verbatim; section structure converted from `## main` headings to `<main>...</main>` XML tags (compiler-level, faithful).

### 3.6 `phase-plan` skill

- **Verdict: PARTIAL RETARGETING / SUBSTANTIAL DRIFT** (inherited).
- Sizes: 515/515 line match.
- `PLAN.md` → `plan.md`: 6 of 7 retargeted. The 1 surviving uppercase PLAN.md is in the description metadata (line 3).
- Persists `ROADMAP.md` (3 refs), `STATE.md` (5 refs), `REQUIREMENTS.md` (4 refs) — all under `.luca/` but contract-incompatible filenames.
- Persists `bun run packages/luca-framework/src/state/bridge.ts` (1 ref, line 187).
- Persists `luca_gate_check` (1 ref, line 460) — should be `luca gate check`.

### 3.7 `milestone-new` skill

- **Verdict: SUBSTANTIAL DRIFT** (inherited).
- Sizes: 134/134 line match. Body prose faithful.
- Persists `.luca/PROJECT.md`, `.luca/REQUIREMENTS.md`, `.luca/ROADMAP.md`, `.luca/STATE.md` references throughout — none of these slots exist in `LUCA_DIR_CONTRACT`. The contract uses `state.json` (root), `roadmap.md` (root, generated), and there is no `PROJECT.md`/`REQUIREMENTS.md`.
- Also persists `MILESTONE-CONTEXT.md` reference (legacy artifact, not in contract).

### 3.8 `autopilot` skill

- **Verdict: FAITHFUL** body, **DRIFT** in path/contract refs.
- Sizes: 1307/1307 line match. 200-line diff is purely retargeting (`.planning/` → `.luca/`, `PLAN.md` → `plan.md`, `## main` → `<main>` etc.) and YAML frontmatter generation.
- Persists `STATE.md`, `ROADMAP.md`, `PROJECT.md` references throughout (inherited).
- Persists `bun run packages/luca-framework/src/state/bridge.ts` (multiple).

### 3.9 `gh-prepare` skill

- **Verdict: FAITHFUL.**
- Sourced from `~/.claude/skills/gh-prepare/SKILL.md` (real user copy).
- Description block-scalar collapsed to single line — semantically equivalent. "Use when…" triggers preserved.
- Body prose unchanged.

### 3.10 `grill-me` skill

- **Verdict: FAITHFUL** with minor inconsistency.
- Sourced from `~/.claude/skills/grill-me/SKILL.md` (real user copy).
- Body retargets `docs/CONTEXT.md` → `docs/context.md` (3 places — consistent with the new contract).
- **Inconsistency**: the rendered description metadata still says `Updates docs/CONTEXT.md` (uppercase), while the body uses lowercase. Mixed casing in a single artifact.
- Description block-scalar collapsed to single line — "Use when…" preserved.

### 3.11 `memory-audit`, `luca-init`, `luca-telemetry-report`, `luca-write-surface` skills

- **Verdict: REGRESSION (description trigger phrases dropped).**
- All four had legacy descriptions in YAML block-scalar form `description: >` with a blank-line paragraph separator. The second paragraph ("Use when user says …") was DROPPED during port — the rendered output has only the first paragraph.
- Body prose preserved.
- This will cause Claude Code's skill auto-trigger to miss invocations like "audit memory", "init luca", "telemetry report", etc.

---

## 4. Bulk-scan findings

### 4.1 Residual `.planning/` refs across all rendered output

**3 instances across 3 files** — all are shell `test -d .planning && …` or `mkdir -p .planning` style:

| File | Line | Context |
|------|------|---------|
| `skills/progress/SKILL.md` | 20 | `test -d .planning && echo "exists" \|\| echo "missing"` |
| `skills/quick/SKILL.md` | 64 | `if [ ! -d .planning ]; then` |
| `skills/project-new/SKILL.md` | 216 | `mkdir -p .planning` |

These should be `.luca`. Inherited from legacy.

### 4.2 Residual uppercase filename refs across all rendered output

**232 instances** across **25 files**:

| Pattern | Count |
|---------|-------|
| `STATE.md` | 115 |
| `ROADMAP.md` | 68 |
| `PROJECT.md` | 30 |
| `REQUIREMENTS.md` | 25 |
| `MILESTONE-AUDIT.md` | 4 |
| `MEMORY-SNAPSHOT` (json) | 1 |
| `PLAN.md` | 1 (description-only, body uses lowercase) |
| `CONTEXT.md` | 1 (grill-me description; body uses lowercase) |
| `RESEARCH.md` | 0 |
| `POSTMORTEM.md` | 0 |
| `VERIFY.json` | 0 |
| `LEARN.md` | 0 |
| `MILESTONE-CONTEXT.md` | 0 |

Affected files (25): autopilot, choose, lu (skill), milestone-{audit,complete,gaps,new}, note, phase-{add,assumptions,discuss,execute,insert,plan,remove,research}, post-init-tour, progress, project-new, quick, session-plan, session-resume, todo-add, workflow-save SKILL.md plus milestone-new command.

None of these filenames exist in `LUCA_DIR_CONTRACT`:
- The contract uses `state.json` (root, JSON), `roadmap.md` (root, generated lowercase).
- The contract has no `PROJECT.md`, `REQUIREMENTS.md`, `MILESTONE-CONTEXT.md`, or `MEMORY-SNAPSHOT.json` slots.
- The contract uses `milestones/v<SEMVER>-audit.md` (lowercase, in a subdir) — not `MILESTONE-AUDIT.md` at root.

### 4.3 Residual Mastra-era tool name refs

**0 instances** of `workflowState`, `writePlanningFile`, `writePhaseFile`, `writeAuditFile`, `writeMilestoneFile`, `writeBacklogFile`, `writeRoadmapFile`, `writeStateFile`, `writeConfigFile`, `writeRequirementsFile` in any rendered output.

### 4.4 Residual `luca-framework` bridge invocations

**67 instances** across **20 files**, all of form `bun run packages/luca-framework/src/state/bridge.ts <verb>`:

```
skills/{note, session-resume, phase-execute, repo-audit, milestone-new, progress,
        phase-discuss, phase-plan, phase-remove, workflow-save, todo-add, quick,
        phase-insert, session-pause, milestone-audit, project-new, lu,
        milestone-complete, phase-add, autopilot}/SKILL.md
```

The `bridge.ts` script no longer exists — Phase C dropped `packages/luca-framework/src/` and the new CLI verbs (`luca state read`, `luca state advance`, `luca confidence read`, `luca verification aggregate`, etc.) are the correct replacement. The COMMANDS track is fully on the new CLI; the SKILLS track is still on the dead bridge.

### 4.5 Residual `luca_gate_check` (MCP tool) refs

**2 instances**:
- `skills/phase-plan/SKILL.md:460` — `*(If using the pi extension tool `luca_gate_check`, it returns the full matrix for the current level).*`
- `skills/lu/SKILL.md:118` — `query the state machine or use `luca_gate_check` to determine which steps should run`

Should be `luca gate check` CLI verb.

### 4.6 Out-of-scope artifacts

**0 instances** of vercel:*, cloudflare:*, firecrawl-*, frontend-design:*, skill-creator:*, aidesigner:*, impeccable, mastra, shadcn, playwright-cli, caveman, cleanup, find-skills in either skill or command file names. Scope correctness is fully maintained.

### 4.7 "Use when …" trigger phrase preservation

Of the 9 ported skills sourced from real `~/.claude/skills/<name>/SKILL.md` files that contained "Use when" trigger phrases in their YAML descriptions:

| Skill | "Use when" preserved? | Cause |
|-------|----------------------|-------|
| arch-audit | OK | Single-paragraph description in legacy |
| gh-issue-triage | OK | Single-paragraph |
| gh-prepare | OK | Single-paragraph |
| grill-me | OK | Single-paragraph |
| rename-audit | OK | Single-paragraph |
| **luca-init** | **DROPPED** | Two-paragraph block-scalar; second paragraph lost |
| **luca-telemetry-report** | **DROPPED** | Two-paragraph block-scalar; second paragraph lost (also lost the `Arguments:` paragraph) |
| **luca-write-surface** | **DROPPED** | Two-paragraph block-scalar; second paragraph lost |
| **memory-audit** | **DROPPED** | Two-paragraph block-scalar; second paragraph lost |

The compiler is collapsing block-scalar (`description: >`) form to a single-line string but stopping at the first blank line, silently truncating the description.

---

## 5. Reference integrity

### 5.1 Cross-`Skill(skill: ...)` references

Aggregated across all 40 rendered SKILL.md files. References:

```
autopilot, debug, git-commit, git-feature, jira-issue, milestone-complete,
milestone-new, phase-discuss, phase-execute, phase-plan, phase-research,
pr-address, progress, project-new, quick, seed-memory, session-plan
```

**Broken (do not exist in ported set):** `debug`, `git-commit`, `git-feature`, `jira-issue`, `pr-address`.

All 5 broken references originate in `skills/lu/SKILL.md`. The `lu` skill assumes the legacy environment where these skills were also installed.

### 5.2 Cross-`/slash` references in commands

All cross-references in commands resolve cleanly: `/phase-discuss`, `/phase-plan`, `/phase-execute`, `/milestone-new` all exist as ported commands.

### 5.3 Coverage of legacy skills/commands by `lu` orchestrator

The `lu` SKILL's Step-1 (git context setup) and Step-4 (PR review / debug routing) blocks invoke unported skills. The `/lu` COMMAND avoids this — it does NOT branch into git workflow / PR review / debug paths (those flows are not part of the pipeline loop). The COMMAND is the authoritative orchestrator; the SKILL is a parallel artifact that was preserved verbatim from legacy but is partially stale.

---

## 6. Coverage assessment

### 6.1 Legacy skills NOT ported

26 skill names appear in legacy (`fd0b169be^:packages/luca-framework/.claude/skills/` ∪ `skills/skills/`) but not in the new ports:

```
bug-diagnose, caveman, code-lint, code-typecheck, codebase-map,
config-profile, config-settings, debug, git-commit, git-feature, git-pr,
help, jira-issue, pr-address, profile-export, profile-import,
qa-consolidate, rule-{complexity-gating,file-naming,harness-verification,
hook-skill-boundary,lu-workflow}, test-run, update, verify, workflow-start
```

**Probably correctly dropped** (utility / out-of-scope / replaced):
- `bug-diagnose` — kept as a COMMAND only; skill body lives in user dir (see §6.2 below for the coverage hole here).
- `code-lint`, `code-typecheck`, `test-run` — these are deterministic checks now wrapped by `luca checks run --file <commands.json>`. The skill bodies were thin wrappers around shell invocations.
- `verify` — replaced by `luca-verifier` agent (Phase D-1).
- `git-{commit,feature,pr}`, `jira-issue`, `qa-consolidate`, `pr-address`, `help`, `update`, `workflow-start` — git tooling / general help / discontinued flows.
- `config-profile`, `config-settings`, `profile-export`, `profile-import` — config tooling not in pipeline scope (the v13 model bakes config decisions into `luca preferences write`).
- `codebase-map` — peripheral utility.
- `caveman` — token-compression UX skill, cross-cutting.
- `rule-*` (5 skills) — these were the "rule reference" skills. Now that rules are in `luca-tools/src/artifacts/rules/` (0 instances per the parity report shows 0 rules but they may exist in a separate path — not in scope here), the user-facing rule skills are unneeded.

**Possible coverage gaps**:
- `bug-diagnose` SKILL — present in `~/.claude/skills/bug-diagnose/SKILL.md`, has a matching `/bug-diagnose` COMMAND that WAS ported, but the SKILL itself was not ported. So users who type "diagnose this bug" won't have skill auto-trigger; only explicit `/bug-diagnose` works.
- `research` SKILL — `~/.claude/skills/research/` exists with substantial body (swarm research orchestration). Could arguably belong to luca-tools as it's a cross-cutting research surface but is general enough to be reasonably out of scope.

### 6.2 Skill present with command-only port

`bug-diagnose` is the only artifact in the port that has a COMMAND but no SKILL. Given that `~/.claude/skills/bug-diagnose/SKILL.md` exists and provides the diagnostic discipline (Build a feedback loop → reproduce → hypothesise → instrument → fix → clean up), the asymmetry is a small coverage hole.

---

## 7. Commands-vs-skills bucketing

The author shipped:
- 17 skills WITH a matching command (the "tighter imperative `/<name>` form" track).
- 24 skills WITHOUT a matching command (relying on SKILL.md auto-surface as `/skill-name`).
- 1 command WITHOUT a matching skill (`bug-diagnose`).

Inspected the commands/index.ts header which documents the rationale: ship distinct command bodies where the user maintains them in `~/.claude/commands/` as semantically different from the SKILL.md bodies (e.g. `/lu` is a tight modernized orchestrator script while the `lu` SKILL is a verbose legacy long-form).

The 17/24/1 bucketing is **substantially correct** with two adjustments to consider:

1. **`bug-diagnose` should have a SKILL.md port** alongside the command (close the coverage hole noted in §6.2).
2. **The `lu` SKILL probably should be deleted or rewritten** to match the `/lu` command, rather than carried forward as a legacy-shaped duplicate with broken cross-references. Two artifacts under the same name with diverging behavior is a footgun.

Otherwise the call to skip separate commands for the 24 SKILL-only artifacts (phase-add, phase-assumptions, phase-insert, phase-remove, phase-research, milestone-audit, milestone-complete, milestone-gaps, progress, project-new, quick, repo-audit, rename-audit, seed-memory, session-pause, session-plan, session-resume, workflow-save, note, choose, autopilot, post-init-tour, arch-audit, luca-write-surface) is reasonable. Those skills are descriptive workflows that don't gain from a tighter parallel command body.

---

## 8. Phase H blockers (if any)

**No Phase H blockers.** The legacy `packages/luca-framework/.claude/skills/` and `packages/luca-framework/skills/` trees were already deleted at D-4 (`fd0b169be`). Phase H deletes the husk `packages/luca-framework/` directory which no longer contains active SKILL/command artifacts. The references in §3 and §4 are pre-existing drift, not deletion blockers.

The single nuance: any user-facing skill that invokes `bun run packages/luca-framework/src/state/bridge.ts` will fail post-Phase H (the script doesn't exist), BUT it also doesn't work pre-Phase H (Phase C already removed the bridge implementation from the active four-package set). So Phase H does not change the failure surface — it merely confirms it.

---

## 9. Carry-forward to v14

Issues identified that should be resolved as part of v14 cleanup:

1. **(High) Update 20 skills to use the new `luca` CLI verbs** in place of the dead `bun run packages/luca-framework/src/state/bridge.ts` invocations. 67 line-level edits across:
   - State reads: `bun run … bridge.ts read-status` → `luca state read`
   - State writes: `bun run … bridge.ts transition --event=X` → `luca state advance --to-step=Y` (or the appropriate verb)
   - Complexity reads: `bun run … bridge.ts read-complexity` → there is no direct CLI equivalent yet; consider adding `luca state read --field=complexity` or document that complexity stays inline in the orchestrator's reasoning.
   - Suspend/resume: `bun run … bridge.ts suspend/resume-phase` → check whether `luca` has these verbs; if not, decide whether to add them or drop the workflow.

2. **(High) Update uppercase artifact references** across 25 skill bodies (232 line-level edits):
   - `STATE.md` → `state.json` (lowercase, JSON, root). Where the legacy code did `grep "Task Complexity:" .luca/STATE.md`, the new equivalent is reading the JSON via `jq`.
   - `ROADMAP.md` → `roadmap.md` (lowercase, root).
   - `PROJECT.md`, `REQUIREMENTS.md`, `MILESTONE-CONTEXT.md`, `MEMORY-SNAPSHOT.json` — no contract home. Re-evaluate whether to add slots to `LUCA_DIR_CONTRACT` or drop the references and adjust the workflow.
   - `MILESTONE-AUDIT.md` (root) → `milestones/v<SEMVER>-audit.md`.

3. **(High) Fix the description block-scalar parser** so two-paragraph YAML descriptions don't lose the second paragraph. Affects 4 skills' auto-trigger surface (`luca-init`, `luca-telemetry-report`, `luca-write-surface`, `memory-audit`). The fix is in the artifact compiler — likely a YAML/string-joining bug where a blank line is being treated as a terminator instead of a join with `\n\n` or a space.

4. **(Medium) Fix the 5 broken `Skill(skill: ...)` cross-references in `lu/SKILL.md`** by either:
   - Porting the missing skills (`jira-issue`, `git-feature`, `pr-address`, `debug`, `git-commit`); or
   - Removing those branches from the `lu` SKILL so it matches the `/lu` command's narrower pipeline orchestration; or
   - Rewriting the `lu` SKILL entirely to mirror the `/lu` command and delete the legacy long-form.

5. **(Medium) Resolve the `lu` SKILL vs `/lu` command divergence** generally. They differ substantially in modernization level — the SKILL is the legacy long-form with model-routing tables, dead bridge invocations, and 5 broken cross-refs; the COMMAND is the tight modern pipeline orchestrator. The repository should not maintain two diverging behaviors under the same artifact name long-term.

6. **(Low) 3 residual `.planning/` references** in `progress`, `quick`, `project-new` SKILLs — trivial retargeting.

7. **(Low) 2 residual `luca_gate_check` references** in `lu` and `phase-plan` SKILLs — should be `luca gate check`.

8. **(Low) `grill-me` description/body casing inconsistency** — description says `docs/CONTEXT.md` but body says `docs/context.md`. Align to lowercase.

9. **(Low) Consider porting `bug-diagnose` SKILL.md** to close the command-only asymmetry (give it a skill body so "diagnose this" / "debug this" auto-triggers).

---

## 10. Recommendations

### 10.1 Immediate (before announcing v13 GA)

- **(Compiler fix) Resolve the YAML description block-scalar drop bug.** It silently truncates 4 skill descriptions and breaks auto-trigger. This is a one-place fix in the compile pipeline. Verify with the four affected skills: `luca-init`, `luca-telemetry-report`, `luca-write-surface`, `memory-audit`.
- **Decide on the `lu` skill divergence.** Either deprecate the legacy SKILL body in favor of the modernized COMMAND (recommended), or schedule the rewrite immediately. Leaving them divergent is a footgun for anyone reading `lu` SKILL and expecting it to match `/lu` command behavior.

### 10.2 v14 milestone scope

Add a "skill bodies modernization" track to v14:

- Bulk-retarget `STATE.md` / `ROADMAP.md` / `PROJECT.md` / `REQUIREMENTS.md` references either to `state.json` (with `jq` reads) or to the canonical `luca state read --field=…` CLI form.
- Decide which legacy filename slots (PROJECT.md, REQUIREMENTS.md, MILESTONE-CONTEXT.md, MEMORY-SNAPSHOT.json) deserve contract entries vs. workflow-dropping.
- Bulk-replace `bun run packages/luca-framework/src/state/bridge.ts <verb>` with `luca state <verb>` (or other appropriate `luca` CLI invocations).
- Fix the cross-reference `lu` → {jira-issue, git-feature, pr-address, debug, git-commit} broken links.

### 10.3 Phase H is CLEAR to proceed

None of the findings here change the Phase H deletion plan. The husk `packages/luca-framework/` can be deleted without any of the 40 ported skills regressing — they have no working bridge invocations now anyway (the script disappeared at Phase C).
