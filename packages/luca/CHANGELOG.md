# @alecsibilia/luca

## 13.0.0-alpha.10

### Minor Changes

- fcf20bf: Ship a Claude Code statusline with `luca init`.

  A new bundled statusline script renders a single-line TUI footer: model name, repo + git branch (with dirty marker), context-window usage as a colored 10-slot bar chart (green → yellow ≥60% → red ≥80%, with token counts derived from the session transcript's main-chain usage records), luca pipeline step + phase progress from `.luca/state.json`, and session line delta.

  Delivery follows the hook-handler pattern:
  - **Source** (`luca-tools`): `src/statusline/handler.ts` — self-contained, fail-open bun script (always exits 0; every segment degrades independently).
  - **Build** (`luca` umbrella): `build:done` bundles it via `bun build --target bun` to `dist/claude/.claude/luca-statusline.ts`.
  - **Install** (`luca-cli`): new `installStatusline()` helper wired into `luca init` Step 4 — copies the script to `~/.claude/luca-statusline.ts` and merges a `statusLine` entry into global `settings.json`. A user-authored custom statusline is never clobbered (registration is skipped); a luca-owned entry is refreshed idempotently.

- fcf20bf: Mirror the legacy-environment cleanup in `luca doctor` so consumers can remediate too.

  Three new doctor checks (all with `--fix` remediation) cover the debris classes found in the 2026-06-09 legacy audit:
  - **Legacy global Claude artifacts** (global): detects orphaned pre-v13 files in `~/.claude/` by curated name list — the 9 v12 `luca-*.md` agents and 4 retired rules (`state-machine-bridge`, `complexity-gating`, `gate-enforcement`, `harness-verification`) whose stale instructions leak into every session (the source of invented commands like `luca suspend`). `--fix` moves them to `~/.claude/.luca-legacy-backup/` (reversible), never touching user-authored files.
  - **Shared-tmp luca payloads** (global): detects stray pre-v13 `/tmp/luca-*.json` handoff payloads (the cross-repo collision class now blocked by the stage-gate). `--fix` deletes them. Found 49 on the reference machine.
  - **Luca gitignore coverage** (project): warns when a luca-managed repo's `.gitignore` is missing managed entries (e.g. the newly added `.playwright-cli/`). `--fix` runs the same idempotent top-up as `luca init`.

  Also exports `ensureLucaGitignore` / `LUCA_GITIGNORE_ENTRIES` from the init barrel for reuse.

### Patch Changes

- fcf20bf: Block legacy shared-tmp `/tmp/luca-*` handoff payloads and document the canonical `.luca/tmp/` staging path.

  `/lu` sessions occasionally staged CLI handoff payloads (e.g. the `luca checks run` commands array) at the pre-v13 shared location `/tmp/luca-checks-NN.json`, where concurrently-running repos overwrite each other's files. Two-layer fix:
  - **Enforcement** (`luca-core`): `classifyWritePath` now always-denies `/tmp/luca-*` and `/private/tmp/luca-*` with a reason that redirects to `.luca/tmp/<kebab-name>.json`. Covers both native `Write`/`Edit` targets and Bash redirects via the stage-gate hook.
  - **Instructions** (`luca-tools`): the `luca-write-surface` skill now documents the `.luca/tmp/` staging convention for all `--file` payloads, and the `lu` skill/command tables plus the execute/review/finalize modes spell out `--file .luca/tmp/checks.json` instead of leaving the path to the model.

  Also updates classifier tests (new deny cases; fixes a stale assertion that pre-dated the `toLucaRelative` segment fallback).

- fcf20bf: Classify `playwright-cli` as read-only in the stage-gate bash classifier.

  `playwright-cli` (the browser UAT driver) was missing from `READONLY_COMMANDS`, so it fell through to the unknown-command → `bash-mutate` default and was blocked during PLANNING/REVIEWING — exactly the pipeline steps where visual verification belongs. It observes a running app and never mutates repo files (screenshot output is UAT evidence, same tier as stdout), so it now classifies as `bash-readonly`. Shell redirects on a `playwright-cli` invocation still escalate to mutate, and the always-denied path rules are unaffected.

- fcf20bf: Keep browser UAT artifacts out of the worktree.

  With `playwright-cli` now classified read-only (runnable at any pipeline step), its screenshot output was landing in the repo root — debris that can't be `rm`'d during read-only steps and risks being swept into commits. Two-part fix:
  - **Convention** (shared subagent prefix): all UAT evidence goes under `.playwright-cli/` (`playwright-cli screenshot --filename=.playwright-cli/<name>.png`), never the repo root.
  - **Hygiene** (`luca init`): `.playwright-cli/` added to the managed `.gitignore` entries (idempotent top-up on re-init), so mid-pipeline UAT never dirties commits. The shadow scanner already sweeps the directory at milestone close, which remains the evidence lifecycle.

- fcf20bf: Purge legacy v12 commands from shipped instruction bodies.

  A legacy audit found pre-v13 commands surviving as actionable instructions in the shipped artifact set, causing LLM sessions to invoke nonexistent commands:
  - **`bun run commit --message=... --type=... --skip-checks`** (14 sites across `phase-execute`, `quick`, `project-new`, `session-pause`, `milestone-complete`) — a repo-specific v12 script. Replaced with plain `git commit` using conventional messages (`{type}({scope}): {subject}` per `luca preferences read`).
  - **`bun run ./src/harness/runner.ts`** (3 sites in `phase-execute`) — the v12 harness, which doesn't exist in v13. Replaced with `luca checks run --file .luca/tmp/checks.json` and its real output contract (`{ passed, summary }`, exit 0/1).
  - **`luca branch-guard assert-not-default`** (executor subagent + execute/finalize/triage modes) — wrong syntax for a command that is actually `luca branch guard`; output fields corrected to the real `{ ok, current, default, message }` contract.
  - **`luca milestone` CLI surface** (finalize mode) — no such command exists; reworded to reference the LUCA_DIR_CONTRACT milestone paths (a sanctioned milestone write surface is tracked as a backlog item).

  Remaining v12 debris (the `src/iteration/*` subsystem embedded in `phase-execute`, and the orphaned `luca-framework`/`luca-mastracode` packages) is tracked in the MuninnDB backlog as phase-sized work.

- fcf20bf: Fix unresolvable `subagent_type` references in shipped skills.

  Claude Code resolves agent types by **normalized display name only** (`executor` → `Executor`, `plan-reviewer` → `Plan Reviewer`); frontmatter `id` is not consulted. Three values used by the shipped skills never matched any installed agent's name:
  - `subagent_type="reviewer"` (12 sites) → `"Code Reviewer"`
  - `subagent_type="architect"` (2 sites) → `"luca: Architect"`
  - `subagent_type="debater"` (2 sites) → `"Adversarial Debater"`

  This is how pipeline sessions ended up spawning the orphaned v12 shadow agents (`luca-executor`, `luca-planner`): when the correct spawn failed to resolve, the model fell back to the v12 files whose descriptions explicitly advertise themselves for the skill (e.g. "Invoked by /phase-execute") — and broke entirely once `luca doctor --fix` removed those shadows. With the references fixed, the v12 shadows are now truly inert and safe to prune.

  Verified empirically: all remaining `subagent_type` values resolve against the v13 roster via the normalization rule.

## 13.0.0-alpha.9

### Minor Changes

- 433c780: Add confidence-gated full-auto `/lu` — the pipeline now pauses only where its own confidence is low and unresearchable.

  Redefines `full-auto` from "never pause" to "autonomous; pauses only on confidence-gate `ask` items (low-confidence + unresearchable) and CRITICAL safety". Delivered in four parts:
  - **Substrate** (`luca-core`): optional `researchable`/`resolution` fields on `ConfidenceEntrySchema`; a pure `selectConfidenceGateActions()` bucketer (`auto`/`research`/`ask`, with `medium → auto` and fail-toward-`ask`); a read-only `luca confidence gate` CLI.
  - **Emission** (`luca-cli` + `architect` mode): `luca confidence log` gains `--researchable`/`--resolution`; the architect mode-agent logs a confidence entry per non-trivial plan-time decision.
  - **Controller** (`lu` skill + command): a Confidence Gate sub-step runs at the tail of `plan-review` — routes `auto` silently, spawns a `researcher` for `research` items, asks the user (via AskUserQuestion) for `ask` items; persists resolutions to `plan-review.md` and injects them into the executor. `ask` items are the sole pause in `full-auto`.
  - **Docs**: `docs/decisions/confidence-gated-lu.md`.

  No state-machine (`OversightMode`, `pipelineStep`) changes — the 3-level oversight enum is unchanged; the gate is orchestrator prose. Follow-ups tracked: a `luca confidence resolve` for a true re-emit/re-gate loop, and a fix for the `review → execute` transition gap.

### Patch Changes

- 433c780: Remove the resurrected `autopilot` skill; `lu` is the single pipeline entry point again.

  The v13 restructure re-introduced a standalone 1,302-line `autopilot` skill, reverting the v5.1.0 (Phase 182) decision that had deleted it and folded its capability into the unified `lu` entry point. This drops `autopilot` again: the skill body, its three skills-registry references, the `lu` → `autopilot` routing indirection, and the stale `/autopilot` mention in `phase-discuss`. The shipped skill set goes from 42 to 41.

  (The unused `luca-studio` package removal was split into its own PR.)

## 13.0.0-alpha.8

### Patch Changes

- 07c3304: Reconcile where the repo vault name lives in `.luca/config.json`: the canonical location is `muninn.vault`.

  `luca init`'s project skeleton wrote a **top-level** `vault: null` key, while `luca vault:init` writes `muninn.vault` — so a fully set-up project ended up with both a dead top-level `vault: null` and the real `muninn.vault`. The top-level key was never primary (`resolveRepoVault` only reads it as a legacy fallback), so it was dead weight that misled anyone reading the config.
  - **Writer fix:** the `init` skeleton now writes `muninn: { vault: null }` (the canonical, self-documenting placeholder) instead of a top-level `vault: null`. `luca vault:init` fills it in later by merging into `muninn`.
  - **Migration:** a new `luca doctor` project-scope check ("Vault config location") flags an existing top-level `vault` key and, under `luca doctor --fix`, normalizes it — folding a non-empty top-level value into `muninn.vault` when `muninn.vault` is unset, then removing the stale top-level key (all other config keys preserved).

  `resolveRepoVault` keeps its legacy top-level `vault` fallback for back-compat, but nothing writes there anymore.

## 13.0.0-alpha.7

### Patch Changes

- cb0f81e: Fix the pipeline state machine: restore missing re-entry edges and replace the `milestone`/`complete` steps with a terminal `finalize` step.

  The transition table only encoded the happy path, so transitions the mode instructions document were illegal and rejected at runtime by `isLegalTransition`:
  - **`review → execute`** (MUST-FIX/SHOULD-FIX iteration) was missing — a blocking review finding could not loop back to fix and was silently carried forward to `learn`.
  - **`finalize`'s gap-detection / postmortem re-entries** (`→ execute`, `→ review`) were dead.

  It also promoted `milestone` and `complete` to pipelineSteps, conflating a work-organization concept (a milestone = a set of phases) with the per-phase lifecycle — leaving `finalize` with no real home (it squatted on `learn`/REVIEWING, where the stage-gate blocks the commits and `gh pr create` that PR creation needs).

  This collapses the machine to 13 steps with `finalize` as the terminal mode:
  - Steps: `idle, triage, research, discuss, architect, plan, plan-review, execute, checks, verify, review, learn, finalize`.
  - Transitions: `review: ['learn','execute']`, `learn: ['plan','finalize']`, `finalize: ['idle','execute','review']`.
  - `finalize → FINALIZING` coarse phase (permits commits — fixes the latent PR-creation block) and resets the run to `idle`; one run finalizes one milestone (fresh `/lu` for the next).
  - Legacy `state.json` with `milestone`/`complete`/`cleanup` folds to `finalize` via `LEGACY_PIPELINE_STEP_MAP`, so in-flight state still parses.

  Also conforms the coarse mode bodies to the fine table (`research → discuss`, `architect → plan`, `triage → research`) so they no longer self-advance into illegal transitions, makes `finalize`'s entry-time advance idempotent (advance only if still at `learn`), and sweeps the instruction surface plus step-keyed tables (coarse-phase map, step artifacts, context-refresher, continuation-messages) to the new vocabulary.

## 13.0.0-alpha.6

### Patch Changes

- 5cb75c4: Stop prompting for a MuninnDB API key per vault during vault setup.

  The MuninnDB API key is **instance-level**, not per-vault: one MuninnDB
  instance issues one key that reaches every vault, because the vault is a
  per-tool-call parameter (`muninn_recall(vault, …)`), not an auth boundary. A
  single registered `muninn` MCP server therefore covers all current and future
  vaults. The wizard previously prompted for a key on every `luca vault:init`
  (and `luca init`, which delegates to it), implying each vault needs its own —
  and `writeApiKeyToEnv` wrote the same key value under three names
  (`MUNINN_DB_<VAULT>_API_KEY`, `MUNINN_DB_DEFAULT_API_KEY`, `MUNINN_DB_API_KEY`).
  Writing all three was redundant: consumers that look up a per-vault/default key
  (e.g. luca-studio's `muninn-config`) already fall back to the generic
  `MUNINN_DB_API_KEY`, and the instance-level key is valid for every vault — so a
  single generic var suffices.

  Changes:
  - **Decouple the vault name from the API key.** `runVaultWizard` always
    records the vault name; it only asks for an API key when **no `muninn` MCP
    server is registered yet** (detected via the shared `isMuninnRegistered`
    helper, extracted from the `muninn-mcp` doctor check). When one is already
    registered, it records the vault name and skips the key entirely. When the
    key is left blank it still records the vault name (previously aborted).
  - **Reword the prompt** to say the key is a one-time, instance-level credential
    for registering the MCP server — not a per-vault secret.
  - **Simplify `writeApiKeyToEnv`** to write a single `MUNINN_DB_API_KEY` (the
    per-vault aliasing was redundant — same value under multiple names, and
    consumers fall back to the generic key).
    `VaultConfig.apiKey` is now optional, and `vault:init` only writes `.env`
    when a key was actually captured.

## 13.0.0-alpha.5

### Patch Changes

- b06dd99: Session-scope the stage-gate hook so a pipeline running in one terminal no
  longer fences off ad-hoc work in another terminal in the same repo.

  Previously the PreToolUse stage-gate read the shared `.luca/state.json` and
  enforced the current `pipelineStep` phase/tool matrix against **every**
  session in the repo. A separate out-of-workflow terminal doing cleanup would
  inherit the pipeline's phase restrictions — e.g. a `flutter test` run blocked
  with `stage-gate BLOCK: Bash (category=bash-mutate) is not allowed in
phase=REVIEWING (pipelineStep=learn)` purely because a pipeline was mid-run
  elsewhere.

  Changes:
  - Add `ownerSessionId` to `lucaStateSchema` — the Claude Code `session_id`
    (read from PreToolUse stdin) of the session driving the current run.
    Distinct from `sessionId`, which is the generated pipeline run-id used for
    ledger grouping and the lock `run_id`.
  - Add a `luca state claim-owner --session-id=<id>` write-surface command that
    records `ownerSessionId`. The stage-gate hook invokes this handler on every
    `luca state advance` (the orchestrator-only command) rather than writing
    `state.json` directly — so the invariant "`.luca/state.json` is mutated
    solely through the `luca` write surface" is preserved: every `state.json`
    byte-write is owned by a registered write-surface handler. Re-stamping on
    each advance re-homes ownership when a new run starts in a different session.
    Best-effort — a stamp failure never breaks the gate.
  - Non-owner ("bystander") sessions are exempted from the phase/tool matrix.
    The exemption runs **after** the always-denied path/command checks
    (`.git/`, `~/.claude/`, pipe-to-shell, …) and after `artifactPathGate`, so
    the security floor and `.luca/` artifact protection still apply to all
    sessions — only the phase-ordering matrix is relaxed.

  Failure direction is conservative: unknown owner or unknown session falls
  through to full enforcement, so the gate is only ever relaxed for a session
  we are confident is a non-owner.

  Also hardens two stage-gate classification bugs surfaced by a real run:
  - **cwd-robust artifact classification.** `classifyWritePath` resolved the
    `.luca/`-relative path via `relative(cwd, path)`, which only works when the
    hook's `cwd` is the repo root. When a subagent/harness invoked the hook from
    a subdirectory, a legal artifact write (e.g. `verify.json` at the `verify`
    step, `learn.md` at `learn`) normalized to `../../.luca/…`, fell through to
    the `code` class, and the matrix wrongly blocked it during REVIEWING/PLANNING.
    A shared `toLucaRelative` resolver now locates the `.luca/` path segment
    directly, so artifact classification is cwd-independent; the stage-gate hook
    uses it for both classification and the artifact-path gate.
  - **bash classifier over-blocking.** Read-only text filters (`sort`, `uniq`,
    `cut`, `tr`, `comm`, `diff`, `jq`, `rg`, `column`, `nl`, `tac`, `rev`,
    `paste`, `fold`, `join`) were missing from the read-only allowlist, so any
    pipeline through one (e.g. `find . | sort`) promoted to `bash-mutate` and was
    blocked in restrictive phases. Recognized top-level `luca` commands
    (`version`/`telemetry`/`rules` as read; `init`/`repair`/`doctor`/`retro`/…
    as `luca-write`) no longer fall through to `bash-mutate` either.

- b06dd99: Follow-up fixes from a real v13 run (Ramora report) — state-write safety, a
  recovery primitive, and version/doc hygiene.
  - **C1-residual — never clobber an active `state.json`.** `writeProjectSkeleton`
    could (with `force`) overwrite an existing `state.json` with a fresh idle
    skeleton + a brand-new `sessionId` — exactly the "state wiped mid-pipeline"
    symptom. The state.json write now refuses to overwrite an ACTIVE state (a
    non-idle pipelineStep, a non-empty roadmap, or currentPhase>0) even under
    `force`; `force` still refreshes an idle/empty skeleton.
  - **M2 — `luca state set-current-phase <n>` recovery primitive.** Adds a
    lock-serialized write-surface command to position `currentPhase` directly to
    a 1-based phase number (marking it in-progress). Previously `roadmap create`
    always activated phase 1 and `phase advance` only moved +1 at the `learn`
    step, so restoring position after a roadmap reset meant walking the pipeline
    once per phase. Validated `1..totalPhases`.
  - **C2 — fix stale `luca confidence log` flags.** The `luca-write-surface`
    reference skill documented the removed `--score/--stage/--rationale` shape;
    updated to the canonical `--phase/--wave/--task/--confidence/--category/
--decision/--reasoning/--risk` (or `--file <json>`) surface.
  - **M4 (part) — config-vs-CLI version-skew doctor check.** `lucaVersion` in
    `.luca/config.json` is written once at init and never reconciled, so it goes
    stale after a CLI upgrade. Adds a project-scoped `luca doctor` check that
    warns on skew and reconciles it under `luca doctor --fix` (preserving all
    other config keys). Skipped in dev builds.

## 13.0.0-alpha.4

### Patch Changes

- 0e464b6: Reconcile the v13 agent roster so every agent a skill spawns actually ships, and restore the beneficial tooling the port dropped. Previously skills referenced a dozen v12 agents that don't exist in v13 (they fell back to generic read-only agents), and the verification tribunal / model-tier routing referenced dropped subsystems.

  **New subagents (ported — genuinely reusable primitives):**
  - `test-writer` — authors focused, non-vacuous tests and runs them; tests are first-class in v13 again, and the tribunal uses it to settle a dispute with an empirical repro.
  - `debater` — stance-parameterized adversarial validator (DEFEND/CHALLENGE a proposition with calibrated confidence). The reusable primitive behind the verification tribunal and any decision that benefits from adversarial validation.

  **Extended:** `reviewer` gains an `integration` perspective (cross-phase wiring), replacing the dropped `lu-integration-checker`.

  **Verification tribunal** re-implemented on v13 agents: `debater` (defender/challenger) + `test-writer` (empirical repro) + `reviewer` (integration), with the orchestrator arbitrating by confidence-weighted majority. Used in phase-execute (diagnostic + root-cause tribunals) and milestone-audit (rebuttal round).

  **Dropped agents folded into existing agents / inline orchestration** (no dangling spawns): `lu-research-synthesizer`→`researcher`; `lu-roadmapper`→inline `luca roadmap create` (matching milestone-new); `lu-discuss-researcher`→`researcher`; `lu-repo-architect`→`architect`; the roadmap-revision swarm (`lu-pm-planner`, `lu-roadmap-architect/prioritizer/qa/synthesizer`)→`architect`/`reviewer` role spawns; `lu-cognition` (pre-flight) and `lu-router` (complexity) → inline orchestrator steps; `lu-pm-planner` (session WSJF)→`architect`.

  **Removed** the stale `resolveModelForAgent` / `model-routing.ts` prose across 6 skills — that module was never ported to v13; agent model tiers come from each agent's own definition / the harness default.

  Net roster: 10 subagents (was 8) + 10 mode-agents. Every `subagent_type=` across all skills now resolves to a real v13 agent.

- 0e464b6: Fix skills spawning non-existent v12 agent names. The mastracode→luca-tools port renamed the agents (dropped the `lu-` prefix, consolidated reviewers into one `reviewer` subagent) but the skill bodies still used the old names — so `/lu` and friends spawned `subagent_type="lu-executor"`, `"lu-verifier"`, `"lu-phase-researcher"`, `"code-architect"`, etc., which don't resolve to any installed v13 agent. Claude Code then fell back to a generic/read-only agent that lacked the real agent's tools and instructions, which is why subagents "couldn't write" their own artifacts and the orchestrator had to persist everything.

  Renamed across all skills (both `subagent_type=` spawn values and imperative prose): `lu-executor`→`executor`, `lu-verifier`→`verifier`, `lu-learner`→`learner`, `lu-phase-researcher`/`lu-project-researcher`→`researcher`, `lu-plan-checker`→`plan-reviewer`, and the per-perspective reviewers (`code-architect`/`dx-advocate`/`code-simplifier`/`security-auditor`/`ui`)→`reviewer` (perspective passed in the prompt).

  Resolved in this PR (agent-roster reconciliation): the tribunal pattern is re-implemented as the `debater` subagent (defend/challenge) plus the `integration` reviewer perspective; `test-writer` is restored as a first-class subagent; roadmap creation is handled inline by the orchestrator via `luca roadmap create`; and the stale `resolveModelForAgent`/`model-routing.ts` prose is removed (model tiers come from each agent's own definition in v13). No v12 agent names remain unaccounted for.

- 0e464b6: Fix `.luca/state.json` corruption / step-reversion under concurrent agents. A live `/lu` run saw `pipelineStep` revert (the verifier read `checks` while the orchestrator had advanced to `verify`): state mutations did an unlocked read-modify-write, so a concurrent or stale-state write from a subagent could clobber the orchestrator's update, and `loadCurrentState` silently returns schema defaults (`idle`, `currentPhase: 0`) on any read hiccup.
  - New `mutateState` / `withStateLock` helpers serialize every `state.json` write behind an exclusive on-disk lock (with stale-lock stealing so a crashed holder can't deadlock). `state-advance`, `roadmap-create`, `phase-advance`, and `workflow-reset` now go through them — verified: 30 concurrent mutations land 30 updates with zero losses.
  - `mutateState` reads strictly: it **refuses to mutate** when `state.json` is missing or malformed rather than overwriting an active workflow with defaults.
  - Subagent shared prefix now forbids state-mutating `luca` commands (`state advance`, `roadmap create`, `phase advance`/`archive`, `workflow reset`) — pipeline state is the orchestrator's; subagents read state and write only their one artifact.
  - Added `state.json.lock` to the `.luca/` contract so the structural scanner treats the transient lock as legitimate.

- 0e464b6: Fix `luca verification` (and `luca <noun> --help`) being blocked by the stage-gate. The bash classifier's `LUCA_NOUN_VERBS` was missing the real, read-only `verification` command (`read` / `aggregate`), so `luca verification …` classified as `bash-mutate` and was refused in PLANNING/REVIEWING. Added `verification` to the allowlist (read verbs), and `--help`/`-h`/`--version` now classify read-only for ANY noun instead of falling through to `bash-mutate`. Note: `-v` is deliberately NOT treated as a version flag — it's the CLI's `--verbose` alias, so honoring it would let a mutating command (e.g. `luca doctor --fix -v`) bypass the gate.
- 0e464b6: Fix the orchestrator-owns-memory-I/O boundary so the learner (and every subagent) stops silently failing to persist.

  Subagents have no MuninnDB/MCP access, yet several subagent bodies still instructed them to call `mcp__muninn__*` and run `luca retro postmortem`. Those calls silently no-op'd: the learner produced excellent structured learnings but never reached MuninnDB, and `learn.md` was never written because the body deferred persistence to a tool the subagent can't reach.

  The fix establishes a single rule — **memory I/O belongs to the orchestrator** — and rewires the artifacts accordingly:
  - `shared-prefix.ts`: replaced the "Pre-Invoke Memory Recall" section with "Memory I/O Is the Orchestrator's Job" — subagents never call `mcp__muninn__*`; prior context is supplied in the prompt, and insights are RETURNED for the orchestrator to persist. Also added a Core Operating Rule forbidding state-mutating `luca` commands from subagents.
  - `learner.ts`: drops the MuninnDB/postmortem invocations; now (1) writes `learn.md` via the Write tool and (2) returns a machine-parseable `TO_PERSIST` block annotated with each entry's target vault.
  - `shadow-scanner.ts`: the orchestrator now supplies the kept-list (`shadow-debt:kept`) and pending backlog; the scanner returns a `metric` block for the orchestrator to persist.
  - `discussion.ts`, `executor.ts`: historical context is now orchestrator-supplied rather than self-recalled.
  - `lu` (skill + command), `phase-execute`, `repo-cleanup` (skill + command): the orchestrator now persists the learner's `TO_PERSIST` learnings via `muninn_remember_batch` (routed per entry vault) and the shadow-scanner's scan metric, and recalls + supplies the kept-list before spawning the scanner.

  Also fixes a stale-rename collision: `commands/phase-plan.ts` referenced the dropped legacy planner as `architect` (self-contradicting the live architect mode-agent); restored to `lu-planner`.

- 0e464b6: Address PR #278 review (batch 2): finish the orchestrator-owns-memory-I/O alignment and fix two more bootstrap/tooling gaps.
  - **Subagent `muninn-recall` contradiction**: `debater`, `test-writer`, `reviewer`, `researcher`, `plan-reviewer`, `discussion`, and `executor` all declared `pipelineInvocations: ['muninn-recall']`, which the compiler expands into a "Pre-invoke MuninnDB recall" instruction — directly contradicting the shared-prefix rule that subagents have no MCP access. Dropped `muninn-recall` from every subagent (CLI/Bash-based `rule-run`/`confidence-log`/`claim-verify` retained); the orchestrator supplies prior context in the prompt. Stale docstrings updated to match.
  - **`reviewer` could not write its artifact**: `allowedTools` omitted `Write`, but the reviewer's one assigned artifact is `audits/<reviewer>.md`. Added `Write`.
  - **`luca roadmap create` bootstrap**: it routed through strict `mutateState` and threw on a fresh workflow, even though it's a legitimate first-phase bootstrap. Now opts into `bootstrapIfMissing` (like `luca_state_advance`) — seeds an absent `state.json` from defaults under the lock while still throwing on a present-but-truncated file.
  - **`learner` slug discovery**: the body told the learner to run `luca phase current`, but it has no Bash. It now uses the orchestrator-supplied `{phase_slug}`; `phase-execute` resolves and passes it.
  - **shared-prefix wording**: clarified that the "write only your one assigned artifact" rule constrains `.luca/` pipeline artifacts only — it does NOT forbid `executor`/`test-writer` from editing production code.
  - **Changeset accuracy**: corrected the `-v` claim in the verification-classifier note (it's excluded, not read-only), and refreshed the "Still pending" list in the stale-names note (tribunal/test-writer/roadmap/model-routing are all resolved in this PR).

  Regression tests added for roadmap-create bootstrap (absent → seeded, truncated `{}` → throws) and a stale `currentPhase` assertion corrected to match the documented phase-1 activation.

- 0e464b6: Address PR #278 review: stage-gate `-v` bypass, state-mutation strictness/bootstrap, and reviewer-perspective directives.
  - **Stage gate (`classify-bash-command`)**: `-v` is the `--verbose` alias, not `--version`. Treating it as a version probe let mutating commands like `luca doctor --fix -v` classify as read-only and bypass the gate. The read-only shortcut now matches only `--help`/`-h`/`--version`.
  - **`mutateState` (`acquireLock`)**: ensure `.luca/` exists before the exclusive lock create, so `luca workflow reset` (and any bootstrap path) no longer throws `ENOENT` on an uninitialized workflow.
  - **`mutateState` strictness**: "strict" is now enforced before schema defaults apply — the raw JSON must contain the required `pipelineStep` key, so a truncated-but-valid `{}` is rejected instead of silently defaulting to `idle`/`currentPhase: 0` and clobbering an active workflow.
  - **`mutateState` bootstrap**: a new `bootstrapIfMissing` option distinguishes an ABSENT file (legitimate initialize/reset → seed from a supplied base) from a present-but-incomplete one (corruption → throw). `luca_state_advance` opts in, preserving the missing→defaults first-advance contract while staying strict on malformed reads.
  - **Reviewer spawns**: every `reviewer` Task in `phase-execute` and `milestone-audit` now declares an explicit `PERSPECTIVE:` (dx / simplification / architecture / security). The dead Tailwind/UI review (no such perspective on the consolidated reviewer, and this is a CLI repo) is repurposed to `test-quality`.
  - **Grammar**: "spawn a executor" → "an executor" in `quick`.

  Regression tests added for the `-v` non-bypass, the incomplete-`{}` rejection, `bootstrapIfMissing` semantics, and lock-dir creation.

## 13.0.0-alpha.3

### Patch Changes

- 871d206: Add `luca phase advance` to close the phase-lifecycle gap for multi-phase roadmaps. Nothing advanced `currentPhase` between phases, so after phase 1 a multi-phase roadmap stalled at the 1→2 boundary (every phase-2 artifact path resolved against the wrong/no slug). The new command bumps `currentPhase → currentPhase+1`, marks the finished phase `complete` and the next `in-progress`, and errors if no phase is active or already at the final phase. It's registered as a `luca-write` verb in the stage-gate bash classifier, and the `/lu` orchestrator now calls it at the `learn` step (when more phases remain) before advancing to `plan` for the next phase.
- 871d206: Ship the `caveman` skill (ultra-compressed communication mode, ~75% fewer tokens). Seven v13 pipeline modes (triage, research, architect, execute, review, finalize, fast) instruct the agent to "activate the `caveman` skill", but the skill was dropped in the Phase D/E mastracode→luca-tools port and never shipped — so those references dangled and the token savings never applied on a fresh install. The skill is now ported into the luca-tools artifact set and registered in the manifest (skills 41→42). The companion mastracode `caveman` rule is intentionally not ported: v13 has no Claude Code rule-delivery target, and the modes invoke the skill directly. (Audit note: mastracode shipped only two rules — `caveman` and `pr-title-format`; the latter is superseded by the v13 preferences system + gh-prepare/gh-pr-address skills and used the removed `projectPreferences` tool, so it was not re-ported.)
- 871d206: Fix `milestone-complete` never archiving phase directories — prior-milestone phase dirs piled up in `.luca/phases/` and collided on phase number (e.g. several `01-*` dirs) with the next milestone's roadmap, violating the planning-structure contract. The skill only snapshotted roadmap/audit/backlog files to `.luca/milestones/`; the `archivedPhasePathFor` helper existed but nothing used it. New `luca phase archive` moves every `.luca/phases/<slug>/` → `.luca/archive/<slug>/` (idempotent — skips a slug already frozen under archive/, never overwrites), and `milestone-complete` now runs it during the close, before the workflow reset and next-milestone roadmap.
- 871d206: Fix the pipeline deadlocking immediately after `roadmap create` — the first phase never activated, so no phase artifact could be written.

  `luca roadmap create` reset `currentPhase` to `0` and a code comment deferred activation to "the orchestrator on the next transition" — but no command, state event, or skill step anywhere ever advances `currentPhase`. With `currentPhase=0`, `resolveActiveSlug` returns "no active phase", so the stage-gate hook can compute no canonical `.luca/phases/<slug>/` path: the researcher's `research.md` write is blocked as `code-write`, and a raw `mkdir` is blocked as `bash-mutate` — a chicken-and-egg with no channel to create the phase.

  `roadmap create` now activates phase 1 immediately (`currentPhase=1` when the roadmap is non-empty, else 0). Once a roadmap exists there is always a current phase, so `resolveActiveSlug` resolves and the first artifact write is permitted.

  Advancing between phases (N→N+1 as each phase completes) is handled by the companion `luca phase advance` command added in this release and wired into the `/lu` `learn`-step transition — so multi-phase roadmaps now progress end-to-end, not just single-phase ones.

- 871d206: Fix the stage-gate hook blocking the pipeline's own legal operations — a live `/lu` run stalled in the research step because read-only commands and the legal artifact write were misclassified as mutations.
  - **`classifyWritePath` now normalizes absolute paths.** Claude Code's `Write`/`Edit` pass an ABSOLUTE `file_path` (e.g. `/repo/.luca/phases/01-x/research.md`), but the classifier only matched repo-relative `.luca/` paths — so the legal `research.md` write classified as `code` and the matrix blocked it. It now takes an optional `cwd` and normalizes absolute paths to the repo-relative `.luca/` form for the contract check (always-denied system/home checks still run on the original absolute path). The stage-gate hook passes `cwd` and feeds the relative path to the artifact gate.
  - **`cd` (and `pushd`/`popd`) are now read-only.** They mutate shell state, not files. Agents prefix nearly every command with `cd <dir> && …`, so omitting `cd` made every compound command classify as `bash-mutate` and get blocked in read-only phases.
  - **`sed`/`awk` are read-only unless editing in place.** `sed -n '1,60p'` (print) and `awk '{…}'` (filter) read; only `sed -i…` / gawk `-i inplace` mutate. They were unconditionally treated as mutations.
  - **`luca --help` / `luca --version` are read-only.** `luca` with only flags (no noun) fell through to the unknown-command → `bash-mutate` path.

  Regression tests added for all four cases.

## 13.0.0-alpha.2

### Patch Changes

- 7eb7779: Add three `luca doctor` checks (and harden a fourth) that catch the environment problems v12→v13 upgraders hit during install:
  - **Global `~/.claude` symlinks** (`scope: global`, auto-fixable) — `lstat`-scans `~/.claude/{skills,commands,agents,hooks}` for broken symlinks left by older dev installs that pointed into a repo's former `dist/claude/`. These dangling links make `luca init` crash with `EEXIST: mkdir '.../.claude/skills/<name>'`. `luca doctor --fix` removes them.
  - **MuninnDB MCP wiring** (`scope: global`) — verifies the pipeline can actually reach memory: probes MuninnDB's MCP endpoint (`http://127.0.0.1:8750/mcp` — distinct from the `8476` service/dashboard port) and checks whether a `muninn` server is registered in `~/.claude.json` / project `.mcp.json`. Warns (never fails) with the exact `claude mcp add --transport sse …` command when it's up-but-unregistered or registered-but-down.
  - **Legacy global package** (`scope: global`) — warns when the pre-v13 `@alecsibilia/luca-framework` is still installed in Bun's global prefix alongside `@alecsibilia/luca` (both expose the same `luca` binary; whichever was installed last wins). Points at `bun rm -g @alecsibilia/luca-framework`.
  - **Stray-local-install hardening** — the existing check now uses `lstat` instead of `existsSync`, so dangling symlinks in a project's `.claude/` are detected (and removable by `--fix`) instead of being silently invisible.

- 7eb7779: Fix every Claude Code hook firing `Cannot find module '@alecsibilia/luca-core/ledger'` in consumer projects (PreToolUse/PostToolUse errors on every tool call).

  The umbrella build copied each hook handler (`pipeline-guard`, `continuation-messages`, `context-refresher`) verbatim into `dist/claude/.claude/hooks/<name>.ts`. Those handlers import private workspace packages (`@alecsibilia/luca-core/{ledger,orchestration,state}`) which are inlined into the umbrella's CLI bundle but are **not** present in a consumer's `node_modules`, so `luca init` laid down hooks that failed to resolve their imports on every fire (failing open, but noisy and non-functional).

  The build now **bundles** each handler with `bun build --target bun` instead of copying it, inlining the luca-core dependencies so the emitted handler is self-contained and runs anywhere bun is available. Verified: bundled handlers carry zero bare `@alecsibilia/luca-core` imports and execute cleanly.

- 7eb7779: Fix `luca init` crashing with `EEXIST: mkdir '.../.claude/skills/<name>'` when a target path is already occupied by a stale symlink or file.

  `installSkills` called `mkdir(target, { recursive: true })` and `copyFile` assuming clean destinations. `mkdir` with `recursive: true` is idempotent for real directories but throws `EEXIST` when the path is a dangling symlink (e.g. left by an older dev install that symlinked `~/.claude/skills/*` into the repo's former `dist/claude/` tree), and `copyFile` would write _through_ a stale symlink to its target instead of materializing a real file. The skill/command/agent install now clears any pre-existing non-directory entry (symlink/file) at each target before creating it, so install is robust and idempotent regardless of what previously occupied `~/.claude/`.

- 7eb7779: Fix `luca vault:init` pointing users at the wrong MuninnDB Web UI URL for API-key generation. The API-key prompt hardcoded `http://localhost:8477`, but the MuninnDB dashboard is served on the same port as the service (default `8476`), so the link was dead. The URL is now derived from `resolveMuninndbPort()` (`http://127.0.0.1:<port>`), honoring a `MUNINNDB_PORT` override instead of a hardcoded value.

## 13.0.0-alpha.1

### Patch Changes

- 4de0d5c: Bump entire Mastra dependency family in lockstep and pin them
  exactly in the published tarball.
  - `mastracode` 0.17.0 → 0.19.0
  - `@mastra/core` 1.31.0 → 1.34.0
  - `@mastra/libsql` 1.9.1 → 1.10.1
  - `@mastra/memory` 1.17.4 → 1.18.1

  Why: `mastracode` is built against an exact pin of `@mastra/core`
  and friends. We were publishing the framework with caret ranges
  (`^1.31.0`), so when users installed they got `mastracode@0.19.0`
  paired with whatever caret-resolved core happened to be hoisted —
  producing
  `Error: Exhausted all fallback models. Last error: Unsupported role: signal`
  because `@mastra/core@1.34` introduced a new `role: "signal"`
  message type that older provider adapters (still resolved via the
  caret range against the previous, hoisted core) do not recognise.

  Changes:
  - Pin every Mastra-family entry in the root `package.json`
    workspaces catalog to an exact version (no caret).
  - Add `minimumReleaseAgeExcludes` for the Mastra family in
    `bunfig.toml` so future bumps aren't blocked by the 7-day
    supply-chain cooldown (these are version-pinned by upstream
    and tracked in lockstep, so the cooldown adds no signal).
  - Add `scripts/validate-tarball-deps.ts` and wire it into the
    Release workflow between `bun pm pack` and `npm publish`. The
    script unpacks the tarball, inspects `package/package.json`,
    and fails the publish if any `mastracode`/`@mastra/*` dep is
    not exact-pinned. This blocks the regression class at the
    release boundary, not just at the source-of-truth boundary.

- acd822c: fix(luca:5-review): remove fenced block bug in reviewer spawn directive
  - review.md Step 4: replaced ` ``` ` fenced code block with 5-line `// →` inline
    directive prose. Fenced blocks are treated as illustrative documentation by
    LLM agents, not executable instructions — root cause of all 4 outer reviewer
    subagents returning success:false with durationMs:0.
  - Use Date.now() in correlationId pattern (was literal `<ts>` placeholder).
  - Add success:false variant for complete records (was hardcoded true).
  - reviewer.ts:107: "of the output block above" restores specificity (was "of
    your output" — ambiguous with two closing ` ``` ` in file).
  - subagent-telemetry-prose.test.ts: add fence-split regression test + Date.now()
    reference test to prevent recurrence.

  Closes #18

- 6d6af24: Fix `bun add -g @alecsibilia/luca-framework` failing with `error: GET .../@alecsibilia%2fluca-core - 404`.

  `@alecsibilia/luca-core` is a private, workspace-only package that ships bundled inside the framework tarball — inlined into `dist/index.mjs` and copied to `dist/node_modules/` for the bundled mastracode harness. It was incorrectly listed under `dependencies`, so on publish its `workspace:*` spec was rewritten to a concrete `0.1.0` and a consumer's package manager tried to resolve it from the npm registry, where it does not exist. It is now a `devDependency`, matching how the other private internal package (`@alecsibilia/luca-mastracode`) is already handled — consumers do not install devDependencies, and the bundled copies are self-contained.

  `validate-tarball-deps.ts` now also fails the publish if any private workspace package leaks into the packed `dependencies`, so this regression cannot recur silently.

- 2d3f799: Fix reviewer subagent usage self-report drift. reviewer-dx and reviewer-simpl perspectives did not emit the required usage comment because the instruction was buried in SUBAGENT_SHARED_PREFIX (prepended before reviewer-specific prose). Added reinforcing usage clarification as the terminal instruction in reviewer.ts (final bullet of the Constraints section) so it is the last directive the model reads before responding. Added presence + terminal-position test in subagent-telemetry-prose.test.ts to catch drift.
- a0cc70e: fix: harden telemetry prose to eliminate field-completeness drift

  Batch fix for 5 quality regressions surfaced by run `run_mp7dcrpm_ue0yzcb0`:
  - **Usage-comment field-completeness drift** (`model: null`, `tokens: 0`):
    add omit-on-unknown directive to `shared-prefix.ts` Luca Reminders and
    to every spawn-site in `execute.md`, `architect.md`, `finalize.md`,
    `review.md`. Agents must omit the entire `<!-- usage: ... -->` comment
    when `model` or token counts are unknown — never emit placeholder
    values.
  - **Fabricated `durationMs` round numbers** (`45000`, `60000`, `90000`,
    `120000`): require `durationMs = Date.now() - ts`, never a guess. Fix
    fabricated `execute.md:161` example (`12000` / `3400` / `45000`) to
    realistic primes and `Date.now() - ts`.
  - **`success: null` on `record-subagent` complete**: prose now says
    `completed*` outcomes → `success: true`; `crashed`/`killed`/`timeout`
    → `success: false`; never `null`.
  - **CorrelationId unit drift** (s vs ms): standardise test fixtures to
    13-digit millisecond timestamps with non-zero last digit (e.g.
    `1747200000123`) to disambiguate from epoch-seconds. Add invariant test
    rejecting fabricated `durationMs` round numbers in spawn-site regions.
  - **Postmortem `vault: 'default'` clarification**: document that this is
    intentional (cross-project pitfall aggregation), not a bug — JSDoc on
    `PostmortemReport.pitfalls` plus inline comment at the construction
    site.

  Tests:
  - New `shared-prefix-semantics.test.ts` (5 runtime invariants on
    `SUBAGENT_SHARED_PREFIX`).
  - New `spawn-site-invariant.test.ts` (architect, finalize, execute, review, research files × 7 assertions each).
    **Deviation from plan**: the plan named this artifact
    `usage-comment-completeness.test.ts` with 20 assertions (5 × 4 required
    substrings). The shipped test file is renamed to
    `spawn-site-invariant.test.ts` and expanded to 35 assertions (5 × 7) —
    the additional 15 assertions cover `success:` enumeration and reject
    fabricated round-number `durationMs` examples (`45000`, `60000`,
    `75000`, `90000`, `120000`). The expansion is a strict superset of the
    plan's coverage; the rename better reflects the test's scope (whole
    spawn-site region invariants, not just the usage comment).
  - New `postmortem-vault-comment.test.ts` (3 invariants guarding the two
    `intentional` comments documenting the cross-project `default` vault
    literal — JSDoc + inline construction-site comment).

- 837fc89: Fix five v13 release-readiness defects found by ultrareview on the repo-restructure branch:
  - **read-only-enforcement hook removed.** The standalone `enforceReadOnly` hook blocked every `Write`/`Edit`/`NotebookEdit` in PLANNING/REVIEWING regardless of target path, defeating the v13 freeform-artifact design (the architect couldn't write `plan.md`, reviewers couldn't write `audits/*`, etc.). Dropped the hook entirely — the stage-gate hook's target-aware `artifactPathGate` is the authoritative, correct gate.
  - **`luca vault:init` no longer dead-ends.** It gated on `existsSync(.luca/config.json)`, but `luca init` already writes that file — so the documented setup flow always exited "already configured". It now keys on `config.muninn?.vault`.
  - **`luca init` post-setup readout retargeted to Claude Code.** It instructed users to wire MuninnDB via the removed `~/.mastracode/mcp.json`; it now points at the Claude Code MCP surface (`claude mcp add` / `.mcp.json`) using the live MuninnDB port.
  - **F3 ledger emission fixed.** `luca state advance` emitted event names the postmortem analyzer never reads (`phase-advance`, `re-enter-pipeline`) and reused `phase-empty-justification` for the missing-artifact case (which the reader treats as proof of justification, inverting the signal). Now emits `mode-transition` + `pipeline-re-entered` (with reader-matching fields) and a new `phase-empty-detected` event backed by a new `STEP_ARTIFACT_MISSING` analyzer rule. `state.sessionId` is now bootstrapped via `generateRunId()` so ledger entries carry a real runId instead of `""`.
  - **Hook-merge upgrade hygiene.** `mergeLucaHookSettings` now iterates the union of existing + bundled hook events, pruning stale luca-marked entries from retired/relocated hooks instead of leaving them behind on upgrade.

  Also corrected the README "Wiring MuninnDB" section (Claude Code MCP surface, correct default port 8476).

- 65e47d1: Phase 1 of the Claude Code-first migration: extract shared schema into a new `@alecsibilia/luca-core` package, define the new `.luca/` directory contract, and add the `luca migrate-planning` command.

  **New package: `@alecsibilia/luca-core`** (private, workspace-only)

  Pure TypeScript primitives shared by `luca-framework` and `luca-mastracode`. No I/O, no CLI surface. Consumed via `@alecsibilia/luca-core`, `@alecsibilia/luca-core/state`, `@alecsibilia/luca-core/luca-dir`.
  - Trimmed `lucaStateSchema` (14-step `pipelineStep`, down from 22). Legacy values (`classify`, `configure`, `git-setup`, `roadmap`, `phase-order`, `review-audit`, `gap-audit`, `cleanup`) are mapped to canonical replacements via Zod `.preprocess` so existing `state.json` files parse cleanly.
  - Dropped fields: `profile`, `workflowVersion`, `skipBranch` (mastracode keeps its own extensions through retirement).
  - `coarsePhaseOf(pipelineStep)` exhaustive mapping from each of the 14 steps to one of `IDLE | PLANNING | EXECUTING | REVIEWING | FINALIZING`.
  - `.luca/` directory contract: strict path allowlist, path builders (`phasePathFor`, `auditPathFor`, `wavePathFor`, `milestone*PathFor`, `telemetryPathFor`, `archivedPhasePathFor`, `backlogSnapshotPathFor`), and runtime validator (`isValidLucaPath`). Backed by a declarative `LUCA_DIR_CONTRACT` spec.

  **`luca migrate-planning` command** (new in `luca-framework`)

  ```bash
  luca migrate-planning [--dry-run] [--force]
  ```

  - Moves root files from `.planning/` to `.luca/` (state.json, lock.json, roadmap.md, config.json, ledger.jsonl) using `git mv` to preserve history.
  - Deletes ephemeral files (`.context-metrics.json`, `harness-result.json`).
  - Idempotent — re-running skips already-migrated destinations.
  - Refuses on uncommitted `.planning/` changes; `--force` overrides.
  - Phase directories under `.planning/phases/` intentionally left in place — a follow-up command handles slug normalization once the collision strategy is set.

  **Mastracode integration**

  `packages/luca-mastracode/src/state/state.ts` now re-exports the shared primitives (`ComplexityLevel`, `OversightMode`, `PhaseStatus`, `RoadmapPhaseSchema`) from `@alecsibilia/luca-core`. Mastracode-only types (`ProfileLevel`, 22-value `PipelineStep`, 2D `BUDGET_MATRIX`, legacy state fields) remain in mastracode through Phase 5 (mastracode retirement).

  **Testing**

  Test scripts wired for `luca-core` (`bun test`) and `luca-framework` (`bun test`). 127 new tests:
  - 105 in luca-core covering state schema (including legacy pipelineStep mapping), `coarsePhaseOf`, `resolveBudgetLimits`, all 9 `.luca/` path builders, and `isValidLucaPath`.
  - 22 in luca-framework covering `runMigration` (plan generation, execute, dry-run, idempotency, git-history preservation, dirty-check, --force) and the CLI logging handler.

  **Guardrails:** test scripts run on-demand only — NOT wired into pre-commit hooks (per the 2026-03-06 orphan-process learning).

  **Docs**
  - `CLAUDE.md`, `AGENTS.md`: rewrote the `.planning/` artifact-layout section as `.luca/`.
  - `docs/getting-started.md`: rewrote the "Core Concepts" + "Your First Workflow" sections.
  - `docs/troubleshooting.md`: rewrote the "Migrating a legacy `.planning/` layout" section to point at the new command.
  - `.gitignore`: added `.luca/` runtime patterns (state.json, lock.json, ledger.jsonl, telemetry/).
  - Global `~/.claude/rules/planning-structure.md`: rewrote as the canonical `.luca/` contract spec.

  **Not in this PR** (deferred to later phases):
  - Stage-gate PreToolUse hook (Phase 3)
  - MCP server with `luca_*` write tools (Phase 4)
  - Skill migration to Claude Code subagents (Phase 5)
  - Mastracode retirement (Phase 5)
  - Phase directory migration with slug-collision handling

- add7959: `luca init` now installs Claude artifacts globally; `luca doctor --fix` cleans up stray per-repo installs.

  Previously `luca init` copied the bundled skill set (commands, agents, skills) and the stage-gate hook into the **project's** `.claude/` directory. It now installs them into the **global** `~/.claude/` scope, so a single luca CLI version owns one canonical copy across every project. A repo only ever receives `.luca/` planning files.

  **What changed**
  - `luca init` installs `commands/`, `agents/`, and `skills/` into `~/.claude/` instead of `<repo>/.claude/`.
  - The stage-gate hook is registered in `~/.claude/settings.json` as the bare command `luca hook stage-gate` — the `.claude/hooks/stage-gate.sh` wrapper script is gone. In a non-luca repo the handler defaults to IDLE and allows everything.
  - `luca init` is now a 5-step flow (fixing a step-numbering bug); new `--skip-claude` flag skips the global Claude integration, and `--skip-project` now scopes to just the `.luca/` skeleton.
  - New `luca doctor` check **Stray local install**: detects luca skills/commands/agents and the stage-gate hook wrongly installed into a repo's local `.claude/` by an older `luca init`.
  - New `luca doctor --fix` flag: removes those stray artifacts surgically — user-authored files, `settings.local.json`, and unrelated `settings.json` keys are preserved.

  After upgrading, run `luca init` once to populate `~/.claude/`, then `luca doctor --fix` in any repo that still has a pre-upgrade per-repo install.

- 6b7c02d: Add `/memory-audit` skill — paginated LLM-judged retro pass over MuninnDB vault.
  - New `skills/memory-audit/SKILL.md` walks the active vault via hybrid pagination (`muninn_get_enrichment_candidates` cursor + semantic recall complement), judges each engram against the trust-tier discipline, and applies corrections via `muninn_trust`.
  - New `commands/memory-audit.md` slash command shim with `--dry-run` (default), `--apply`, `--vault`, `--resume`, `--limit`, `--auto` flags.
  - Resumable cursor state at `.planning/audits/memory/state.json`; per-run reports at `.planning/audits/memory/<ISO>.md`.
  - `repo-cleanup.ts` ROOT_WHITELIST_DIRS now includes `audits` so complete-phase doesn't flag the audit directory.
  - Hard prohibition on 11 MuninnDB write/mutation tools (`muninn_remember`, `muninn_remember_batch`, `muninn_forget`, `muninn_consolidate`, `muninn_evolve`, `muninn_link`, `muninn_state`, `muninn_decide`, `muninn_add_child`, `muninn_remember_tree`, `muninn_restore`) enforced by a fenced block and asserted by tests — audit only mutates trust tier via `muninn_trust`.

- 3289efa: Add write-time trust-tier discipline at all `muninn_remember` callsites. New `MEMORY_TIER_DISCIPLINE` constant (single source of truth) is injected into both the mode-agent prefix (`agent-constraints.ts`) and the subagent prefix (`subagents/shared-prefix.ts`). Verified-tier writes get an explicit `muninn_trust` follow-up via the 2-RPC pattern (`muninn_remember` returns id → `muninn_trust(id, "verified", vault)`). Three prose-snapshot tests guard the contract: `memory-tier-prefix` (constant + dual injection), `memory-tier-callsite` (every `muninn_remember(` site has a tier marker within 30 lines preceding), and `memory-tier-verified-followup` (every verified marker has a `muninn_trust(` follow-up within 50 lines).
- 60f5b25: Add `mode.start` / `mode.end` telemetry records emitted from `switch-mode` in `workflow-state.ts`. Captures outer pipeline loop durations (triage, research, architect, execute, review, finalize) that were missing from the v1 telemetry foundation (PR #239). Extends `TelemetryRecord.kind` union, adds `currentModeStartedAt` to `LucaWorkflowState`.
- 1d37b29: ## PR feedback learning batch — 8 todos

  Shipped as one PR per user direction. All eight learnings from prior PR-feedback retros, addressed thematically.

  ### Framework utilities (#30, #36)
  - Extracted shared sanitize and numeric helpers into `packages/luca-mastracode/src/util/sanitize.ts` (`sanitizeForLog`, `sanitizeForStorage`, `displayBounded`) and `packages/luca-mastracode/src/util/numeric.ts` (`finiteOrNull`, `clampTokens`). Re-exported from `packages/luca-mastracode/src/index.ts`.
  - Migrated `workflow-state.ts` and `state/telemetry.ts` to import shared utils; preserved all callsite syntax via aliases.

  ### PR tooling (#37)
  - Added `unknown` bucket to `FilterResult` in `packages/luca-mastracode/src/review-analysis/stale-filter.ts`. Empty `diff_hunk` is now classified `unknown` (not silently routed to `stale`). Surfaced through `pr-review.ts` return shape, appendLedger payload, and summary message. Preserves boolean `stale` field for backward compat. Resolves Copilot false-positive epidemic on PRs #234/#236/#239/#247/#248/#249/#251/#253.

  ### Reviewer subagent (#44)
  - Added 5th `test-quality-reviewer` perspective. Updates: reviewer.ts prose, new Test Quality block (vacuous mocks, presence-only assertions, regex over-permissiveness, stale fixtures, name-vs-assertion drift). review.md Step 4 spawns 5 reviewers in parallel.

  ### Skill: rename-audit (#40)
  - New `.mastracode/skills/rename-audit/SKILL.md` — read-only audit for stale references after rename. 5 Steps. Read-only constraint via prohibition block.

  ### Reviewer-hint rule packs (#15, #30, #36, #56)
  - New `.mastracode/rules/zod-dual-layer-drift.md`
  - New `.mastracode/rules/input-hygiene.md`
  - New `.mastracode/rules/nan-safe-numbers.md`
  - New `.mastracode/rules/spawn-site-prose-rules.md`

  ### Repo cleanup (#42)
  - Added `hasPlaceholderText(content)` to `packages/luca-mastracode/src/tools/repo-cleanup.ts`. Advisory only.
  - `.gitignore` globs for `.planning/telemetry/archive/`, `.planning/**/checks-convergence.json`, `.planning/**/*-capture-*.md`.

  ### Spawn-site invariant (#56)
  - Extended `spawn-site-invariant.test.ts` with FILES-completeness check.

  ### Tests
  - Full suite green (baseline 502, net increase from new test files).

  ### Review iter 1 fixes (MF-1, MF-2)
  - Backfilled flat-schema `workflowStateInputSchema` regex constraints on `perspectives` items (`.regex(/^[a-z0-9_-]+$/)`), `role` (`.min(1).regex(/^[^\r\n\t]+$/)`), and `correlationId` (`.min(1).regex(/^[^\r\n\t]+$/)`) to match per-action schemas. The initial drift-detector test was key-presence-only and silently passed with 3 live drift instances.
  - Rewrote `dual-layer-schema-drift.test.ts` with `missingRegexPatterns()` helper using Zod v4 `_zod.def.checks` introspection + 4 injected-drift smoke tests proving the helper actually fails on real drift.
  - Added JSDoc to `verdictFor()` documenting the 3-state contract (`stale:true` / ACTIONABLE / UNKNOWN). Cross-referenced `FilterResult.unknown` field.

  Closes #15, #30, #36, #37, #40, #42, #44, #56

- bf1b8be: Four backlog todos batched into one PR:
  1. **Pre-invoke MuninnDB recall directive** — `SUBAGENT_SHARED_PREFIX` now includes a `## Pre-Invoke Memory Recall` section instructing subagents to query MuninnDB once at startup for relevant prior learnings. Hedged so non-MCP subagents (plan-reviewer, shadow-scanner) treat it as a no-op.
  2. **Researcher hang-timeout** — `research.md` parallel-batch protocol now requires the orchestrator to capture `Date.now()` per spawn, compute elapsed time, and emit `record-subagent complete` with `outcome: "timeout"` for any researcher exceeding 60s. Synthesis proceeds with partial results when at least 3/5 researchers returned; otherwise the wave is marked STALLED.
  3. **Outcome enum aggregator flag-list** — `skills/luca-telemetry-report/SKILL.md` Subagent Costs section now flags the full non-success terminal set: `crashed`, `killed`, `timeout` (hard failures) and `completed_no_usage`, `completed_partial_parse` (soft failures — subagent finished but usage telemetry malformed).
  4. **Model-field CR/LF guard + stale-example fix** — `record-subagent` `model` field now enforces `/^[^\r\n\t]+$/` regex parity with `role` and `correlationId` (CWE-117 log-injection defense). `execute.md` example updated from stale `claude-opus-4-5` to canonical `anthropic/claude-opus-4-7`.

  New regression tests: parametric guard over all 6 outcome enum values; model CR/LF rejection cases; pre-invoke recall presence in shared-prefix; total-prefix size guard (<4000 chars) to catch future bloat.

- a65c10a: Add `cancel-subagent` workflowState action + `subagent.cancelled` telemetry kind + `cancelled_by_user` outcome enum value.

  Closes the diagnostic gap surfaced by `run_mpct9yy0_qfn0vsy5`: when the user manually kills a hung subagent (luca:2-research stuck 30m, luca:5-review prelude stuck 55m, both observed in that run), there was no way to record the cancellation in telemetry. Long `mode.start` → `mode.end` deltas with no matching `subagent.complete` were indistinguishable from pipeline stalls, sending diagnostic effort in the wrong direction.

  **New action:**

  ```
  workflowState({
    action: 'cancel-subagent',
    role: '<role>',
    correlationId: '<id paired to original invoke>',
    cancelReason: '<short reason, max 512 chars>',
    partialDurationMs: <elapsed ms from invoke to kill | null>,
  })
  ```

  Emits a `subagent.cancelled` telemetry record with `meta.outcome` fixed at `cancelled_by_user` and `meta.success` fixed at `false`. Aggregators correlate by `role + correlationId` — `subagent.invoke` + `subagent.cancelled` forms a complete pair without a matching `.complete` event.

  **Other changes:**
  - `TelemetryKind` union extended with `'subagent.cancelled'`.
  - `outcome` enum extended with `'cancelled_by_user'` in both per-action `recordSubagentAction` schema and the flat `workflowStateInputSchema` mirror (also reflected in `SUBAGENT_SHARED_PREFIX` enum list).
  - `cancel-subagent` registered in `WORKFLOW_ACTION_SCHEMAS` (drift detector auto-coverage), `WORKFLOW_STATE_ACTIONS`, and the tool-manifest allowlist for research / architect / execute / review / finalize.
  - `execute.md` now documents the `cancel-subagent` call shape with an explicit "do NOT emit `subagent.complete`" rule on killed calls.
  - `review.md` Step 4 spawn directive includes a one-line cancel reminder.
  - 15 new tests (12 cancel-subagent action behavior + 3 prose presence).

  **Not in this PR (deferred):**
  - Orchestrator-side hang watchdog (`setInterval` polling) — requires harness integration not yet available.
  - TUI cancel hotkey — separate UX work.
  - Aggregator `luca-telemetry-report` failure-mode breakdown for `cancelled_by_user` — small follow-up.

- 2fecc3f: Add subagent invocation telemetry (`subagent.invoke` / `subagent.complete` kinds).
  - New `record-subagent` workflowState action with Zod-validated schema (role, correlationId, tokens, durationMs, success, model)
  - `clampTokens` helper: non-finite/negative/>10M values coerced to null; zero preserved
  - Prose instrumentation in all 5 spawn-site instruction files (execute, architect, research, review, finalize)
  - `shared-prefix.ts`: subagents self-report usage via `<!-- usage: {...} -->` comment
  - Length caps on role (64), correlationId (128), model (64) to preserve PIPE_BUF atomicity
  - 8 new tests (record-subagent action) + 5 presence-scan tests (subagent-telemetry-prose.test.ts)

- 31a0859: telemetry batch completion (9 todos in one PR)

  Foundation features for the telemetry-v1 system, plus targeted bug fixes that
  unblock cross-run aggregation.
  - **#43 luca-telemetry-report aggregator skill** — read-only cross-run
    aggregator over `.planning/telemetry/*.jsonl`. New skill at
    `skills/luca-telemetry-report/SKILL.md` with `existsSync` guard,
    forbidden-tools fence, 7 steps. Command shim at
    `commands/luca-telemetry-report.md`. Flags: `--runs N` (default 10),
    `--since <ISO>`, `--vault <name>`.
  - **#44 telemetry janitor** — `reset-pipeline` best-effort archives the prior
    run's JSONL to `.planning/telemetry/archive/<runId>.jsonl` via
    `renameSync`. Wrapped in try/catch (sanitized warn on failure) so
    `reset-pipeline` always completes its state-mutation. New
    `TELEMETRY_ARCHIVE_DIR` / `TELEMETRY_ARCHIVE_PATH` exports in
    `phase-paths.ts`.
  - **#45 record-recall action** — new `workflowState({ action: "record-recall",
... })` emits `recall.hit` / `recall.miss` telemetry with `verifiedCount`
    clamped against `resultCount`, `sanitizeLogMessage` on query for CWE-117,
    and `durationMs` routed through overrides. Allowlisted in 6 pipeline modes.
    Inline `// → record-recall { ... }` directive added to all 5 mode
    instruction files at every `muninn_recall` call site (9 directives total).
  - **#46 review-iteration convergence telemetry** — `save-review-results`
    extended with optional `perspectives` array + severity counts + verdict.
    Emits `review.iteration` kind with `durationMs` computed from
    `state.reviewStartedAt`. New `reviewStartedAt` field set on switch-to-review
    (post-await merged write) and re-enter-pipeline; cleared on reset-pipeline.
  - **#29 outcome enum** — `record-subagent` schema extended with
    `outcome: 'completed' | 'completed_no_usage' | 'completed_partial_parse' |
'crashed' | 'killed' | 'timeout'` optional field. Stored in `meta.outcome`
    (v:1 contract preserved). Backward-compatible (missing → null in meta).
    `shared-prefix.ts` usage comment example mentions the new field.
  - **#11 correlationId format audit** — replaced legacy `<ts>` placeholder
    with `const ts = Date.now()` + `` `${ts}` `` template across spawn-site
    directives in `execute.md` / `architect.md` / `research.md` / `finalize.md`.
    New region-scoped test `correlationid-format-prose.test.ts` enforces the
    positive form and negative-asserts `<ts>` + compact-ISO 14-digit + 10+
    digit hardcoded epoch.
  - **#17 finalize.md vault hardcode** — confirmed clean (no `vault: "default"`
    literal remains; doc-comment fallback semantics preserved at L52).
  - **#18 reviewer-dx/simpl usage self-report drift** — drive-by regression
    test added to `subagent-telemetry-prose.test.ts` enforcing that
    `reviewer.ts`'s terminal usage instruction is the LAST occurrence of
    `Append the usage comment` in the assembled prompt and that no `## `
    heading follows. Anchors the dx + simpl perspectives that originally
    exhibited attention-burial drift in PR #245.
  - **#10 absorb into #43** — ts-gap fallback for `durationMs:null` on
    `*.end` records is now documented in the aggregator SKILL.md Step 3
    (Date.parse(end.ts) − Date.parse(start.ts) when finite & non-negative).
  - **shadow-scanner allowlist** — `'telemetry/'` added to
    `planning_root_dirs` (prose + Zod default) so the archive subdir and
    report files don't trip the shadow scanner.

  New tests: 28 added (8 record-recall + 4 review.iteration + 3 outcome + 4
  janitor + 4 aggregator-skill-presence + 1 drive-by #18 reviewer +
  12 correlationId region tests + 21 recall-prose region tests, where
  `correlationId-format-prose.test.ts` and `recall-prose.test.ts` are net-new
  files). 401/401 tests, `bun tsc` clean.

- ec56f6d: v13 write-surface re-architecture: replace the MCP server with the `luca` CLI.

  The 27-tool MCP server is removed. Luca's write surface is now two tracks, both enforced by the stage-gate hook: freeform artifact files (plan, research, audit, …) are written with the agent's native `Write` tool to the canonical `.luca/` path, and structured/operational mutations go through a typed `luca` CLI.

  **Breaking changes**
  - The `luca mcp serve` command and the luca MCP server are removed.
  - `@modelcontextprotocol/sdk` is no longer a `luca-framework` dependency.
  - `luca init` no longer registers an MCP server.

  **What changed**
  - Phase A — the 27 tool handlers + helpers moved out of `src/mcp/` into a runtime-agnostic `src/write-surface/` domain; the SDK-coupled result type was dropped.
  - Phase B — new `luca` CLI: 18 commands across 11 noun groups (`luca state`, `luca todo`, `luca roadmap`, …), plus a `luca-write-surface` discovery skill.
  - Phase C — the stage-gate hook became a per-step artifact-path gate: a native `Write` to a `.luca/` path is allowed only when the path is exactly the legal artifact for the current `pipelineStep`.
  - Phase D — ~24 skill/agent files rewired off the `luca_*` MCP tools.
  - Phase E — `src/mcp/`, `luca mcp serve`, the `wire-mcp-server` init wiring, and the `@modelcontextprotocol/sdk` dependency deleted.

  `luca doctor` now flags a stale `luca mcp serve` registration left by a pre-v13 `luca init` (fix: `claude mcp remove luca`). The `.luca/` directory contract is unchanged — no artifact migration required.

- 4448b79: Add per-phase wave duration telemetry — foundation for the Wave 1 telemetry program.

  `workflowState` now emits structured JSONL records at phase/wave boundaries to `.planning/telemetry/<runId>.jsonl`. Four event kinds at v1 schema: `phase.start`, `wave.start`, `wave.end`, `phase.end`. Each record carries `runId`, phase name + slug, wave number, complexity, oversight, and `durationMs` on closing events.

  New module `src/state/telemetry.ts` exports:
  - `appendTelemetry(kind, meta?, overrides?)` — fail-safe writer, never throws
  - `buildTelemetryRecord(...)` — pure record builder
  - `readTelemetry(runId)` — per-run reader with Zod validation
  - `TelemetryRecord` + `TelemetryRecordSchema` — locked v1 contract for follow-on consumers

  Also: `PhaseResult.waveStartedAt` tracks wave start time across `startPhase` (new + RESUME branches) and `advanceWave`. `ROOT_WHITELIST_DIRS` now includes `'telemetry'`.

  This is the foundation for 4 follow-on telemetry todos (subagent invocation costs, `muninn_recall` hit/miss, review iteration convergence, cross-run aggregator skill).
