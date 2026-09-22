# Luca on Pi — stocktake

> Date: 2026-09-22 · Branch: `feat/luca-retro` · Status: input for the design, not a decision.
>
> Sources: four read-only research passes (current code, planned work, Pi, Matt Pocock's skills + Jev + Claude Code workflows), the MuninnDB `luca-monorepo` and `default` vaults, and the archived Pi specs in `.luca/archive/00-legacy-planning/planning/todos/done/`.
>
> **Planning now lives on the wayfinder map: [Map: Luca v1 on Pi](https://github.com/asibilia/luca-framework/issues/325).** The open questions in section 8 became tickets there. Shared words are in `CONTEXT.md`.

## TL;DR

- **Luca today** is a prompt compiler, a `luca` CLI, and a set of Claude Code hooks. Together they try to make an LLM follow a 13-step flow.
- **It drifts.** Most real bugs are prompts and code disagreeing: illegal state advances, phantom CLI verbs (6 of 7 phases), two reviewer output formats, a review step that silently reviews nothing.
- **It's stuck.** Nothing after #317 is merged. `main` fails `tsc`. Three stacks are unmerged (PR #323, draft PR #324, `feat/luca-retro`).
- **The harnesses caught up.** Claude Code and Pi now ship subagents, skills, compaction, multiple providers, TUI hooks, and (Claude Code) scripted multi-agent workflows. A lot of Luca exists only to work around limits that are gone.
- **Pi moved and grew.** It's now `@earendil-works/pi-coding-agent` 0.87; you're on the deprecated 0.56.3. Community packages already run parallel agents in worktrees with scripted flows, so "build or adopt" is the first big choice.
- **The fix is to move the flow into code.** Plain code does everything that has one right answer. Jev makes the cheap judgment calls, with a confidence score. Big LLMs only write tests, write code, and review.
- **Keep:** MuninnDB, the verification rules, the small state table, per-role tool guards, the event log, the cleanliness scanner, the GitHub helpers.
- **Drop:** all Claude Code glue, the LLM-driven pipeline, the `.luca/` phase/milestone ceremony, the MuninnDB todo backlog, and `luca-code`.

## 1. What Luca is today

| Package | LOC (src) | What it is |
|---|---|---|
| `luca-core` | ~18K | State table, `.luca/` contract, checks, verification, confidence, todos, handoff, ledger |
| `luca-cli` | ~32K | The `luca` CLI: 18 write-surface nouns, the stage-gate hook, `luca init` installer |
| `luca-tools` | ~22K | Skill, subagent, and mode prompt bodies (`defineAgent`), the statusline, hooks |
| `luca-code` | ~7K | A gateway that runs Claude Code on a ChatGPT subscription |
| `luca` | tiny | Umbrella package |

**The flow** (`luca-core/src/state/configs/pipeline-transitions.ts`): idle → triage → research → discuss → architect → plan ⇄ plan-review → execute ⇄ checks ⇄ verify ⇄ review → learn → finalize.

**How it's enforced:** prompt bodies tell the LLM what to do next. A PreToolUse stage-gate hook blocks tools and paths that aren't legal for the current step. The CLI is the only allowed way to change `.luca/`.

**What the ledger says** (15 sessions): planning out-iterates execution. Plan ran 5.3 rounds, plan-review 5.2, execute 4.9, learn 3.1.

## 2. Keep: ideas worth carrying over

"Code" means port the logic, slimmed down. "Prompt" means rewrite the role prompt, short. "Idea" means keep the rule and rebuild it natively.

| # | What | Lives in today | In the new world | Keep as |
|---|---|---|---|---|
| 1 | **MuninnDB as the backbone.** Two-vault routing, typed prefixes (`pattern:`, `pitfall:`, …), learner `TO_PERSIST`, procedure replay ranked by `muninn_feedback` | `luca-core/src/todos/`, the learner, the rules | The engine reads and writes MuninnDB itself, at fixed points. No more "print MCP steps for the LLM to run". | Code |
| 2 | **A small transition table** with rework counters and caps | `pipeline-transitions.ts` (33 lines) | The engine's state machine | Code |
| 3 | **Durable-run rules**: one durable write per transition, no side effect before its transition is written, idempotent external calls, single-flight lock, resume after a kill | `docs/orchestrator-design.md` (never built) | The engine's journal and resume | Idea |
| 4 | **Per-role tool and path guards**: phase × tool matrix, Bash command classifier, always-denied paths | `luca-cli/src/hook/`, `stage-tool-matrix.ts` | A Pi `tool_call` guard plus per-role tool lists | Code |
| 5 | **Short subagent returns**: write the artifact file, return a short summary | `docs/decisions/orchestrator-context-pruning.md` | Every role returns a typed result; details go to files | Idea |
| 6 | **Verification rules**: every claim cites `file:line`; "done" only against a met criterion; claim-verify; error-fingerprinted checks; convergence; bounded fix loops | `luca-core/src/{checks,verification,claim-verifier,review-analysis}/` | Engine gates and reviewer output schema | Code + prompt |
| 7 | **Review**: 7 lenses (architecture, dx, security, simplification, test quality, integration, independence), challenger/defender debate at high complexity, diff-gated re-review from a worktree snapshot | `subagents/reviewer.ts`, `luca-snapshot-*` | Reviewer roles, with real independence: run one reviewer on a different provider | Prompt + code |
| 8 | **Confidence journal**: sort each open question into auto / research / ask | `luca-core/src/confidence/` | Jev confidence + an escalation policy. The only pause points. | Idea |
| 9 | **Budget guard**: wall time, tool calls, cost | `budget-matrix.ts` | Real limits in code, fed by Pi's per-turn usage. (Today only wall time actually works.) | Code |
| 10 | **Ledger**: append-only event log | `luca-core/src/ledger/` | The run journal: every engine step and every agent event | Idea |
| 11 | **Shadow scan**: 7 kinds of AI-session debris | `subagents/shadow-scanner.ts`, `luca-core/src/shadow-scan/` | Part of the cleanliness gate | Code |
| 12 | **Git/GitHub helpers**: repo convention detection (branch, commit, PR format), PR open, PR comment handling | `luca-core/src/preferences/`, `skills/gh-*` | Engine config and the ship step | Code + prompt |
| 13 | **Complexity scoring** (file count, cross-cutting, breaking change, domains) | `luca-core/src/complexity/` | Sizes the team and picks model tiers, with a Jev assist | Code |
| 14 | **Prompt-reference test**: compile every prompt and check it only names things that exist | `state-advance-legality.test.ts` | Test that role prompts only name real tools | Idea |
| 15 | **Role prompt content**: executor, test-writer, reviewer, verifier, learner, debater, shadow-scanner | `luca-tools/src/artifacts/subagents/` | Rewritten short, one role each | Prompt |

## 3. Drop

| What | Size | Why | Replaced by |
|---|---|---|---|
| Install / compile / doctor for Claude Code + Antigravity, `RETIRED_ARTIFACTS`, Compact Instructions | ~10K LOC | Harness glue | A Pi package (`pi install`) |
| Claude Code hooks: stage-gate (as a CC hook), pipeline-guard, continuation-messages, context-refresher, handoff inbox; the statusline | ~4.6K LOC | Workarounds for CC limits. Hooks also fire in unrelated sessions; ~66% of ledger rows are hook noise. | Engine code + Pi extension events and widgets |
| The LLM-driven pipeline: `/lu`, 10 mode agents (5 already dead), `phase-*`, `milestone-*`, `note`, `project-new`, `quick`, `progress`, `session-*`, `autopilot`, `lu-handoff` | ~8K LOC | The flow lives in prompts, so it drifts. `/lu` burns ~457K tokens on turn 1. | The engine |
| `.luca/` phases, milestones, roadmap | — | Ceremony | GitHub: spec issue + ticket sub-issues + native blocking |
| MuninnDB todo backlog + `luca todo` | — | Second tracker. Open data-loss bug (`todo update` is full-replace). | GitHub issues |
| The write-surface CLI (18 nouns) | ~7.2K LOC | Exists so LLMs can mutate `.luca/` safely | Engine code (port the few helpers we need) |
| `luca-code` + its 15 open "critical" bridge todos | ~7.1K LOC | Pi is multi-provider | Pi providers |
| Experiments: runner daemon POC, `skill-opt` | ~1.6K LOC | No callers | — |
| Local telemetry leftovers | small | Retired on 2026-08-07 | The run journal |

**Park, don't delete yet:**

- `todo-ingest` / `goal-brief`: fine in old Luca; superseded by `/to-spec` + `/to-tickets` + the engine.
- `trace-insights`: it mines Claude Code traces today. A LangSmith Pi extension exists (`@langchain/langsmith-pi-extension`), so it can likely follow us to Pi.

**Dropped on 2026-09-22 (user):** Antigravity support, entirely. And the cross-repo handoff mailbox, because we run the harness via Paseo and Paseo's cross-workspace tooling covers it.

## 4. Planned but unbuilt: what carries over

| Item | Verdict | Note |
|---|---|---|
| `/luca` top-level driver (`docs/orchestrator-design.md`, 20 open questions) | **Carry** | It is the seed of the engine spec. Re-check its open questions against the new design. |
| #318 phase compaction, #321 457K first turn, the autonomous re-invoker | **Solved by design** | The orchestrator is code, so no LLM root thread re-bills context every turn |
| #319 budget guard | **Carry** | Make it real (see Keep #9) |
| #320 shared diff + gated re-review | **Carry** | Keep #7 |
| #322 batch shell probing | **Carry** | As guidance in role prompts |
| `luca confidence resolve` | **Carry** | Becomes the escalation policy |
| Agent cross-talk protocol + collaboration UI (deferred specs) | **Carry** | Becomes the message board + TUI board |
| Phantom-verb lint (PAI follow-up) | **Carry** | Keep #14 |
| CI test ratchet, `luca-tools` has no tests | **Carry** | Tests become real gates |
| Pi deferred layers + Pi API learnings (archived, v2.1) | **Carry** | See section 5 and section 6 |
| Workflow slim-down | **Superseded** | Planning moves to Matt Pocock's skills |
| Handoff phases 4–5 | **Drop** | Paseo's cross-workspace tooling covers it |
| trace-insights P2–P4 | **Park** | |
| `luca-code` bridge todos, todo-update merge bug, stage-gate maintenance escape hatch, runner socket auth | **Drop** | Their subsystems go away |

## 5. Lessons the new harness must bake in

Each of these burned us before. Each fix is enforced in code, not asked for in a prompt.

| Lesson (source) | Enforced by |
|---|---|
| Subagents commit, push, open PRs, and `rm` files even when told not to (`pitfall:subagents-take-outward-facing-actions-without-authorization`) | A hard tool guard. Agents never run git write commands; the engine owns git. |
| Prompts and code drift apart (retro defects, phantom verbs) | The flow lives in code. Tests check prompts only name real things. |
| Reviewing before committing reviews nothing; self-review is weak (retro + upstream `implement` bug) | The engine commits first. A fresh reviewer session reviews the committed diff. |
| Long agents lose the task when context overflows (`pitfall:long-playtest-agent-loses-task-on-context-overflow`) | One small task per fresh session. Each role gets only its slice. |
| `git stash` is shared across worktrees; fresh worktrees lack `node_modules` (`pitfall:subagent-git-history-mutation-drops-unrelated-work`) | No stash, ever. The engine creates worktrees and installs deps. |
| Subagents resolve a different project root from their cwd (`pitfall:subagent-cli-invocations-resolve-a-different-project-root`) | The engine sets cwd and passes absolute paths |
| Subagents had no MCP, so memory writes silently no-oped (`pitfall:subagent-capability-blindspot-in-shared-constants`) | Only the engine talks to MuninnDB |
| v2.1 built 12 Pi extensions and 2,106 unit tests that never ran in a live Pi (`pi-integration-deferred-layers.md`) | Tracer bullet: the first slice runs end to end in real Pi |
| Pi subagents that loaded all extensions hit lock contention; 3 of 4 crashed (`pi-api-learnings-from-reference-repo.md`) | Spawn subagents with `--no-extensions` plus only our guard |
| Acceptance criteria that pass before any work (upstream `to-tickets` report) | Red step: the engine proves new tests fail before implementing |
| Planning out-iterates execution (ledger) | Planning stays human-in-the-loop with Matt's skills. The engine never re-plans; it escalates. |

## 6. What changed outside Luca

### Pi

**Pi moved. Build on `@earendil-works/pi-coding-agent` (0.87.0, 2026-09-21), not the installed `@mariozechner/pi-coding-agent` (0.56.3).**

- The old package is deprecated. It stops at 0.73.1 (2026-05-07).
- The repo is now https://github.com/earendil-works/pi (`badlogic/pi-mono` redirects). The package gallery is https://pi.dev/packages.
- `pi update --self` migrates an existing install. The new CLI needs Node ≥ 22.19.
- Between 0.56 and 0.87 there were breaking changes: TypeBox 1.x, tools passed by name, `modelRuntime`, and removed session events.

**Extension API (0.87):**

- **Events** can reshape each turn:
  - `before_agent_start` adds a message or replaces the system prompt.
  - `context` rewrites what the model sees before each call.
  - `tool_call` blocks or edits a tool call; `tool_result` patches results.
  - `turn_end` / `agent_before_settle` can return `continue: true`. That gives a code-driven "not done, tests still fail" loop.
- **Registration:** tools (TypeBox schema, streaming, custom rendering), commands, shortcuts, flags, providers. At runtime: `setActiveTools`, `setModel`, `sendMessage`, `appendEntry`.
- **UI:** dialogs, `notify`, footer status, widgets above or below the editor, custom components and overlays (pi-tui), and a fullscreen mode (0.84).
- **Event bus:** `pi.events` is in-process only. There is no cross-process bus.
- **Cost:** every assistant message carries token usage and dollar cost. `getSessionStats()` sums it.
- **Per-turn model switching** arrived in 0.87.

**Sub-agents:**

- **Core Pi still has none.** The bundled `subagent` example spawns `pi --mode json` processes: single, parallel (max 8, 4 at a time), or chain. It has no worktrees, and the parent LLM decides the flow.
- **SDK:** `createAgentSession({cwd, tools, model, resourceLoader, …})` gives `prompt`, `steer`, `followUp`, `subscribe`, `abort`, `setModel`, and `getSessionStats`. Extensions can be passed inline per session. Sessions can share one event bus.
- **RPC:** `pi --mode rpc` speaks JSONL over stdio. It can't host a rich UI.
- **Best fit for us (research pass's read):** one in-process SDK session per agent, each with its own worktree as `cwd`. Use RPC child processes only where hard isolation or kill-ability matters.

**MCP:**

- Not built in, by design.
- The de-facto add-on is `pi-mcp-adapter`, but it only supports up to Pi 0.86.
- For MuninnDB: the engine calls its REST API at fixed points and injects the results via `before_agent_start`. Agents get two or three narrow tools (recall, remember), with vault routing enforced in code.

**Packages:**

- `pi install npm:…` / `git:…` / local path.
- Manifest: `package.json` → `"pi": {extensions, skills, prompts, themes}`, keyword `pi-package`. Core Pi packages go in `peerDependencies`.
- Project-local packages auto-install, behind a trust gate (0.79).

**Community packages that already overlap with our plan:**

| Package | Stars | What it has |
|---|---|---|
| [`@tintinweb/pi-subagents`](https://github.com/tintinweb/pi-subagents) | 1.2k | In-process children; deterministic workflow scripts (`agent`, `parallel`, `pipeline`, `phase`); worktree isolation with a test gate; live fleet view; a model per agent |
| [`pi-subagents`](https://github.com/nicobailon/pi-subagents) | 3.7k (~101k downloads/week) | Workflow scripts; typed gates; worktrees; model tier per role; spawn budgets; messages to the parent via `pi-intercom` |
| [`@quintinshaw/pi-dynamic-workflows`](https://github.com/QuintinShaw/pi-dynamic-workflows) | 535 | Up to 16 in-process children in worktrees; a routing hook before each spawn; metered cost and budgets; reviewer votes; resume from a journal |
| [`pi-messenger`](https://github.com/nicobailon/pi-messenger) | — | File-based agent chat room; direct messages delivered as steering; file reservations; "Crew" mode (PRD → task graph → waves) |
| [`@langchain/langsmith-pi-extension`](https://www.npmjs.com/package/@langchain/langsmith-pi-extension) | — | LangSmith tracing for Pi sessions, so `trace-insights` could follow us to Pi |

**Gotchas:**

- **No permission system.** Extensions run with full system access, so our guard is our own code.
- **Parallel `pi` processes** have collided on `auth.json` / `settings.json` locks before.
- **Automatic compaction is lossy.** Short-lived role agents may want it off.
- **pi-tui crashes on any line wider than the terminal.** Your own `~/.pi/agent/pi-crash.log` has exactly this, from a "Luca v0.1.0" header. Always truncate to width.
- **Bun:** the CLI runs on Node, and `pi install` calls `npm`. The SDK probably runs under Bun, but prove it in the first spike.
- **Some skills are hidden from the model:** `wayfinder`, `triage`, and `setup-matt-pocock-skills` set `disable-model-invocation: true`, so the engine must call them explicitly (`/skill:triage …`).

### Matt Pocock's chain

- **Installed now** (`~/.agents/skills/`): `wayfinder`, `grilling`, `domain-modeling`, `research`, `prototype`, `to-spec`, `to-tickets`, `implement`, `tdd`, `triage`, `setup-matt-pocock-skills`.
- **Missing but referenced:** `code-review` (called by `implement`), `codebase-design` (called by `tdd`), `grill-with-docs`, `handoff`, `ask-matt`.
- **The chain:** `/wayfinder` (big, foggy efforts) or `/grill-with-docs` → `/to-spec` (one spec issue) → `/to-tickets` (tracer-bullet vertical slices as sub-issues, native `blocked-by`, label `ready-for-agent`) → `/implement` (one ticket per fresh session: TDD, review, commit).
- **Wayfinder tickets are decisions, not build work.** Upstream warns against looping the map straight into `/implement`; go through `/to-spec` and `/to-tickets` first.
- **Where planning ends:** at the approved `/to-tickets` output. `/implement` "never reopens the plan."
- **Closest upstream prior art:** the beta `skills/in-progress/implement-spec`. It runs implementers on every unblocked ticket, each in its own worktree; a merger agent folds results onto one PR branch; then a review, a fix-up agent, and a PR. It is a skill, so the flow still lives in a prompt.

**Gaps our engine must fill** (mostly from upstream's own docs):

1. **Dispatch.** Upstream has no auto-dispatch. Compute the unblocked set in code from native links.
2. **Closing tickets.** `implement` never closes tickets, so nothing unblocks.
3. **Safe parallel runs.** One worktree per ticket; merge one at a time.
4. **Review order.** Commit first, then review in a fresh agent.
5. **Criteria quality.** Each criterion must fail before work starts.
6. **Dependency wiring.** Wire links in code (`gh issue create --parent N --blocked-by …`), not as plain text.
7. **Scheduling.** Dispatch each ticket the moment it unblocks, instead of fixed waves.
8. **HITL vs AFK per ticket,** and test seams written into the ticket, or an unattended run stalls.
9. **Budgets and a PR mode.** Upstream has neither.

### Jev (TypeSafe AI)

- **What:** a "System One" decision model, released 2026-09-15 (early access). You send text plus typed questions (`choice`, `score`, or `noul` = probability a yes/no statement is true). It returns typed answers with probabilities and a confidence. It never writes text.
- **Call it:** `POST https://api.typesafe.ai/v1/systemone`, `"model": "jev-latest"`. SDKs for Python and JS. Also on Vercel AI Gateway as `typesafe-ai/jev`: 32K context, $0.042 per million input tokens, output free.
- **Speed:** 70–500 ms per call (vendor claim).
- **Limits:** text only; at most 255 options per question; the vendor says it does not replace a coding model. Simon Willison notes it's a black box: we need our own accuracy tests.
- **Jev is a guesser, not a rule.** It is fast, cheap, and reports its confidence, but it can be wrong. Deterministic means "same facts in, same move out, always correct." That job belongs to plain code.
- **Plain code owns every stage move.** Examples: tests passed, exit code 0, ticket unblocked, budget spent, fix-loop cap hit. Jev never moves the flow by itself.
- **Jev labels messy text that feeds a code decision:**
  - What kind of failure is this (real, flaky, setup/env, merge conflict, bad test)? Code picks fix, retry, or escalate.
  - Is this review finding a blocker, a should-fix, or a nit? Code picks fix loop or proceed.
  - Is this ticket a real vertical slice? Can an agent do it alone?
  - Is this agent stuck or looping?
  - What is each agent doing right now (a one-word label for the board)?
  - How relevant is each recalled memory (a score)? Code injects only the top ones.
- **Jev's biggest job is observability.** After each run it labels every failure, review finding, and agent step, and turns the journal into "where did we lose time and money." A whole run's journal costs cents.
- **Safety rules:**
  - Low confidence means code escalates to a strong model or to the human.
  - Every Jev call is logged, so we can measure how often it's right.
  - Jev sits behind a switch, with a small LLM as the fallback, because it's early access.
- **Where it doesn't fit:** anything with one right answer (plain code), and anything that writes code or prose (an LLM).

### Claude Code workflows ("ultracode")

The good parts to copy:

1. The plan lives in a script; subagents do the work; only the final result reaches the main thread.
2. `pipeline()` by default: each item flows through the stages on its own. `parallel()` only when a step needs every result at once.
3. Typed results: each agent must return JSON matching a schema.
4. Resume by replay: a journal records each agent's result; unchanged calls return cached results.
5. Identical prompt openings across sibling agents so they share the prompt cache.
6. Worktree isolation only for agents that edit files.
7. Quality patterns: several agents try to refute a finding; reviewers with different lenses; repeat until a round finds nothing new; a final "what's missing?" check.

What it can't do for us: pick models outside Claude, call Jev or MuninnDB from the script, take human input mid-run, or render our own board.

## 7. First sketch of the new shape (for discussion, not approved)

```
PLAN (human in the loop, Matt Pocock's skills)
  /wayfinder → /to-spec → /to-tickets
        │
        ▼  one spec issue + ticket sub-issues + native blocked-by
BUILD (the Luca engine: plain TypeScript on Pi)
  load tickets → check each (Jev: real slice? AFK?) → dispatch every unblocked ticket
    per ticket, in its own worktree:
      recall memories → RED: test-writer, engine proves tests fail
      → GREEN: implementer, engine runs tests/types/lint
      → engine commits → fresh reviewers (lensed) → capped fix loop
      → engine merges → closes the ticket → dependents unblock
  final: whole-branch review + cleanliness check + learner → MuninnDB
  ship: engine opens the PR that closes the spec and tickets
```

Cross-cutting, all in code:

- **Journal:** every engine step and agent event, per run
- **Board:** live Pi widget with tickets, agents, current action, tokens, cost
- **Guard:** per-role tools, no git writes, stay inside the worktree
- **Budget:** hard caps per agent and per run
- **Routing:** plain code for exact answers, Jev for cheap judgment calls, strong LLMs for tests, code, and review

## 8. Open questions (to settle one at a time)

**Prerequisite:** upgrade Pi to `@earendil-works/pi-coding-agent` 0.87 (`pi update --self`) before any spike.

0. **Build or adopt:** own a small engine on the Pi SDK, or build on a community package (`@tintinweb/pi-subagents`, `pi-subagents`, `pi-dynamic-workflows`)? Settle it with a spike: one real ticket, end to end, on the best candidate.
1. **Engine input:** `/to-tickets` output (recommended) or wayfinder tickets?
2. ~~**Human touch points** during a build~~ **Decided 2026-09-22:** only when stuck (low Jev confidence or an exhausted fix loop), plus the final PR review. Revisit after testing.
3. **Where the code lives:** a new package in this repo (port what we keep, delete the rest later) or a new repo?
4. **Where the engine runs:** inside the Pi session (extension) or as its own process that Pi watches?
5. **Models and providers** per role (Pi login, API keys, Copilot, Vercel AI Gateway)?
6. **Old Luca meanwhile:** freeze it and turn off its global hooks, or merge the three stacks first?
7. **LangSmith / trace-insights:** park, or export the journal to it later?
