# Parity review #6 — Phase H deletion safety

> Reverse-direction audit. Question: is the new four-package world
> ready to **lose** `luca-mastracode/` + `luca-framework/` + Cursor/Pi
> support files + residual `.planning/` references? Not "did the legacy
> port?" — that's reviews #1–#5 — but "what would break if we deleted
> the doomed packages today?"

## 1. Executive verdict

**CLEAR (with two recorded follow-ups that are mechanical, NOT
structural).** The active four-package world (`luca-cli`, `luca-core`,
`luca-tools`, `luca`) has **zero `import`-level dependencies** on
`luca-mastracode` or `luca-framework`. The umbrella tarball
(`@alecsibilia/luca` 13.0.0-alpha.0) is fully self-contained via
unbuild's `inlineDependencies: true` and ships its own
`dist/claude/` artifact set; it has no runtime path into either
dying package.

What remains is **non-structural drift** in two leaf files
(`packages/luca-cli/src/commands/vault-init.ts`,
`packages/luca-cli/src/utils/runtime-context.ts` +
`utils/version-check.ts`) plus the user-facing output of
`packages/luca-cli/src/commands/init.ts`. These reference the legacy
package by name, write to `.planning/config.json`, and tell users to
"run `luca run`" — but **none of them break the build**, and all are
already documented as v14 caveats in the Phase G parity report. They
are Phase-H *housekeeping*, not blockers.

`.luca/archive/00-legacy-planning/` is present (10 top-level dirs, slim-down
specs intact) — preservation confirmed.

## 2. Method

Greps + finds + cross-references against:

1. `docs/repo-restructure-parity-report.md` (Phase G — the canonical
   READY-WITH-CAVEATS verdict, dated 2026-05-23).
2. Session handoff memory `session:repo-restructure-handoff (v15)`
   (id `01KSB0DYGFQ3GC6SX2CTRPV0SE`) — locked design decisions
   (D1–D4), final F1–F5 disposition, Phase H guide.
3. The four active package manifests + the umbrella `build.config.ts`.
4. Root `package.json` scripts.
5. The `.luca/archive/00-legacy-planning/` tree.
6. The `.changeset/pre.json` pre-release window.

No code modified. No deletions performed.

## 3. Import-graph cleanliness

### luca-mastracode

```
grep -rn "@alecsibilia/luca-mastracode" packages/luca-{cli,core,tools}/src packages/luca/src
```

→ **0 live imports.** 1 docs hit only:
`packages/luca-core/README.md:10` — a prose breadcrumb in the README,
not in source. Deleting the package will leave a dangling
documentation reference (cosmetic, fix during Phase H docs sweep).

```
grep -rn "from.*luca-mastracode" packages/luca-{cli,core,tools}/src packages/luca/src
```

→ **0 live imports.** ~36 hits but all are `* Ported from
luca-mastracode <path>` JSDoc breadcrumbs in `packages/luca-core/` and
`packages/luca-tools/`. These survive the package deletion harmlessly
(they're just provenance strings).

### luca-framework

```
grep -rn "@alecsibilia/luca-framework" packages/luca-{cli,core,tools}/src packages/luca/src
```

→ **3 live references** (zero are TypeScript imports):

1. `packages/luca-cli/src/utils/runtime-context.ts:85,104` — JSDoc on
   `resolveFrameworkPackageRoot()` + a runtime check
   `if (pkg.name === '@alecsibilia/luca-framework')` that walks up
   the filesystem looking for the *legacy* package installed in
   `node_modules/`. Used to resolve the bundled `dist/mastracode/`
   harness in global/installed mode. **This code path dies with
   `luca run` removal — see §5.** Currently unreachable in the new
   umbrella (the umbrella ships `dist/claude/`, not `dist/mastracode/`),
   but the function still exists and contains the literal name.
2. `packages/luca-cli/src/utils/version-check.ts:55` — `update-notifier`
   message telling users to `bun add -g
   @alecsibilia/luca-framework@latest`. Wrong package name post-Phase-H
   (correct one is `@alecsibilia/luca`). Cosmetic user-facing
   regression, ~1 line edit.
3. `packages/luca/dist/chunks/version.mjs:41` — **build output**, not
   source. Regenerates from #2 on next `bun run build`.

```
grep -rn "from.*luca-framework" packages/luca-{cli,core,tools}/src packages/luca/src
```

→ **0 live imports.** ~30 hits are `* Ported from
fd0b169be:packages/luca-framework/.cursor/skills/<name>/SKILL.md`
JSDoc provenance in skill files. Cosmetic; survives deletion.

### Other doc / README references to dying packages

| Where | Refs | Disposition |
|---|---|---|
| `packages/luca-core/README.md` | 2 (luca-framework, luca-mastracode) | Cosmetic; clean during Phase H docs sweep |
| `packages/luca/PUBLISHING.md` | 3 | **Intentional** — documents `npm deprecate` workflow for the legacy lineage. Preserve. |

### Verdict

Zero TS-level coupling. The active code does not pull a single symbol
from either dying package.

## 4. Path-reference cleanliness

### `.planning/` references

**Live writes/reads (NOT comments):** All concentrated in
`packages/luca-cli/src/`:

- `packages/luca-cli/src/commands/vault-init.ts` — **8 live refs**.
  Creates `.planning/` directory, writes `.planning/config.json`,
  checks `.planning/config.json` existence.
- `packages/luca-cli/src/utils/vault-setup.ts` — **3 live refs** in
  JSDoc / parameter docs; the *function body* writes whatever path
  the caller passes, so the runtime behavior follows from
  `vault-init.ts`. Strictly speaking the JSDoc-only hits are
  cosmetic — the live regression is `vault-init.ts`'s pathing.
- `packages/luca-cli/src/init/helpers/skill-validation.test.ts:31` —
  test fixture explicitly listing `.planning/` as a legacy token
  that **should not** appear in bundled skills. Safe.

**Pure documentation / breadcrumb refs (harmless):** Everything else.
~70 hits across `packages/luca-core/src/` (`* Ported from...
.planning/* → .luca/*` JSDoc) and `packages/luca-tools/src/artifacts/`
(`* Body path-retargeting: .planning/ → .luca/`). These are
intentional provenance strings; the *behavior* is already
`.luca/`-based.

### `.cursor/` references

- **0 live refs in `luca-cli`, `luca-core`, `luca`.**
- **~40 hits in `luca-tools/src/artifacts/skills/*/index.ts`**, of two
  kinds:
  1. JSDoc breadcrumb `* Ported from
     fd0b169be:packages/luca-framework/.cursor/...` — provenance,
     harmless.
  2. **User-visible skill body text** referencing paths like
     ``.cursor/luca/workflows/<x>.md`` and
     ``.cursor/luca/references/task-directive.md`` — these appear
     in 12+ skills (phase-execute, phase-plan, phase-discuss,
     milestone-new, project-new, quick, milestone-audit,
     session-resume, milestone-complete, choose, and others). The
     paths are baked into the compiled skill markdown that ships in
     `dist/claude/.claude/skills/<name>/SKILL.md`.

  **Effect post-Phase-H:** the referenced `.cursor/luca/...` files
  won't exist. The skills will tell agents to "Read
  `.cursor/luca/workflows/execute-phase.md`", agent tries, file not
  found, agent works around it. **Quality degradation, not a
  build break.** Phase H deletes the source-of-truth files; the
  skill bodies need a follow-up sweep (v14 candidate) to either
  inline the referenced content or drop the pointers.

### `.pi/` references

- **0 live refs in any active package.** Clean.

## 5. Dropped-artifact references

### `planner` + `fix` subagents

Plan §5.6 dropped these from the formal subagent registry. Confirmed
in `packages/luca-tools/src/artifacts/subagents/index.ts:5-13`. The
active subagent list:

```
discussion, executor, learner, plan-reviewer, researcher,
reviewer, shadow-scanner, verifier  (8 active)
```

Plus auto-generated `architect` etc. from modes. The plan §3 D1
restoration kept the *role* of planning inside the `architect` mode
and the `lu-planner` *prompt-level* spawn in skill bodies, but
removed the standalone subagent definitions for `planner` and `fix`.

**Stale references to `lu-planner` / `planner-{NN}` in skill bodies:**

- `packages/luca-tools/src/artifacts/skills/phase-plan/index.ts` —
  multiple "Spawn `lu-planner` sub-agent" instructions (lines 27,
  118, 280, 292, 310, 360, etc.).
- `packages/luca-tools/src/artifacts/skills/quick/index.ts` — same
  pattern (lines 31, 50, 159, 173, 208).
- `packages/luca-tools/src/artifacts/skills/phase-execute/index.ts`
  — lines 34, 57, 202, 217, 1586, 1751.
- `packages/luca-tools/src/artifacts/skills/lu/index.ts:48,54`
- `packages/luca-tools/src/artifacts/skills/autopilot/index.ts` —
  references `lu-pm-planner` (a different concept — backlog
  prioritization) plus dynamic `planner-{NN}` swarm spawning.
- `packages/luca-tools/src/artifacts/skills/session-plan/index.ts:46,54`

These are skill-body **prompt text**; they tell the agent to invoke
`Agent(subagent_type="lu-planner", ...)`. Since the formal
`lu-planner` subagent doesn't exist in the compiled artifact set,
these prompts will **404 at runtime** — the agent will try to spawn
a subagent that isn't registered. Effect: degraded skill behavior,
not a build break.

This is the deepest open D1-restoration scar. Phase H doesn't *cause*
this — the gap predates Phase H — but Phase H removes the legacy
`.cursor/skills/` source that was the backup reference. **Recorded
v14 follow-up:** either re-introduce the `lu-planner` subagent
(restore §5.6 drop) OR rewrite the skill bodies to invoke the
`architect` mode + `Task()` pattern that replaced it.

### `fix` subagent references

```
grep -rn "fix subagent\|defineSubagent.*fix" packages/luca-tools/src/artifacts/
```

→ Only 1 hit:
`packages/luca-tools/src/artifacts/subagents/index.ts:5` — the
*comment* that says the `fix` subagent was dropped. No live spawns
of "fix" as a subagent_type were found.

### `luca run` references

**3 live user-facing strings** (the launcher itself was dropped in
Phase C):

1. `packages/luca-cli/src/commands/init.ts:268` —
   ``'  To launch the harness:     luca run'``
2. `packages/luca-cli/src/commands/init.ts:270` —
   `'  To seed project conventions:        invoke /luca-init inside
   \`luca run\`'`
3. `packages/luca-cli/src/commands/vault-init.ts:115` —
   ``'Vault configured! Run \`luca run\` to launch the harness.'``

These print to stdout during `luca init` / `luca vault:init`. The
`luca run` command doesn't exist in the new CLI (no `commands/run.ts`
in `luca-cli`). Users following these instructions will get "command
not found". **Recorded v14 follow-up** (caveat 4 in parity report);
mechanical edit.

## 6. Build-chain independence

### Active package dependencies on dying packages

| Package | Depends on `luca-mastracode`? | Depends on `luca-framework`? |
|---|---|---|
| `@alecsibilia/luca-cli` | No | No |
| `@alecsibilia/luca-core` | No | No |
| `@alecsibilia/luca-tools` | No | No |
| `@alecsibilia/luca` | No | No |

The umbrella `packages/luca/package.json` `devDependencies` lists
ONLY workspace siblings (`@alecsibilia/luca-cli`, `luca-core`,
`luca-tools`). Build-time **only**: at publish time these are
inlined by unbuild and disappear from the tarball. The
`dependencies` block carries the npm-resolvable runtime deps
(`@clack/prompts`, `citty`, `consola`, `pathe`, `semver`,
`shell-quote`, `update-notifier`, `zod`) — none from the dying
packages.

`build.config.ts` for the umbrella (`packages/luca/build.config.ts`):
no `externals` or `inlineDependencies` entries reference
luca-mastracode or luca-framework. The `hooks: { 'build:done' }`
imports from `@alecsibilia/luca-tools/artifacts` (active package).

### luca-studio (orthogonal to Phase H)

`packages/luca-studio/` is a Next.js dashboard. **It does NOT depend
on `luca-mastracode` or `luca-framework` as workspace siblings.** It
duplicates a handful of schemas from `luca-framework/src/state/` +
`luca-framework/src/checks/` into `packages/luca-studio/lib/types.ts`
as documented mirrors (the file explicitly says "NOT imported").
Post-Phase-H, the docstrings will reference paths that no longer
exist (`@see packages/luca-framework/src/state/ledger.ts`), but the
runtime is unaffected. **Cosmetic doc drift only.** Studio's
scripts (`dev`, `build`, `css:*`, `lint`) make no reference to the
dying packages and continue to work.

Note: studio also reads the vault name string `"luca-framework"`
at `components/settings/project-identity.tsx:55` — this is the
**MuninnDB vault name**, which happens to share a name with the
dying package. It's a data string, not a code dep, and the vault is
intentionally still called `luca-framework` per
`session:repo-restructure-handoff`. No action needed.

### Verdict

The umbrella builds, types, and publishes with zero live edges into
the dying packages. Phase H deletions are structurally a no-op for
the build chain.

## 7. Files to delete in Phase H

### A. Directories (top-level)

| Path | Tracked files | Notes |
|---|---|---|
| `packages/luca-mastracode/` | **174** | Reference TS source — was the v12 source-of-truth. Fully unreferenced now. Subtrees: `src/`, `commands/`, `skills/`, `rules/`, `etc/`, `scripts/`, plus `node_modules/`. |
| `packages/luca-framework/` | **248** | Husk. Contains: `bin/luca.js` (legacy launcher), `dist/` (legacy build output incl. `dist/mastracode/`), `scripts/`, `CHANGELOG.md`, `README.md`, `eslint.config.mjs`, `build.config.ts`, `package.json` (v12.0.0-alpha.16), **empty `src/`**, plus the entire `.cursor/`, `.pi/`, `.mastracode/`, `.planning/` legacy support trees. |

### B. Tracked Cursor + Pi support (already inside `luca-framework/`)

Confirmed enumeration:

- **`packages/luca-framework/.cursor/`** — `.mdc` rules (20 files
  matching the global `~/.claude/rules/*.md` set; deleted with the
  parent directory), plus `skills/` and `commands/` subtrees.
- **`packages/luca-framework/.pi/`** — `agents/` (38 entries),
  `skills/` (54 entries), `extensions/` (20 entries),
  `AGENTS.md` (95KB), `settings.json` (802B).
- **`packages/luca-framework/.mastracode/`** — `commands/`, `skills/`
  subtrees.
- **`packages/luca-framework/.planning/`** — `luca-state.json`,
  `session-ledger.jsonl`.

No `.cursor/` or `.pi/` directories exist anywhere else in the repo
outside `node_modules/`. No standalone `.mdc` files exist outside
the doomed subtrees and `.luca/archive/00-legacy-planning/`.

### C. Root-level `package.json` script entries to remove

```
"build":              "cd packages/luca-framework && bun run build"
"mastracode":         "bun run packages/luca-mastracode/src/index.ts"
"publish:framework":  "cd packages/luca-framework && bun publish --access restricted"
"release:local":      "bun run build && cd packages/luca-framework && bun link"
```

**4 scripts** must be removed (or `build` retargeted to
`cd packages/luca && bun run build` if a root convenience alias is
desired).

The `catalog` block in root `package.json` also carries entries that
become orphans:
- `"@mastra/core": "1.34.0"`
- `"@mastra/libsql": "1.10.1"`
- `"@mastra/memory": "1.18.1"`
- `"mastracode": "0.19.0"`

These are referenced ONLY by `luca-framework`'s and `luca-mastracode`'s
`package.json` (both deleted in Phase H). Safe to drop from the
catalog too, though leaving them costs nothing.

### D. Other root files

`bunfig.toml`, root `tsconfig.json`, `.changeset/` config, `.gitignore`,
root `CLAUDE.md` / `AGENTS.md` / `README.md` — **all preserved**. Some
may need a documentation sweep (caveat 4 in parity report).

## 8. Files to PRESERVE

### Explicit allowlist for Phase H

| Path | Why |
|---|---|
| `.luca/archive/00-legacy-planning/` | **Required by plan §9** — the slim-down specs. Confirmed present, 10 top-level dirs (`codebase`, `done`, `migration`, `milestones`, `notes`, `planning`, `plans`, `research`, `summaries` + `.` itself). |
| `packages/luca-cli/` | Active. |
| `packages/luca-core/` | Active. |
| `packages/luca-tools/` | Active. |
| `packages/luca/` | Active umbrella. |
| `packages/luca-studio/` | Orthogonal Next.js dashboard. Not affected by Phase H. |
| `.changeset/` (the directory itself) | In pre-alpha mode (`pre.json` mode: "pre", tag: "alpha"); contains 18 queued changesets. See §9. |
| `docs/repo-restructure-plan.md`, `docs/repo-restructure-parity-report.md`, `docs/v13-write-surface-migration.md`, `docs/parity-review/` | Canonical migration record. |
| Root config files (`package.json`, `tsconfig.json`, `bunfig.toml`, `.gitignore`, `eslint.config.*`, `prettier.config.*`, `bun.lock`) | Required for monorepo to function. |
| `bin/` (root), if present | Not relevant — repo root has no `bin/`. |
| `CLAUDE.md`, `AGENTS.md`, `README.md` | Documentation — needs a sweep, not a delete. |

## 9. Changeset / version-bump implications

### Current changeset state

- `.changeset/pre.json` is in `mode: "pre"`, `tag: "alpha"`.
- 18 queued changesets target the **legacy packages**:
  `@alecsibilia/luca-framework` and `@alecsibilia/luca-mastracode`
  (declared in `pre.json.initialVersions` at `11.8.1` each, fixed
  together per `config.json.fixed`).
- The umbrella `@alecsibilia/luca` (13.0.0-alpha.0) has **no
  changeset queued** for the Phase H deletions or for the
  initial publish.

### What Phase H needs alongside the deletions

1. **Add a new changeset entry** for the umbrella package
   `@alecsibilia/luca` covering the 13.0.0-alpha.0 → 13.0.0-alpha.1
   (or initial publish if alpha.0 hasn't shipped) describing the
   restructure + legacy removal. Minimum content:
   ```
   ---
   '@alecsibilia/luca': minor
   ---
   Phase H: removed legacy luca-framework + luca-mastracode packages.
   The umbrella is now the sole shippable artifact.
   ```
2. **Decide on the 18 queued changesets** targeting the dead packages:
   - **Option A (recommended): exit pre-mode**, run
     `bunx changeset version` to flush them into the legacy
     packages' CHANGELOGs as a final 12.x.y entry, then delete
     `packages/luca-framework/` + `packages/luca-mastracode/`. The
     CHANGELOG entries become historical record (preserved in git
     history; lost from working tree along with the parent
     directories — that's fine).
   - **Option B: discard them.** Delete the 18 `.md` files from
     `.changeset/` along with the legacy packages. Cleaner working
     tree; loses the changeset documentation. Defensible because
     the legacy packages are being abandoned, not maintained.
   - **Option C: leave them in place.** `changeset publish` will
     fail because the target packages no longer exist. Phase H
     must address this somehow — leaving alone is not viable
     long-term.
3. **Update `.changeset/pre.json`**:
   - Either exit pre-mode (`bunx changeset pre exit`).
   - Or update `initialVersions` to drop the dead-package entries
     and add `@alecsibilia/luca: 13.0.0-alpha.0` if staying in pre.
4. **Update `.changeset/config.json`**:
   - Drop the `fixed: [["@alecsibilia/luca-framework",
     "@alecsibilia/luca-mastracode"]]` rule.

### npm publish gate

The umbrella's `package.json` is publish-ready
(`publishConfig.access: public`, `files: ["bin", "dist", "README.md",
"LICENSE"]`, `prepublishOnly: bun run build`). PUBLISHING.md confirms
the tarball is 245.27 kB / 122 files. Once Phase H lands, **publish
should work**, gated on the changeset workflow above.

The PUBLISHING.md instructions for `npm deprecate
"@alecsibilia/luca-framework@<=12.0.0-alpha.16"` remain valid and
should be executed as part of the Phase-H publish flow (per the
handoff memory).

## 10. Phase H blockers (if any)

**No blockers.** All gates passed:

- TS-level imports: 0 from dying packages → active code.
- Build chain: umbrella self-contained.
- Workspace siblings: no active package lists dying packages as a
  dependency.
- `.luca/archive/00-legacy-planning/`: present, preserved.
- Phase G parity report verdict: READY WITH CAVEATS, caveats
  explicitly non-blocking.

The four caveats below are *all* tracked v14 work, not Phase H
prerequisites:

1. F1 — `luca confidence log` schema (`packages/luca-cli/src/write-
   surface/handlers/luca-confidence-log.ts` still on v13 shape).
2. F3 — `luca state advance` ledger emission (zero ledger calls in
   `luca-state-advance.ts`).
3. Hook handler distribution — bundled `settings.json` references
   6 new hook handlers that `writeProjectSkeleton` does not copy
   into target projects.
4. Residual `.planning/` writes + dropped `luca run` references in
   `vault-init.ts` / `init.ts` / `utils/vault-setup.ts` /
   `utils/runtime-context.ts` / `utils/version-check.ts`.
5. (Surfaced by this review, partial overlap with #4) Stale
   `lu-planner` subagent prompts in 7 skill bodies — runtime
   degradation only; not a build break.
6. (Surfaced by this review) Stale `.cursor/luca/...` doc-path
   references in 12+ skill bodies — runtime degradation only.

None of these prevent the `packages/luca-mastracode/` and
`packages/luca-framework/` directories from being deleted today.

## 11. Recommendations

### A. Phase H deletion order (lowest-risk first)

1. **Edit root `package.json` first.** Remove the 4 doomed scripts
   (`build`, `mastracode`, `publish:framework`, `release:local`).
   Optionally update the `catalog` to drop `@mastra/*` and
   `mastracode`. Commit this alone — easy to revert if something
   surprising surfaces.
2. **Resolve changesets** per §9. Either exit pre-mode and publish
   one final 12.x.y patch for the legacy packages (option A) or
   delete the 18 queued `.md` files (option B). Update `pre.json` +
   `config.json` accordingly. Commit.
3. **Add the umbrella's restructure changeset entry.** Tagged
   `@alecsibilia/luca: minor` (or `major` if treating 13.0.0
   as a hard reset). Commit.
4. **Delete `packages/luca-mastracode/`.** `git rm -r`, commit.
5. **Delete `packages/luca-framework/`** (which sweeps `.cursor/`,
   `.pi/`, `.mastracode/`, `.planning/` legacy support trees in one
   go — they live inside this directory). `git rm -r`, commit.
6. **Run `bunx --bun tsc --noEmit` from each active package** as a
   smoke check. Expected: all green (matches Phase G report).
7. **Run `cd packages/luca && bun run build`** to verify the
   umbrella still produces a clean `dist/` + `dist/claude/`.
   Expected: 245.27 kB / 122 files tarball.
8. **Final documentation sweep** — root `README.md`, `AGENTS.md`,
   `CLAUDE.md`. Replace `@alecsibilia/luca-framework` install
   instructions with `@alecsibilia/luca`.

### B. Defer to v14 (do NOT block Phase H on these)

- F1 + F3 (per D2 / parity §7).
- Hook handler distribution (caveat 3).
- `vault-init.ts` `.planning/` rewrite + `luca run` string sweep
  (caveat 4) — this also fixes the cosmetic
  `@alecsibilia/luca-framework` references in
  `runtime-context.ts` + `version-check.ts`.
- Skill-body sweep for `lu-planner` references — either restore the
  subagent (reversing §5.6) or rewrite to `architect` + `Task()`.
- Skill-body sweep for `.cursor/luca/...` doc pointers — inline or
  drop.
- `packages/luca-core/README.md` mention of `luca-mastracode` /
  `luca-framework` (cosmetic).
- `packages/luca-studio/lib/types.ts` JSDoc `@see` references to
  deleted `packages/luca-framework/src/...` paths (cosmetic).

### C. One-time housekeeping observation

The `packages/luca-framework/` directory at deletion time will sweep
roughly **248 tracked files** plus `node_modules/` plus `dist/`. The
`packages/luca-mastracode/` deletion sweeps roughly **174 tracked
files** plus `node_modules/`. Combined: ~422 tracked files leaving
the working tree in two commits. Git history is preserved, so the
v12 source-of-truth remains recoverable indefinitely.

---

**Audit complete. Phase H is structurally clear for execution.**
