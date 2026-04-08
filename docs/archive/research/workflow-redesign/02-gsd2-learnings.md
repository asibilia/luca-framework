# GSD2 Learnings

> **Source:** https://github.com/gsd-build/gsd-2
> **Context:** GSD v1 (Claude Code prompt framework) evolved into GSD v2 (standalone CLI on Pi SDK).
> The creator encountered many of the same problems Luca has and arrived at clear architectural decisions.

## GSD2 Architecture Summary

GSD2 is a TypeScript CLI built on the Pi SDK that controls the full agent lifecycle: context windows, sessions, model selection, git, cost tracking. State lives entirely on disk (`.gsd/`). Every unit of work gets a fresh context window with pre-inlined artifacts.

**Work hierarchy:** Milestone → Slice → Task (maps to our Milestone → Phase → Wave task)

**Pipeline per milestone:**

```
research-milestone → plan-milestone →
  (research-slice → plan-slice → execute-task × M → complete-slice → reassess-roadmap) × N →
  validate-milestone → complete-milestone
```

---

## Learning 1: Fresh Context Per Unit of Work

GSD2's most fundamental design decision. Every task gets a clean 200K-token context window with only what it needs pre-inlined. The orchestrator is TypeScript code, not an LLM prompt — it reads disk state, builds a dispatch prompt, creates a fresh agent session, injects the prompt, and captures output.

**Why they did it:** Context pollution across tasks degrades quality. Task 5 shouldn't be affected by the debugging journey of Task 3.

**What this means for Luca:** We can't control Claude Code's session lifecycle, but each Agent() call IS a fresh context. Our dispatch prompts (agent-prompts.ts templates) are the primary mechanism for context management. The cognitive pre-flight should focus on assembling the right context payload for downstream agents, not just "recalling memories." What we inline into each agent prompt determines output quality.

## Learning 2: The Iron Rule — Tasks Must Fit One Context Window

If a task cannot complete in one context window, it becomes two tasks. This is an explicit, enforced constraint — not a guideline.

**Why they did it:** Tasks that overflow context windows produce degraded output in the tail. GSD2's quality zone model (Peak 0-30%, Good 30-50%, Degrading 50-70%, Stop 70%+) means work done past 50% is already lower quality.

**What this means for Luca:** Our planner (lu-planner) should enforce that individual tasks within a wave are scoped to fit in a single agent context. This is currently implicit. The plan review step (5g-v2) should check task scope as a verification criterion.

## Learning 3: Reassessment After Every Slice

GSD2 runs `reassess-roadmap` after each slice completes — not just at the milestone boundary. This catches drift early: a slice may make another slice unnecessary, reveal a gap, or shift dependencies.

**Why they did it:** Roadmaps go stale during execution. Waiting until milestone boundary to discover drift wastes work on phases that are no longer relevant.

**What this means for Luca:** Our Step 5q (update state after each phase) should include a lightweight roadmap drift check. Are the remaining phases still valid given what we just built? This doesn't need to be an LLM call — it can be a structured check: did the phase's output change files that are inputs to future phases? Did verification reveal something that invalidates a future phase's assumptions?

**Note:** GSD2's ADR-003 proposes making reassessment opt-in to reduce ceremony. The right answer may be a lightweight mechanical check always, with full LLM reassessment only when the mechanical check flags drift.

## Learning 4: Stuck Detection

GSD2 does sliding-window analysis of dispatch history to detect repeated A→B→A→B cycling. If detected, it retries once with a deep diagnostic prompt, then stops.

**Why they did it:** Without stuck detection, the implementation loop burns all iterations on the same failure pattern. Iteration 3 doing the same thing as iteration 1 is pure waste.

**What this means for Luca:** Our implementation loop (5h-5k) should track what each iteration attempted and what failed. If iteration N hits the same verification failures as iteration N-1, continuing with the same approach is waste. Options: (a) escalate with diagnostic context, (b) try a different approach (different model tier, different decomposition), (c) park the phase. The key insight is that **convergence detection** is more valuable than iteration count limits.

## Learning 5: Structured Verification Data

GSD2 writes `T##-VERIFY.json` files — structured evidence with command, exit code, verdict, duration, blocking status. Milestone validation aggregates these deterministically — no LLM interpretation needed.

**Why they did it:** Prose verification (VERIFICATION.md) requires an LLM to interpret. Structured data can be aggregated, compared, and acted on mechanically. The orchestrator can make routing decisions from JSON without burning tokens.

**What this means for Luca:** We should consolidate to structured-first verification. The verifier agent should output JSON that the orchestrator reads programmatically. Prose summaries can be derived from structured data. Same principle applies to state: `state.json` is the source of truth, `STATE.md` is either a derived view or eliminated. This removes the dual-write guarantee overhead and eliminates inconsistency risk between the two formats.

## Learning 6: Complexity Classification is Deterministic

GSD2 classifies complexity in sub-millisecond heuristics: unit type defaults, task plan analysis (step count, file count, description length, complexity keywords), routing history. No LLM call.

**Why they did it:** Spawning an LLM to classify complexity is expensive and adds latency. The classification task is well-defined enough for heuristics. They also do adaptive learning from routing history — if similar tasks in the past needed heavier models, future similar tasks get routed higher.

**What this means for Luca:** We spawn Agent("classify") which is an LLM call. This could be a pure TypeScript function: read the phase description, count tasks in plan, check file scope, apply keyword heuristics, consult routing history. Save the LLM call for actual work. The model routing table already exists — we just need deterministic input to index into it.

## Learning 7: Pipeline Ceremony Overhead is Real

GSD2 measured it: quality profile = 30 sessions per milestone, only 12 are actual task execution. 60% ceremony. Their ADR-003 proposes collapsing to 16 sessions by merging research into planning, folding completion into mechanical post-processing, making reassessment opt-in.

**Why they did it:** Every agent session has a cost (tokens, time, context setup). Phases that exist "because the process says so" rather than "because they produce value" should be eliminated or merged.

**What this means for Luca:** We should audit our agent spawn count per phase. Current proposal: classify + discuss + plan + execute + harness + fix + verify + 4 reviewers + review-fix + learn + process-data = 14+ agent calls minimum per phase. Plus v2 research adds 8 more. Key questions: Can research be merged into planning? Can classification be deterministic? Can learning capture be mechanical? Can we eliminate process-data as a separate agent? Every agent call we remove is tokens saved and latency reduced.

## Learning 8: Token Profiles Over Complexity Gating

GSD2 coordinates model selection, phase depth, and context compression into three profiles (budget/balanced/quality). The budget profile skips research and validation, saving 40-60%. The quality profile runs everything.

**Why they did it:** Different situations need different throughput/quality tradeoffs. A prototype iteration doesn't need the same rigor as a production release. Instead of complexity determining which steps run, the user's intent determines how thorough each step is.

**What this means for Luca:** Instead of complexity gating (which we're removing), we could have token profiles that control depth within steps. All steps always run, but: budget = lighter research, fewer review iterations, minimal context inlining. Quality = deep research, multiple review passes, full context. This maps to our existing model routing presets but extends to loop budgets and context depth. The user sets the profile, not the task complexity.

## Learning 9: State is Data, Not Documents

GSD2 uses structured files throughout: YAML frontmatter in summaries, JSON for verification, structured state files. The orchestrator reads data, not prose. When the orchestrator needs to make a routing decision, it parses JSON — it never asks an LLM to interpret a markdown file.

**Why they did it:** Prose requires LLM interpretation, which costs tokens and introduces non-determinism. Structured data enables mechanical aggregation, comparison, and routing. The orchestrator should be a state machine that reads data and makes deterministic decisions, with LLMs reserved for creative/generative work.

**What this means for Luca:** Our `state.json` / `STATE.md` duplication exemplifies this problem. We have a typed state machine AND a markdown file that must stay in sync. Commit to `state.json` as sole source of truth. `STATE.md` becomes a derived view (generated by `luca-bridge snapshot`) or is eliminated. Apply the same principle: verification output → JSON first; phase results → JSON first; milestone summaries → structured first with optional prose derivation.

## Learning 10: Crash Recovery From Disk State

GSD2's crash recovery works because the lock file tracks the current unit and all state is on disk. On crash, next launch synthesizes a recovery briefing from surviving session data. Recovery is deterministic.

**Why they did it:** If state lives in-memory or in LLM context, a crash loses everything. If state lives on disk as structured data, recovery is: read last checkpoint → determine next step → build dispatch prompt → continue.

**What this means for Luca:** Our crash recovery (Step 0) already reads state.json and the context file, but relies on the LLM to interpret where it left off. With fully structured state data (learning #9), crash recovery becomes deterministic: read state.json → find last completed step → find last completed phase → resume from next step. No LLM interpretation needed. The context file (`/tmp/lu-context.json`) should track pipeline position explicitly, not rely on state inference.

---

## GSD2 vs Luca Comparison

| Dimension          | GSD2                                      | Luca (Current)                         | Luca (Proposed)                         |
| ------------------ | ----------------------------------------- | -------------------------------------- | --------------------------------------- |
| Runtime            | Standalone CLI (Pi SDK)                   | Claude Code skills/agents              | Claude Code flat Agent() orchestrator   |
| Session model      | Fresh per unit (code controls lifecycle)  | Single long-running session            | Fresh Agent() per step (within session) |
| State format       | Structured files (JSON, YAML frontmatter) | Dual: state.json + STATE.md            | TBD — should consolidate to JSON        |
| Work hierarchy     | Milestone → Slice → Task                  | Phase → Wave → Task                    | Same (restoring milestone level)        |
| Memory             | KNOWLEDGE.md (append-only file)           | MuninnDB (semantic graph)              | MuninnDB (no change)                    |
| Complexity routing | 3-tier heuristic (sub-ms)                 | 5-level LLM classification             | TBD — should be deterministic           |
| Verification       | Structured JSON (T##-VERIFY.json)         | Prose (VERIFICATION.md) + harness JSON | TBD — should be structured-first        |
| Reassessment       | After every slice                         | Only at milestone boundary             | TBD — should be per-phase               |
| Stuck detection    | Sliding window on dispatch history        | None                                   | TBD — should add                        |
| Pipeline overhead  | 30 sessions (60% ceremony), ADR-003 → 16  | 14+ agents per phase                   | TBD — should audit and reduce           |
| Cost tracking      | Per-unit token/cost ledger                | None built-in                          | Not in scope (Claude Code subsidies)    |
| Parallel execution | Multi-process workers with worktrees      | Single session                         | Not in scope yet                        |
