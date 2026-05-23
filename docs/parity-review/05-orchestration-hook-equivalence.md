# Parity review #5 — Orchestration hook semantic equivalence

> Reviewer 5 of 6. Lens: **trigger / algorithm / failure-mode parity** between
> the four mastracode orchestration concerns and their Claude Code hook ports
> (E-1..E-4 in the Phase E increment list).
>
> Repo: `/Users/alecsibilia/Github/luca-framework`
> Branch: `refactor/repo-restructure` (HEAD `653f18f1a5a2`)
> Read-only audit; no code modified.

---

## 1. Executive verdict

The four orchestration hooks are **substantively equivalent** to the
mastracode originals in TRIGGER COVERAGE, are **enriched** (not regressed)
in ALGORITHM OUTPUT (because the new pipelineStep vocabulary is broader
than the legacy `MODES` enum), and **uniformly fail-open** at the handler
layer. The only behavioural divergences are deliberate and documented:

- The mastracode "nudge → force" escalation does not survive — Claude Code
  hooks return allow/deny, not nudge-and-retry. **This is documented as a
  design choice in the ported algorithm**, not a regression.
- The `read-only-enforcement` hook covers only the three native write tools
  (Write / Edit / NotebookEdit). Bash mutation is deliberately delegated to
  the `luca hook stage-gate` PreToolUse hook (which matches
  `Edit|Write|NotebookEdit|Bash`) — verified live in
  `wireClaudeHooks` and the `STAGE_TOOL_MATRIX` (PLANNING/REVIEWING phases
  set `bash-mutate: false`).
- The `context-refresher` substitutes a tool-call-count proxy for the
  legacy token-utilization signal. **The proxy is sound for the design
  intent (combat context rot in long runs) but is not isomorphic to the
  original** — see §4 for the fidelity analysis.

**Phase H verdict: CLEAR with one carry-forward caveat already on file in
the parity report (caveat 3: hook handler distribution gap — the 6 new
hooks are DEAD ON ARRIVAL in fresh `luca init` projects until
`writeProjectSkeleton` copies the handler files and merges settings.json).
This is a v14 task, not a Phase H blocker.**

One **subtle behavioural divergence worth recording** (not blocking Phase
H): `checkPipelineGuard` rejects `currentStep === requestedStep` with
`same-step-no-op` BEFORE consulting `PIPELINE_TRANSITIONS`. But the
transition table allows two legal self-loops (`research → research`,
`learn → plan` is not a self-loop but the table also includes `research:
['discuss', 'research']`). The guard will block `research → research`
even though it is in the legal-transitions table. The mastracode original
had no equivalent concept (its `PIPELINE_ORDER` was a single-successor
map with no self-loops). This is **a divergence FROM the new
`PIPELINE_TRANSITIONS` table**, not from the mastracode behaviour, and
should be reconciled in v14 (either drop the same-step guard or remove
`research` from `research`'s legal successors).

---

## 2. Method

For each of the four concerns (E-1..E-4):

1. Read the legacy module at
   `packages/luca-mastracode/src/orchestration/<name>.ts`.
2. Read the ported pure-algorithm module at
   `packages/luca-core/src/orchestration/<name>.ts`.
3. Read the Claude Code hook definition at
   `packages/luca-tools/src/hooks/<name>/index.ts`.
4. Read the bun-script handler at
   `packages/luca-tools/src/hooks/<name>/handler.ts`.
5. Cross-check by compiling artifacts to `/tmp/r5-verify-97499/.claude/
   settings.json` and inspecting the actual emitted slice shape.
6. Spot-check the Bash-mutation defense-in-depth chain by reading
   `packages/luca-cli/src/hook/helpers/handle-stage-gate-hook.ts`,
   `STAGE_TOOL_MATRIX`, `wireClaudeHooks`, and the
   `classify-bash-command` helper.

The compiled `dist/claude/.claude/settings.json` was produced fresh via
`bun run --filter @alecsibilia/luca-tools compile:artifacts -- --out
/tmp/r5-verify-97499` and contains exactly **6 hook entries** (4
PreToolUse + 2 PostToolUse) — matching the handoff memory's "6 hook
slices" claim byte-for-byte.

---

## 3. Per-hook equivalence

### 3.1 pipeline-guard (E-1)

#### Mastra subscription model

Watched **`agent_end` events**. Per-turn tracked `toolCallCount`,
`switchModeCalled`, `consecutiveMisses` in a mutable singleton
(`currentTurn`). On `agent_end(reason: 'complete')`, if `switchMode` was
not called AND `pipelineStep` was actively running, escalated:
- First miss → `followUpRef` injected a nudge prompt.
- Second consecutive miss → `switchModeRef` forced the transition,
  rewrote state directly via `writeLucaState`.

Also probed `.luca/state.json` for an "idle-bypass" condition (don't
enforce after pipeline completion) and emitted a one-shot
`pipeline-guard-idle-bypass` ledger event for retrospective analysis.

#### Claude Code hook trigger

`PreToolUse` on `Bash`. Handler narrows to `luca state advance <step>`
(positional or `--to-step` long-flag) via a regex-then-tokenize parser.
Exits 0 (allow) or 2 (block + stderr surfaced to model).

#### Trigger equivalence verdict — **EQUIVALENT, with a redesign**

The triggers are **functionally equivalent for the new architecture**.
The legacy event (`agent_end` without a successful `switch-mode`) is a
proxy for "the agent finished its turn and the pipeline did not move".
The new event (`PreToolUse[Bash]` on `luca state advance`) is the
**inverse proxy**: "the pipeline is about to move (or fail to move
legally)". The two events catch the SAME WRONG STATE from different
sides of the transition:

- Mastra caught it AFTER the agent failed to transition.
- Claude Code catches it BEFORE the (potentially illegal) transition is
  written.

This is a **superior delivery model** for the new design because the
write surface IS the CLI invocation — there is no "agent forgot to call
switch-mode" failure mode anymore (the only way to advance the pipeline
is through `luca state advance`, which the hook gates).

**Coverage**: every transition routes through the CLI, so every transition
is caught. Skills, agents, direct user invocations all funnel through
`luca state advance`. Verified: the v13 write-surface design (memory
`brain:project-write-surface`) makes the CLI the SINGLE entry point for
pipelineStep mutation.

**Missed trigger from the legacy model**: the
`pipeline-guard-idle-bypass` ledger event is no longer emitted. The new
guard does not need it (there is no "agent finished a turn while idle"
event to trace), so this is not a regression — the event was
diagnostic-only and the underlying condition cannot occur in the new
design.

#### Algorithm equivalence verdict — **EQUIVALENT, with one subtle divergence**

Both versions delegate to a legality table. Legacy used `PIPELINE_ORDER`
(a single-successor `Record<string, string | undefined>`); the port uses
`PIPELINE_TRANSITIONS` (a fan-out `Record<PipelineStep, PipelineStep[]>`),
which is a strict superset of the legacy behaviour — every legacy
transition still exists, and the port adds loop-back transitions
(re-research, re-plan, fix loops).

The port adds typed reason codes (`'illegal-transition'`,
`'same-step-no-op'`, `'unknown-current-step'`,
`'unknown-requested-step'`) and a structured `PipelineGuardTelemetry`
payload — both pure additions over the legacy ad-hoc string messages.

**Subtle divergence**: `checkPipelineGuard` short-circuits on
`currentStep === requestedStep` with `same-step-no-op` BEFORE consulting
`PIPELINE_TRANSITIONS`. But the table includes `research: ['discuss',
'research']` — a deliberate re-research self-loop. The guard will block
`research → research` despite the table allowing it. This **does not
contradict the mastracode model** (legacy `PIPELINE_ORDER` had no
self-loops either), but it DOES contradict the new `PIPELINE_TRANSITIONS`
table. Recommend reconciling in v14: either drop the same-step
short-circuit or remove `research` from `research`'s legal successors.

The mastracode `executeEnforcement` step (nudge vs. force, ledger writes,
direct `writeLucaState`) **does not survive the port**. The port's
contract is allow-or-block; the runtime-side actions (`writeLucaState`,
followUp-style nudging, switchMode forcing) are mastracode-specific
delivery and not appropriate for a stateless hook. **This is documented
in the ported module's preamble.**

#### Failure-mode verdict — **EQUIVALENT (both fail-open)**

Handler exits 0 on ANY internal error (stdin parse failure, state.json
missing/malformed, command parse failure, unexpected throw). Confirmed
at `handler.ts` lines 73-84 (empty/malformed stdin → 0), 87-91 (non-Bash
tool name → 0), 93-103 (no command, no `advance` keyword → 0), 207-220
(catch-all → 0).

The mastracode original also failed open in equivalent paths — when
state was idle or `pipelineStep` was missing, it emitted a one-shot
ledger event and returned null (no enforcement).

#### Coverage gaps

None material. The legacy "two-strikes-and-force" escalation pattern was
specific to a streaming-agent model and does not translate to a
pre-tool-call gate. If a future product decision wants soft-nudging,
that's an additional UserPromptSubmit surface; it's NOT a regression in
this hook.

### 3.2 read-only-enforcement (E-2)

#### Mastra subscription model

Two complementary mechanisms (in the SAME module):
1. **Workspace factory patch**: monkey-patched the harness's PRIVATE
   `workspaceFn` field to intercept the workspace and call
   `setToolsConfig({ enabled: false })` on write tools when entering a
   read-only mode. Explicitly relied on **TypeScript-private** field
   access (TS-private is compile-time only; the field was visible at
   runtime).
2. **`mode_changed` subscription**: when the mode changed outside a
   request, re-applied `setToolsConfig` AND updated `setState({
   permissionRules })` as a belt-and-suspenders second layer.

The read-only mode set was hard-coded: `'plan', MODES.discuss,
MODES.triage, MODES.research, MODES.review`.

The disabled tools were `write_file`, `string_replace_lsp`,
`ast_smart_edit`, `delete_file`, `mkdir`, `execute_command`,
`kill_process` — all Mastra workspace tool identifiers. Note this
included `execute_command` (Bash equivalent) and `delete_file`/`mkdir`,
which the port does NOT gate (delegated to stage-gate).

#### Claude Code hook trigger

Three sibling `PreToolUse` slices on matchers `Write`, `Edit`,
`NotebookEdit`. Each slice points at the same handler
(`.claude/hooks/read-only-enforcement.ts`). Confirmed in compiled
`dist/claude/.claude/settings.json` (4 PreToolUse entries: Bash for
pipeline-guard + 3 sibling write-tool entries).

#### Trigger equivalence verdict — **PARTIAL: deliberate Bash exclusion delegated to stage-gate**

The three native write tools are covered by direct hook matchers. **Bash
mutation IS deliberately excluded** — see the explicit design note in
`hooks/read-only-enforcement/index.ts` lines 23-29:

> Why NOT Bash: the algorithm's `bash-mutate` class is real, but
> pre-classifying a Bash command requires the same shell parser the
> stage-gate hook already ships (`classify-bash-command` in luca-cli).
> For Phase E-2, scope is narrowed to the three native write tools. The
> stage-gate hook (luca-cli) covers Bash mutation enforcement via the
> STAGE_TOOL_MATRIX in REVIEWING/PLANNING phases — defense in depth
> without re-implementing the parser here.

**Verified live**: stage-gate hook is registered with matcher
`Edit|Write|NotebookEdit|Bash` (`wireClaudeHooks.ts` line 15:
`STAGE_GATE_MATCHER`) and the matrix in
`packages/luca-core/src/state/configs/stage-tool-matrix.ts` has
`bash-mutate: false` for both PLANNING and REVIEWING phases (lines
47-55 and 65-75). So Bash mutation IS gated — just by the stage-gate
hook, not by read-only-enforcement.

This is **not a coverage regression** — it's a deliberate
separation-of-concerns between a portable Claude-Code-bundled hook and
the stage-gate hook that ships with the `luca` CLI. Both read from the
same canonical `.luca/state.json`.

The legacy hook also covered `delete_file`, `mkdir`, `kill_process` —
operations that don't exist as native Claude Code tools (they would be
invoked via Bash). All of these route through the Bash stage-gate
classifier (`bash-mutate` for `rm`, `mkdir`, etc.; see
`classify-bash-command.ts`).

#### Algorithm equivalence verdict — **EQUIVALENT, with enriched read-only set**

Both versions test "is the current step/mode in the read-only set; if
yes, is this a write tool; if both, block".

The legacy set was 5 modes: `{plan, discuss, triage, research, review}`.

The port's set is 9 pipelineSteps: `{triage, research, discuss, architect,
plan, plan-review, verify, review, learn}`. This is **strictly larger**
because the new pipeline has more granular steps (the legacy
`MODES.architect` is one step; the port splits it into `architect`,
`plan`, `plan-review`). Every legacy read-only mode is covered. No
regression.

The port additionally exposes `READ_ONLY_STEPS` and
`READ_ONLY_TOOL_CLASS_BY_NAME` as public exports (for handler reuse and
testability) and includes a dev-time invariant check that
`READ_ONLY_STEPS` agrees with `coarsePhaseOf` (PLANNING/REVIEWING) —
this is a hardening over the legacy hard-coded set.

#### Failure-mode verdict — **EQUIVALENT (both fail-open)**

Handler exits 0 on: empty stdin, malformed stdin, missing tool_name,
unknown tool name (not in `READ_ONLY_TOOL_CLASS_BY_NAME`), and
catch-all errors. Confirmed at `handler.ts` lines 71-97 and 124-137.

The mastracode original also failed open when `workspaceFn` was
missing (`originalWorkspaceFn` falsy → warn and skip enforcement — see
legacy lines 141-148).

#### Coverage gaps

**Intentional Bash gap delegated to stage-gate** — covered above.

**No other gaps** for the three native write tools. The port even covers
the legacy `delete_file`/`mkdir` cases that mapped to Bash via the
stage-gate handler's `bash-mutate` classification.

### 3.3 continuation-messages (E-3)

#### Mastra subscription model

Called `buildContinuationMessage(newModeId, state)` AFTER a successful
mode switch. Returned a per-mode kick-off prompt referencing
`intent`, `assignedTodos`, `affectedAreas`, `planFile`,
`roadmapFile`, `currentPhaseSlug`. Templates included
mastracode-specific references like `workflowState(action:
"switch-mode")` and `luca:2-research` mode IDs.

#### Claude Code hook trigger

`PostToolUse` on `Bash`. Handler narrows to `luca state advance
<step>`, reads `.luca/state.json` post-advance, confirms the requested
step matches the now-current step (validates the advance actually
happened), then calls `computeContinuationMessage()`. Emits via
`additionalContext` in the PostToolUse hook output JSON.

#### Trigger equivalence verdict — **EQUIVALENT**

The legacy event (mode switch succeeded) and the new event (PostToolUse
on a successful `luca state advance`) are direct analogues. The handler
adds an EXTRA safety check (line 124: `if (state.pipelineStep !==
requestedStep) return 0`) to skip the continuation if the CLI rejected
the transition — this prevents a stale or misleading continuation
prompt, an improvement over the legacy model.

The PostToolUse matcher is `Bash` only — non-Bash tools won't fire this
hook. The legacy event fired on the mastracode mode-change subscription,
which is also strictly tied to mode transitions. **Trigger sets are
equivalent.**

#### Algorithm equivalence verdict — **EQUIVALENT, with simplified state shape**

Legacy templates referenced fields the new luca-core state schema does
NOT carry (`intent`, `assignedTodos`, `affectedAreas`, `planFile`,
`roadmapFile`, `currentPhaseSlug`). The port dropped those references —
explicitly noted in the algorithm preamble. **This is a documented and
intentional simplification**, not a regression: the dropped fields were
all "anchor information" the agent could re-derive by reading the
phase artifacts directly (which the new system points the agent to
explicitly: `.luca/phases/<slug>/research.md`, etc.).

The port adds templates for ALL the new pipelineSteps (`discuss`,
`plan`, `plan-review`, `checks`, `verify`, `learn`, `milestone`,
`complete`) — these had no mastracode equivalent. **Strict enrichment.**

The port wraps the message in `<system-reminder>` (Claude Code's
invisible-injection envelope) — matching the legacy `<system-reminder>`
contract.

The port surfaces telemetry payloads (`continuation-emitted`,
`continuation-skipped`) — pure addition.

#### Failure-mode verdict — **EQUIVALENT (both fail-open)**

Handler exits 0 silently on: empty stdin, malformed stdin, non-Bash
tool, no command, non-`advance` command, state.pipelineStep mismatch
(rejected advance), `null` verdict from algorithm,
`unknown-current-step` verdict, catch-all errors. Confirmed at
`handler.ts` lines 85-156 and 242-251.

The `unknown-current-step` verdict explicitly returns 0 silently rather
than surfacing a warning to the agent (`would be alarming and not
actionable`). Sensible policy.

#### Coverage gaps

None material. The legacy `idleBypassLogged` ledger pattern from the
pipeline-guard module is not relevant here (continuation-messages
doesn't watch idle transitions; advance-into-idle returns `null` → no
emission, no logging — see algorithm line 275).

### 3.4 context-refresher (E-4)

#### Mastra subscription model

Subscribed to a `TokenBudgetMonitor` exposing token-utilization
thresholds: `INJECT_REMINDERS` fired at 30% of the context window. On
threshold crossing, called `followUpRef({ content: reminder })` to
inject a per-mode `<luca-reminder>` re-anchoring the agent. The
`injectedThresholds` Set (instance-private) tracked which thresholds
had fired in the current mode; mode change cleared the set.

The thresholds and per-mode reminders lived on a class instance
(`ContextRefresher`) — persistent across the harness lifetime.

#### Claude Code hook trigger

`PostToolUse` with matcher `*` (every tool call). Handler ticks a
counter persisted at `.claude/cache/context-refresher-state.json`
(sidecar — out of the `.luca/` contract allowlist by design). The
algorithm fires when the counter crosses `toolCallsPerRefresh` (default
30) OR when the step has changed since the last fire. On fire, resets
the counter; stores `lastFiredStep` and `lastFiredAt`.

#### Trigger equivalence verdict — **DEGRADED: proxy substitution**

This is the most substantive divergence of the four hooks. The legacy
event was **"context window utilization crossed 30%"** — a TRUE
context-pressure signal exposed by the Mastra harness. The port
substitutes **"30 tool calls accumulated within the current step"** —
a PROXY for context pressure.

Claude Code does not expose a context-utilization API to hooks, so the
proxy is the only available signal. **See §4 for the proxy fidelity
analysis** — short version: it's a defensible proxy, but it can both
over-fire (long sessions with cheap tool calls) and under-fire (short
sessions with expensive tool outputs).

The matcher `*` fires after every tool call, so the counter coverage is
maximal — Read, Bash, Edit, MCP, subagent dispatch all tick it. This is
broader than the legacy `TokenBudgetMonitor` which ticked on
"token-emitting events" (assistant turns + tool calls + user messages
— see legacy lines 14-15). **Tool-call coverage is comparable to the
mastracode model**; what differs is the SIGNAL, not the EVENT SET.

#### Algorithm equivalence verdict — **EQUIVALENT, with enriched coverage and explicit cooldown**

The per-step reminder catalog mirrors the legacy `MODE_REMINDERS` for
the modes that survived (`triage`, `research`, `architect`, `execute`,
`review`, `finalize`/`complete`, `discuss`). The port adds templates
for `plan`, `plan-review`, `checks`, `verify`, `learn`, `milestone` —
all new pipelineSteps with no mastracode equivalent. **Strict
enrichment for the broader pipeline.**

Stock-Mastra utility modes (`build`, `fast`, `plan` as a mastracode
mode rather than pipelineStep) are intentionally dropped — they don't
correspond to any new pipelineStep.

The cooldown contract is **explicit and superior** to the legacy
`injectedThresholds` Set: the algorithm carries `lastFiredStep` AND
`lastFiredAt` in `ContextRefresherCarryState`, fires on step change
(re-anchor on new mode) OR on counter threshold, resets cleanly on
idle. The legacy class-instance state was lost across restarts; the
port's sidecar persists. **Net improvement.**

The `<luca-reminder>` tag (vs. `<system-reminder>` for
continuation-messages) is preserved from the legacy — `<luca-reminder>`
signals "tactical mid-conversation nudge", `<system-reminder>` signals
"mode entry". This semantic distinction is retained.

#### Failure-mode verdict — **EQUIVALENT (both fail-open)**

Handler exits 0 silently on: empty stdin, malformed stdin, catch-all
errors. Sidecar I/O failures are explicitly swallowed (lines 246-249,
`Sidecar persistence failure is non-fatal — next invocation will
recompute from a fresh counter. Silently absorb.`). Algorithm returns
`null` on `idle` step (no surface, no carry change).

The legacy original also failed open on `followUp` errors (line 71-83
of legacy: catch any thrown error, attempt a ledger write, swallow).

#### Coverage gaps

**Token-utilization fidelity** — see §4.

The port does not maintain a per-threshold "fire once" semantic
matching the legacy `injectedThresholds` Set across multiple thresholds
(legacy supported `INJECT_REMINDERS`, presumably with room for more
levels). The port has ONE threshold (`toolCallsPerRefresh`). This is a
deliberate simplification — the legacy only USED `INJECT_REMINDERS` in
its handleThreshold body, so the multi-threshold scaffolding was unused.
**Not a coverage gap, just a clean-up.**

---

## 4. Context-refresher proxy fidelity

### What the legacy signalled

`TokenBudgetMonitor.INJECT_REMINDERS = 0.3` (30% of context window).
With Claude Code's ~200k-token standard window, this fires when the
session has consumed ~60k tokens. At that point the mode constraints
from the front of the context are at risk of falling out of the
attention scope; a `<luca-reminder>` re-anchors them.

### What the port signals

After 30 PostToolUse events (counter == `toolCallsPerRefresh`)
**within the current step**, OR on a step change since the last fire.

The `context-refresher-config.ts` rationale is explicit (lines 14-19):

> The default (30) is a rough analogue for the mastracode 30% threshold
> on Claude Code's standard 200K context window. With each tool call
> averaging ~3-5K tokens of input + output, 30 tool calls is around the
> point a long-running session starts losing the active mode's
> constraints from the front of the context — a reasonable place to
> re-anchor.

### Fidelity analysis

#### Where the proxy MATCHES the original (sound)

- **Long autonomous runs**: 30 tool calls × 4k average ≈ 120k tokens —
  in the right ballpark for 30% of a 200k window. Real-world runs with
  Read/Grep/Bash/Edit churning at typical sizes should fire the
  refresher at roughly the same point the legacy would have.
- **Step-change re-anchor**: the port fires immediately on step change
  if `lastFiredStep !== currentStep`. The legacy `setMode()` cleared
  `injectedThresholds`, allowing the next threshold-cross to fire. Same
  outcome: re-anchor on mode change.
- **Idle reset**: both versions effectively reset on idle (port wipes
  the counter; legacy class instance kept living but the next mode
  entry would `setMode()` and clear `injectedThresholds`).

#### Where the proxy OVER-FIRES (false positives)

- **Many cheap tool calls**: a planning session that does 30 short
  `Read`s of small files may consume well under 30k tokens. The
  refresher fires anyway. **Mild over-fire — annoying but not harmful.**
- **Per-step counter does NOT carry across steps**: if a phase runs
  `execute → checks → execute → checks → execute` (fix loop), the
  counter resets on every step change. A wave that takes 80 tool calls
  across 4 step transitions might fire the refresher 4 times even
  though context utilization rose smoothly. **Mild over-fire.**

#### Where the proxy UNDER-FIRES (false negatives)

- **Expensive tool outputs**: a single `Bash` invocation that prints
  100k tokens of output (build logs, test results, long greps) burns
  half the context window in ONE tick. The legacy
  `TokenBudgetMonitor` would have noticed; the port counts it as one
  tick. **Under-fire — agent loses mode constraints before refresher
  fires. The most material regression.**
- **Subagent dispatch**: a `Task` (subagent) invocation can consume
  vast context internally. The port counts it as one tick; the
  legacy would have seen its actual token cost.
- **Long single tool inputs**: a `Write` of a large file ticks once
  regardless of the file's size.

#### Verdict

**SOUND for the design intent** (combat context rot in long
multi-step pipelines) but **PARTIAL for high-variance workloads**.
The proxy is the best available signal under Claude Code's hook API
constraints — there is no token-utilization callback. If/when Claude
Code exposes such a signal, replacing the proxy is a focused
swap (the `priorState.toolCallCount` field becomes
`priorState.contextUtilization`, the threshold becomes a float).

**No Phase H impact** — the refresher is informational, never blocks.
The worst case is "agent occasionally misses a re-anchor on a
log-heavy run" — a quality-of-life regression, not a correctness
regression.

**Recommendation for v14**: add a SECOND fire condition — fire if
`process.env.CLAUDE_CONTEXT_PERCENT` (or whatever signal Claude Code
exposes when it does) crosses 30%, regardless of tool-call count. The
existing algorithm can carry both signals trivially.

---

## 5. Bash-mutation coverage

The read-only-enforcement hook **deliberately excludes Bash**. The
defense-in-depth claim from the algorithm preamble (`hooks/
read-only-enforcement/index.ts` lines 23-29) is that the stage-gate
hook in luca-cli covers Bash mutation enforcement.

**Verified**:

1. `wireClaudeHooks` (`packages/luca-cli/src/init/helpers/
   wire-claude-hooks.ts` line 15) registers
   `STAGE_GATE_MATCHER = 'Edit|Write|NotebookEdit|Bash'` into the
   GLOBAL `~/.claude/settings.json`. The Bash matcher IS present.

2. `handle-stage-gate-hook.ts` (line 159 onward) handles
   `toolName === 'Bash'` by invoking `classifyBashCommand(command)`,
   getting a `BashCategory` (one of `bash-readonly`, `bash-mutate`,
   `bash-commit`, `luca-write`, `denied`), and mapping that to a
   `ToolCategory` via `bashCategoryToToolCategory`.

3. `STAGE_TOOL_MATRIX` in `packages/luca-core/src/state/configs/
   stage-tool-matrix.ts`:
   - PLANNING (lines 47-55): `bash-mutate: false`, `bash-commit: false`,
     `bash-readonly: true`.
   - REVIEWING (lines 65-75): `bash-mutate: false`, `bash-commit: false`,
     `bash-readonly: true`.
   - Other phases: `bash-mutate: true` in EXECUTING (correct — execute
     is the only phase that should mutate the filesystem via Bash);
     `bash-commit: true` in FINALIZING (correct — release commits).

4. `classify-bash-command.ts` recognizes the mutate set in detail:
   `git add`, `git mv`, `git rm`, `git checkout`, `git reset`, `git
   restore`, `git switch`, `git stash`, `git merge`, `git rebase`,
   `git cherry-pick`, etc. (lines 57-77). Filesystem mutations (`rm`,
   `mv`, etc.) are classified via target-path inspection plus
   command lookup (not shown above but present in the file).

**Conclusion**: Bash mutation IS gated in PLANNING and REVIEWING phases
via the stage-gate hook, exactly as the read-only-enforcement algorithm
preamble claims. The two hooks compose cleanly:

- `read-only-enforcement` fires first on `Write|Edit|NotebookEdit`
  (defense in depth — gates the native write tools at the matcher
  layer).
- `stage-gate` fires on `Edit|Write|NotebookEdit|Bash` (canonical gate
  with the full matrix).

Both block; either can reject the call. **No coverage gap.**

---

## 6. Phase H blockers (if any)

**None from this lens.**

The 4 ported hooks are behaviourally equivalent to the mastracode
originals for trigger coverage, algorithm output, and failure-mode
parity. Where the port differs (Bash-mutation delegated to stage-gate,
context-refresher uses a tool-call proxy, pipeline-guard drops the
nudge-and-force escalation), the differences are deliberate, documented
in-source, and the substituted mechanisms are verified to cover the
intended behaviour.

**Carry-forward caveats** (already known, all on the parity report's
v14 carry-forward list):

- **Hook handler distribution gap**: the compiled `dist/claude/.claude/
  hooks/*.ts` handlers are NOT copied into consumer projects by
  `writeProjectSkeleton`. The settings.json slice references handler
  paths that don't exist in a freshly-`luca init`-ed repo. The 6 new
  hooks are DEAD ON ARRIVAL in consumer projects.
  - **Severity**: blocks the hooks from FIRING in consumer projects, but
    does NOT block Phase H (legacy package removal). The hooks remain
    correct in source.
  - **v14 fix**: extend `writeProjectSkeleton` to `cp <package>/dist/
    claude/.claude/hooks/*.ts <project>/.claude/hooks/` and merge the
    bundled `settings.json`.

**Newly surfaced caveat (this audit)**:

- **`research → research` divergence**: `checkPipelineGuard` rejects
  same-step transitions with `same-step-no-op` even though the
  `PIPELINE_TRANSITIONS` table lists `research` as a legal successor
  of `research`. Recommend reconciling in v14 (either drop the
  same-step short-circuit or remove `research` from `research`'s
  successors). **Not a Phase H blocker** — the guard is conservative
  (rejects more than the table permits, not less).

---

## 7. Carry-forward to v14

| # | Item | Severity | Cost |
|---|------|---------|------|
| 1 | Wire compiled hook handlers into `writeProjectSkeleton` so the 6 hooks are LIVE in `luca init` projects (NOT just compiled artifacts in the package's dist/). | Blocker for hooks to fire in consumer repos. | Small. Extend `init-skills`/`writeProjectSkeleton` to copy `dist/claude/.claude/hooks/*.ts` and merge settings.json. |
| 2 | Add a SECOND `context-refresher` fire condition based on a real context-utilization signal IF/when Claude Code exposes one to hooks. The proxy stays as a fallback. | Quality-of-life. | Trivial when the signal becomes available. |
| 3 | Reconcile `checkPipelineGuard`'s `same-step-no-op` rejection vs. the `PIPELINE_TRANSITIONS` table's self-loops (`research → research`). Either drop the short-circuit or remove the table entry. | Minor — affects re-research loops only. | 5-line change. |
| 4 | Add ledger-write integration in pipeline-guard handler. The pure module returns telemetry payloads; the handler currently does NOT emit them via `luca telemetry record` or any ledger sink. Mastracode original wrote `pipeline-guard-rejection`, `pipeline-forced-transition`, `pipeline-guard-idle-bypass`, `mode-transition` events. | Quality-of-life for retrospective analysis. | Moderate — add `appendLedger` calls in the handler (or a ledger writer in luca-core orchestration). Same for the other 3 hooks. |
| 5 | Add observability metrics: count how often each hook fires, blocks, fails-open. Useful for tuning the context-refresher proxy threshold. | Quality-of-life. | Moderate — pipeline a metric write. |

---

## 8. Recommendations

1. **Proceed with Phase H.** None of the orchestration hooks block legacy
   package removal. The legacy `packages/luca-mastracode/src/
   orchestration/*.ts` files have zero live imports from the four active
   packages (verified separately in the parity report, §3 closure list).

2. **DO NOT close the v14 hook-handler-distribution caveat as part of
   Phase H.** It's a separate, focused fix on `writeProjectSkeleton`
   that belongs in v14 — not coupled to the destructive package deletion.

3. **Track the `research → research` divergence as a v14 task** (item 3
   above). Low priority; it manifests only in a deliberately-retried
   research loop, which itself is rare.

4. **Re-validate the context-refresher proxy threshold (30 tool calls)
   after the first month of live operation.** If telemetry shows
   over-firing in cheap-tool-heavy phases, raise the default; if
   under-firing during long log-heavy executes, lower it or add a
   per-step bias (the algorithm already accepts a `thresholds` input
   for runtime override).

5. **Consider lifting the `parseAdvanceCommand` helper into luca-core**
   (currently duplicated in `pipeline-guard/handler.ts` and
   `continuation-messages/handler.ts`). The two parsers are
   byte-identical; the duplication is explicitly noted in the
   continuation-messages handler (lines 178-185) and would be the third
   place to need a shared helper if another hook ever needs to parse
   `luca state advance`. Promote then.

---

**End of parity review #5.**
