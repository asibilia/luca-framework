# Plan: Prompt Engineering Hardening & Context Window Architecture

## Objective

Implement 16 of 18 pending todos across `packages/luca-mastracode` to harden prompt engineering (anti-sycophancy, quantified constraints, attention curve exploitation, HARD_CONSTRAINTS dual-injection) and add context window infrastructure (conditional MCP loading, token budget monitoring, mid-conversation injection). Two items deferred: cache boundary and progressive compaction (blocked on Mastra API investigation).

## Context

- **Package**: `packages/luca-mastracode` (standalone CLI, zero cross-package deps)
- **Affected files**: 10 instruction `.md` files, 9 subagent `.ts` files, `index.ts` (969 lines), 10 tools, ~4 new `.ts` files
- **Key constraint**: `getAgentConstraints()` is a lazy singleton — must be refactored to per-call before dynamic injection works
- **Test coverage**: Zero. Verification via typecheck + manual pipeline validation.
- **Token budget**: Net -10,500 tokens (MuninnDB absent) or +4,500 tokens (MuninnDB present)

---

## Phase 1: HARD_CONSTRAINTS Hardening & Assembly Refactor

> Foundation phase. All subsequent phases depend on the assembly changes made here.

### Wave 1.1: Refactor getAgentConstraints() from lazy singleton to per-call

- [ ] **Task 1.1.1**: Replace lazy singleton `getAgentConstraints()` with per-call function
  - Files: `packages/luca-mastracode/src/index.ts` (lines 225-236)
  - Change: Remove `let _agentConstraints: string | null = null` and the `if (_agentConstraints === null)` guard. Make `getAgentConstraints()` always compute and return the result. Keep `loadAlwaysApplyRules()` call (sub-millisecond on local `.mastracode/rules/`).
  - Verification: `bunx --bun tsc --noEmit` passes. Function still returns `"\n\n---\n" + HARD_CONSTRAINTS + alwaysApplyRules`.

### Wave 1.2: Update HARD_CONSTRAINTS content (add "because" clauses + 4th constraint)

- [ ] **Task 1.2.1**: Add "because" clauses to existing 3 constraints and add 4th constraint
  - Files: `packages/luca-mastracode/src/index.ts` (lines 157-163)
  - Change: Update the `HARD_CONSTRAINTS` template literal:
    - Bullet 1: `**Never use temp files as an edit workaround** because it bypasses the harness's change tracking and makes modifications invisible to the review and verification pipeline.` (Keep the existing detail text.)
    - Bullet 2: `**Never shell out for file edits** because execute_command output is not tracked by edit tools, so changes cannot be verified, reviewed, or rolled back by the harness.` (Keep existing exception note.)
    - Bullet 3: `**Respect mode boundaries** because mode restrictions separate concerns — a read-only mode that secretly writes files corrupts the verification guarantee of subsequent phases.`
    - Add Bullet 4: `**Do NOT generate explanatory prose between consecutive tool calls** because text between tool calls wastes tokens and slows execution. If your next action is a tool call, invoke it directly.`
  - Verification: Total constraint block stays under 200 tokens (count with `wc -w`). `bunx --bun tsc --noEmit` passes.

### Wave 1.3: Implement dual-injection (primacy + recency)

- [ ] **Task 1.3.1**: Create compact primacy-zone constraint summary constant
  - Files: `packages/luca-mastracode/src/index.ts` (new constant, near line 155)
  - Change: Add a new `CORE_OPERATING_RULES` constant (~80 tokens) that is a compact summary of the 4 constraints for front-injection:
    ```
    ## Core Operating Rules
    - No temp files or shell commands for edits — use edit tools only.
    - No prose between consecutive tool calls — invoke tools directly.
    - Respect mode boundaries — read-only means read-only.
    ```
  - Verification: Constant is under 100 tokens. `bunx --bun tsc --noEmit` passes.

- [ ] **Task 1.3.2**: Modify `createStaticAgent()` to prepend `CORE_OPERATING_RULES`
  - Files: `packages/luca-mastracode/src/index.ts` (line 259)
  - Change: Update the instructions assembly from:
    `instructions: () => buildInstructions() + getAgentConstraints(),`
    to:
    `instructions: () => CORE_OPERATING_RULES + '\n\n' + buildInstructions() + getAgentConstraints(),`
  - Verification: `bunx --bun tsc --noEmit` passes. Spot-check one mode's assembled instructions to confirm `## Core Operating Rules` appears at top and `## Hard Constraints (all modes)` at bottom.

### Wave 1.4: Add recency reminders to getAgentConstraints()

- [ ] **Task 1.4.1**: Add recency reminder block as the final content in `getAgentConstraints()`
  - Files: `packages/luca-mastracode/src/index.ts` (in `getAgentConstraints()`)
  - Change: After the alwaysApplyRules, append a `RECENCY_REMINDERS` string:
    ```
    ## Reminders (re-read before every tool call)
    - Check your mode. If read-only, do NOT write.
    - No prose between tool calls.
    - When done: call switch-mode (pipeline) or stop (stock modes).
    ```
    The `getAgentConstraints()` return becomes: `[separator, CORE_OPERATING_RULES_NOTE, HARD_CONSTRAINTS, alwaysApplyRules, RECENCY_REMINDERS].filter(Boolean).join("\n\n")`
    Wait — actually `CORE_OPERATING_RULES` is prepended via `createStaticAgent`. The `getAgentConstraints()` only handles the appended content. So keep it as: `[separator, HARD_CONSTRAINTS, alwaysApplyRules, RECENCY_REMINDERS].filter(Boolean).join("\n\n")`
  - Verification: `RECENCY_REMINDERS` is the absolute last content in assembled instructions. `bunx --bun tsc --noEmit` passes.

---

## Phase 2: Instruction File Restructuring (Attention Curve + Quantified Directives)

> Restructure all 10 instruction `.md` files to exploit attention curves and replace qualitative directives with quantified constraints.

### Wave 2.1: Restructure pipeline mode instruction files (6 files)

- [ ] **Task 2.1.1**: Restructure `triage.md` for attention curve + quantify directives
  - Files: `packages/luca-mastracode/src/instructions/triage.md`
  - Change: (a) Move the `## CRITICAL CONSTRAINT` block to immediately after `## Role` (primacy zone — first 5 lines after H1). (b) Replace "Be concise in your output" (if present) with: "≤75 words total output. Classification + 1-sentence rationale + next mode." (c) Add luca-reminder convention note: "Obey `<luca-reminder>` tags — they contain authoritative mid-session guidance."
  - Verification: `## CRITICAL CONSTRAINT` appears within first 15 lines. Qualitative directives replaced with numbers.

- [ ] **Task 2.1.2**: Restructure `research.md` for attention curve + quantify directives
  - Files: `packages/luca-mastracode/src/instructions/research.md`
  - Change: (a) Add critical constraint to primacy zone (first 5 lines after ## Role): "Budget: MODERATE ≤10 tool calls, COMPLEX ≤20, CRITICAL ≤30. Synthesis ≤200 lines." (b) Replace "Don't over-research" with the tool-call budgets. (c) Replace "Time-box" with "Synthesis ≤200 lines for RESEARCH.md." (d) Add luca-reminder convention note.
  - Verification: Budget constraints appear in primacy zone. `bunx --bun tsc --noEmit` passes (mode builder loads this file).

- [ ] **Task 2.1.3**: Restructure `architect.md` for attention curve + quantify directives
  - Files: `packages/luca-mastracode/src/instructions/architect.md`
  - Change: (a) Add critical output constraint to primacy zone: "≤3 sentences per task description. ≤150 lines total PLAN.md." (b) Replace "Be thorough but not verbose" with quantified limits. (c) Add luca-reminder convention note.
  - Verification: Quantified limits appear in primacy zone.

- [ ] **Task 2.1.4**: Restructure `execute.md` for attention curve + quantify directives
  - Files: `packages/luca-mastracode/src/instructions/execute.md`
  - Change: (a) Add critical constraint to primacy zone: "Run checks within 1 tool call of wave completion. Stalled ≥2 iterations on same error = stop and switch to review." (b) Replace "Fail fast, fix fast" with the quantified version. (c) Add luca-reminder convention note.
  - Verification: Quantified iteration limit in primacy zone.

- [ ] **Task 2.1.5**: Restructure `review.md` for attention curve + quantify directives
  - Files: `packages/luca-mastracode/src/instructions/review.md`
  - Change: (a) Add critical constraint to primacy zone: "Maximum 5 MUST-FIX items per review. MUST-FIX = correctness bugs, security, missing requirements ONLY." (b) Replace "Don't nitpick" with quantified version. (c) Add luca-reminder convention note.
  - Verification: MUST-FIX cap in primacy zone.

- [ ] **Task 2.1.6**: Restructure `finalize.md` for attention curve + quantify directives
  - Files: `packages/luca-mastracode/src/instructions/finalize.md`
  - Change: (a) Add critical constraint to primacy zone: "Check every task in PLAN.md. Report exact completed/total ratio." (b) Replace "Be thorough in gap detection" with quantified version. (c) Add luca-reminder convention note.
  - Verification: Gap detection constraint in primacy zone.

### Wave 2.2: Restructure stock mode instruction files (4 files)

- [ ] **Task 2.2.1**: Restructure `fast.md` for attention curve + quantify directives
  - Files: `packages/luca-mastracode/src/instructions/fast.md`
  - Change: (a) Move the Rules section content into primacy zone (immediately after first line). (b) Replace "Under 200 words" with "Under 100 words. ≤25 words between tool calls." (c) Add luca-reminder convention note at bottom.
  - Verification: Word limits appear in first 5 lines.

- [ ] **Task 2.2.2**: Restructure `build.md` for attention curve + quantify directives
  - Files: `packages/luca-mastracode/src/instructions/build.md`
  - Change: (a) Add brief primacy constraint if not present. (b) Add luca-reminder convention note. (c) Review for any qualitative directives to quantify.
  - Verification: Luca-reminder convention present.

- [ ] **Task 2.2.3**: Restructure `plan.md` for attention curve + quantify directives
  - Files: `packages/luca-mastracode/src/instructions/plan.md`
  - Change: Same pattern as build.md — add primacy constraint, luca-reminder convention, quantify directives.
  - Verification: Luca-reminder convention present.

- [ ] **Task 2.2.4**: Restructure `discuss.md` for attention curve + quantify directives
  - Files: `packages/luca-mastracode/src/instructions/discuss.md`
  - Change: (a) Add primacy constraint: "Under 300 words per turn. ≤2 clarifying questions per response." (b) Replace "Keep responses focused" with quantified version. (c) Add luca-reminder convention note.
  - Verification: Word limit in primacy zone.

### Wave 2.3: Template compression pass

- [ ] **Task 2.3.1**: Compress pipeline instruction files (6 files)
  - Files: `triage.md`, `research.md`, `architect.md`, `execute.md`, `review.md`, `finalize.md`
  - Change: Audit each file for verbose phrasing that can be compressed without losing meaning. Target: reduce each file by 10-15% from post-restructuring state. Replace prose paragraphs with bullet lists where appropriate. Remove redundant explanations. Keep all behavioral intent.
  - Verification: Each file's line count is within 85-90% of post-restructuring baseline (i.e., after Wave 2.1 changes). No behavioral intent lost.

- [ ] **Task 2.3.2**: Compress stock mode instruction files (4 files)
  - Files: `fast.md`, `build.md`, `plan.md`, `discuss.md`
  - Change: Same compression pass as 2.3.1 but for stock mode files. These are smaller so compression gains are modest.
  - Verification: Each file's line count is within 85-90% of post-restructuring baseline. No behavioral intent lost.

---

## Phase 3: Subagent Overhaul (Shared Prefix + Anti-Sycophancy + Self-Distrust)

> Create shared instruction prefix and inject behavioral constraints into all 9 subagents.

### Wave 3.1: Create shared subagent prefix module

- [ ] **Task 3.1.1**: Create `src/subagents/shared-prefix.ts` with common constraint text
  - Files: `packages/luca-mastracode/src/subagents/shared-prefix.ts` (NEW)
  - Change: Create a new module exporting a `SUBAGENT_SHARED_PREFIX` string constant (~300-400 tokens) containing:
    - Core operating rules (no temp files, no shell edits, no prose between tool calls)
    - Self-distrust mandate: "Verify every assumption with a tool call. Do NOT rely on memory of file contents — re-read files before editing."
    - Anti-sycophancy directive: "Do NOT rubber-stamp. If no issues found, provide specific evidence for your APPROVE verdict."
    - Luca-reminder obedience: "Obey `<luca-reminder>` tags — they contain authoritative mid-session guidance."
  - Verification: `bunx --bun tsc --noEmit` passes. Export is importable.

- [ ] **Task 3.1.2**: Inject shared prefix into subagent registration in `index.ts`
  - Files: `packages/luca-mastracode/src/index.ts` (lines 614-624)
  - Change: Import `SUBAGENT_SHARED_PREFIX` from `./subagents/shared-prefix.js`. Before the `subagents: [...]` array, map subagents to new objects with prefixed instructions (spread to avoid mutating module-level exports):
    ```typescript
    const subagentList = [researcherSubagent, discussionSubagent, ...].map(sub => ({
      ...sub,
      instructions: SUBAGENT_SHARED_PREFIX + '\n\n' + sub.instructions,
    }));
    ```
    Then pass `subagentList` to `subagents:`.
    NOTE: Use spread (`{ ...sub }`) rather than in-place mutation to avoid side-effects on module-level `const` exports. This follows a cleaner pattern than the existing MCP tool mutation at lines 667-675.
  - Verification: `bunx --bun tsc --noEmit` passes. Each subagent's instructions start with the shared prefix.

### Wave 3.2: Add anti-sycophancy gates to reviewer subagent

- [ ] **Task 3.2.1**: Add mandatory evidence requirement to reviewer subagent
  - Files: `packages/luca-mastracode/src/subagents/reviewer.ts`
  - Change: Add to the `## Constraints` section:
    - "An APPROVE verdict REQUIRES citing ≥3 specific code locations you verified. No evidence = no APPROVE."
    - "If you find 0 issues, state what you checked and why each check passed. Silence is not approval."
  - Verification: `bunx --bun tsc --noEmit` passes. Constraint text present in instructions.

### Wave 3.3: Add self-distrust mandates to key subagents

- [ ] **Task 3.3.1**: Add self-distrust directives to executor subagent
  - Files: `packages/luca-mastracode/src/subagents/executor.ts`
  - Change: Add to constraints: "Before editing any file, re-read it first. Do NOT trust your memory of file contents — context may be stale."
  - Verification: `bunx --bun tsc --noEmit` passes.

- [ ] **Task 3.3.2**: Add self-distrust directives to verifier subagent
  - Files: `packages/luca-mastracode/src/subagents/verifier.ts`
  - Change: Add to constraints: "Verify every claim against actual file contents. Re-read files even if you think you know their state."
  - Verification: `bunx --bun tsc --noEmit` passes.

- [ ] **Task 3.3.3**: Add self-distrust directives to planner subagent
  - Files: `packages/luca-mastracode/src/subagents/planner.ts`
  - Change: Add to constraints: "Before referencing any file path or line number, verify it exists via `find_files` or `view`. Do NOT assume paths from context."
  - Verification: `bunx --bun tsc --noEmit` passes.

- [ ] **Task 3.3.4**: Add self-distrust directives to plan-reviewer subagent
  - Files: `packages/luca-mastracode/src/subagents/plan-reviewer.ts`
  - Change: Add to constraints: "Verify file paths and function names referenced in the plan against actual codebase. Plans with incorrect paths are incomplete."
  - Verification: `bunx --bun tsc --noEmit` passes.

---

## Phase 4: Tool Description Enrichment & Cross-Tool Coordination

> Enrich tool descriptions with behavioral guidance, bidirectional constraints, and cross-tool coordination.

### Wave 4.1: Enrich high-impact tool descriptions

- [ ] **Task 4.1.1**: Enrich `workflow-state.ts` tool description with behavioral guidance
  - Files: `packages/luca-mastracode/src/tools/workflow-state.ts`
  - Change: Update the `description` field to include: (a) Allowed transitions per mode (reference PIPELINE_ORDER). (b) "Do NOT call switch-mode without completing current mode's requirements." (c) Per-action behavioral hints in `action` field `.describe()`.
  - Verification: `bunx --bun tsc --noEmit` passes. Description under 500 chars.

- [ ] **Task 4.1.2**: Enrich `run-checks.ts` tool description with behavioral guidance
  - Files: `packages/luca-mastracode/src/tools/run-checks.ts`
  - Change: Update description: "Run project checks (typecheck, test, lint, build). Call IMMEDIATELY after completing code changes — do NOT batch multiple waves before checking. Use 'all' to run the full suite, NOT individual checks."
  - Verification: `bunx --bun tsc --noEmit` passes.

- [ ] **Task 4.1.3**: Enrich `manage-todos.ts` tool description
  - Files: `packages/luca-mastracode/src/tools/manage-todos.ts`
  - Change: Add behavioral guidance: "Use 'list' before 'add' to check for duplicates. When moving todos to 'done', include a completion rationale."
  - Verification: `bunx --bun tsc --noEmit` passes.

- [ ] **Task 4.1.4**: Enrich `manage-roadmap.ts` tool description
  - Files: `packages/luca-mastracode/src/tools/manage-roadmap.ts`
  - Change: Add guidance: "Always 'read' before 'update-status' to verify current state. Use 'compute-order' after creating phases to validate dependency graph."
  - Verification: `bunx --bun tsc --noEmit` passes.

### Wave 4.2: Enrich remaining tool descriptions

- [ ] **Task 4.2.1**: Enrich `verification-result.ts`, `session-ledger.ts`, `pipeline-lock.ts`, `classify-complexity.ts`, `repo-cleanup.ts`, `write-planning-file.ts` descriptions
  - Files: 6 files in `packages/luca-mastracode/src/tools/`
  - Change: For each tool, add 1-2 sentences of behavioral guidance to the `description` field. Focus on: when to call, what to check first, what NOT to do.
  - Verification: `bunx --bun tsc --noEmit` passes. Each description under 500 chars.

### Wave 4.3: Add cross-tool coordination directives to instruction files

- [ ] **Task 4.3.1**: Add cross-tool coordination section to `execute.md`
  - Files: `packages/luca-mastracode/src/instructions/execute.md`
  - Change: Add a `## Tool Coordination` section: "After each wave: (1) run_checks → (2) if fail: fix → re-check → (3) if pass: advance-wave via workflow_state. Do NOT advance without passing checks."
  - Verification: Section present in file.

- [ ] **Task 4.3.2**: Add cross-tool coordination to `finalize.md` and `review.md`
  - Files: `packages/luca-mastracode/src/instructions/finalize.md`, `review.md`
  - Change: Add coordination hints for the tool sequences these modes use (review: spawn reviewers → aggregate → save-review-results; finalize: run-checks → repo-cleanup → session-ledger → milestone).
  - Verification: Coordination sections present.

---

## Phase 5: Context Window Infrastructure

> Add conditional MCP loading, token budget monitoring, and mid-conversation injection.

### Wave 5.1: Implement conditional MCP loading per mode

- [ ] **Task 5.1.1**: Define MCP-aware mode list constant
  - Files: `packages/luca-mastracode/src/index.ts` (near line 155)
  - Change: Add a constant using the actual `createStaticAgent()` `id` values (NOT mode_id values):
    ```typescript
    const MCP_ENABLED_MODES = new Set([
      'luca-build', 'luca-execute', 'luca-finalize', 'luca-discuss',
    ]);
    ```
    These are the modes that benefit from MuninnDB tools. Lightweight modes (luca-fast, luca-plan, luca-triage, luca-research, luca-architect, luca-review) don't need them.
    NOTE: Agent `id` values use hyphens (`luca-build`), NOT colons (`luca:discuss`) or bare names (`build`). The colon-format (`luca:4-execute`) is the mode_id used in `MODE_PERMISSIONS`, not the agent id.
  - Verification: `bunx --bun tsc --noEmit` passes.

- [ ] **Task 5.1.2**: Conditionally inject MCP tools in `createStaticAgent()`
  - Files: `packages/luca-mastracode/src/index.ts` (lines 272-275)
  - Change: Update the `tools` callback:
    ```typescript
    tools: () => {
      if (MCP_ENABLED_MODES.has(id)) {
        const mcpTools = mcpManagerRef.current?.getTools() ?? {};
        return { ...tools, ...mcpTools };
      }
      return tools;
    },
    ```
  - Verification: `bunx --bun tsc --noEmit` passes. Lightweight modes no longer receive MCP tools (~15K token savings per turn).

### Wave 5.2: Implement token budget monitoring

- [ ] **Task 5.2.1**: Create `src/token-budget.ts` module
  - Files: `packages/luca-mastracode/src/token-budget.ts` (NEW)
  - Change: Create a `TokenBudgetMonitor` class:
    ```typescript
    interface BudgetState {
      totalInputTokens: number;
      totalOutputTokens: number;
      turnsCompleted: number;
      toolCallsCompleted: number;
      estimatedUtilization: number;
    }
    const THRESHOLDS = {
      INJECT_REMINDERS: 0.30,
      WARNING: 0.65,
      BLOCK: 0.90,
    };
    ```
    Use character-count heuristic (~1 token per 4 chars, conservative). Expose `onThresholdCrossed(callback)` for event-driven interventions.
  - Verification: `bunx --bun tsc --noEmit` passes. Module exports `TokenBudgetMonitor` class.

- [ ] **Task 5.2.2**: Add `tokenBudgetRef` to `refs.ts` and wire in `index.ts`
  - Files: `packages/luca-mastracode/src/refs.ts`, `packages/luca-mastracode/src/index.ts`
  - Change: Add `tokenBudgetRef` mutable ref to `refs.ts`. In `index.ts`, instantiate `TokenBudgetMonitor` after harness init, wire it to harness event subscription (subscribe to `tool_end` and `agent_end` events to track turns and tool calls).
  - Verification: `bunx --bun tsc --noEmit` passes. Token monitor instance created at startup.

### Wave 5.3: Implement mid-conversation injection infrastructure

- [ ] **Task 5.3.1**: Create `src/context-refresher.ts` module
  - Files: `packages/luca-mastracode/src/context-refresher.ts` (NEW)
  - Change: Create a `ContextRefresher` class that:
    - Subscribes to token budget thresholds via `TokenBudgetMonitor.onThresholdCrossed()`
    - At `INJECT_REMINDERS` threshold (30% utilization): injects a `<luca-reminder>` via `followUpRef.current({ content: wrapInSystemReminder(reminder) })`
    - Reminder content: compact repeat of mode-specific critical constraints (e.g., "You are in execute mode. Run checks after each wave. Max 3 fix iterations.")
    - Configurable reminder templates per mode (keyed by mode ID)
  - Verification: `bunx --bun tsc --noEmit` passes. Module exports `ContextRefresher` class.

- [ ] **Task 5.3.2**: Wire `ContextRefresher` into harness event system in `index.ts`
  - Files: `packages/luca-mastracode/src/index.ts`
  - Change: After harness init, create `ContextRefresher` instance. Subscribe to `mode_changed` events to update the current mode's reminder template. Connect to `TokenBudgetMonitor` for threshold-triggered injection.
  - Verification: `bunx --bun tsc --noEmit` passes. Reminder injection connected to threshold system.

---

## Verification Criteria

### Per-Phase Verification
1. **Phase 1**: `bunx --bun tsc --noEmit` passes. `CORE_OPERATING_RULES` at top of assembled instructions, `## Hard Constraints` at bottom, `## Reminders` absolute last. All 4 constraints have "because" clauses.
2. **Phase 2**: All 10 `.md` files have quantified constraints in primacy zone (first 15 lines). No qualitative directives remain. Luca-reminder convention noted in all files. Each file within 85-90% of post-restructuring line count after compression. **Grep-based verification**: For each file, run `head -15 <file> | grep -c '<expected-constraint>'` to confirm primacy zone placement. Verify luca-reminder with `grep -c 'luca-reminder' <file>`.
3. **Phase 3**: Shared prefix present in all 9 subagent instructions (verify via logging or debugger). Anti-sycophancy gate in reviewer requires evidence for APPROVE. Self-distrust mandate in executor, verifier, planner, plan-reviewer.
4. **Phase 4**: All 10 tool descriptions enriched with behavioral guidance. Cross-tool coordination sections in execute.md, review.md, finalize.md.
5. **Phase 5**: MCP tools only injected for modes in `MCP_ENABLED_MODES`. Token budget monitor instantiated and tracking turns. Context refresher fires reminder at 30% utilization threshold.

### Overall Verification
- `bunx --bun tsc --noEmit` passes after all phases
- Manual smoke test: Run the Luca pipeline on a SIMPLE task and verify:
  - Triage completes in ≤75 words
  - Research respects tool-call budget
  - Execute runs checks after wave completion
  - Review doesn't rubber-stamp (APPROVE requires evidence)
  - MCP tools absent from research/architect mode tools

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Behavioral regression from constraint relocation | HIGH | Different headings for dual-injection (Core Operating Rules vs Hard Constraints). Recency reminders as absolute last content. |
| Quantified limits too restrictive | MEDIUM | Cross-reference against BUDGET_MATRIX. Start with generous limits, tighten in future iteration. |
| Instruction assembly breakage | MEDIUM | Phase 1 changes are self-contained. TypeScript catches import/export errors. Each phase verified independently. |
| Token overhead with MuninnDB active | LOW | +4,500 tokens within OM headroom (50K threshold). Conditional MCP loading compensates for lightweight modes. |
| Lazy cache removal performance | LOW | `loadAlwaysApplyRules()` reads local directory — sub-millisecond per call. No measurable impact. |
