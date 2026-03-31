# Step 10: Verify + UAT

## Purpose

The Verify + UAT step confirms that the executed code actually achieves the phase goal from the user's perspective, then captures validated learnings into MuninnDB. This step performs two distinct functions:

1. **Goal-backward verification** (automated): Starting from the phase goal, verify that the codebase delivers what was promised -- not just that tasks completed.
2. **User Acceptance Testing** (interactive): Walk the user through testable deliverables one at a time, collecting pass/fail verdicts.

This step also runs code quality review (parallel reviewer agents) and closes the learning loop by extracting patterns, decisions, and pitfalls from the session.

## Inputs

| Input            | Source                                       | Description                                |
| ---------------- | -------------------------------------------- | ------------------------------------------ |
| Code changes     | Git commits from Step 9                      | The implemented code                       |
| SUMMARY.md files | Step 9                                       | Per-plan execution results and deviations  |
| VERIFICATION.md  | Step 9 (from lu-verifier)                    | Goal-backward verification result          |
| Research corpus  | `.planning/phases/{NN}-{name}/research/*.md` | For verifying research-plan-code alignment |
| PLAN.md files    | Step 7                                       | Original plans with must_haves             |
| CONTEXT.md       | Step 3                                       | Locked decisions to verify against         |
| Session findings | MuninnDB `session:*` (repo vault)            | Runtime discoveries from execution         |

## Process

### 10.1 Goal-backward verification (already completed in Step 9)

The `lu-verifier` agent was spawned at the end of Step 9. Its VERIFICATION.md output is available. If verification failed, the orchestrator in Step 9 already attempted fix iterations.

If VERIFICATION.md shows PASSED, proceed to UAT. If FAILED with unresolved issues, present to user:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca > VERIFICATION ISSUES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Verification found issues that could not be auto-fixed:

1. [must_have] "Max retry limit causes transition to FAILED"
   Status: PARTIAL -- FAILED state exists but no UI indicator shows it

2. [key_link] reconnect-manager.ts -> connection-indicator.tsx
   Status: MISSING -- Event subscription not wired

Options:
  [F] Fix now -- plan and execute fixes
  [C] Continue to UAT -- test what exists
  [R] Review details -- see full VERIFICATION.md
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 10.2 User Acceptance Testing

Extract testable deliverables from SUMMARY.md files and present one at a time:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca > UAT: WebSocket Reconnection (1/5)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Test: Connection state indicator shows correct status

Expected: When WebSocket connects, header shows green indicator.
When connection drops, indicator turns yellow with "Reconnecting..." text.

Does this work as expected?
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

User responses:

- "yes" / "y" / "next" = PASS
- Anything else = ISSUE (severity inferred from description)

**UAT tests for the WebSocket example:**

| #   | Test                   | Expected                                                        | Source                           |
| --- | ---------------------- | --------------------------------------------------------------- | -------------------------------- |
| 1   | Connection indicator   | Green when connected, yellow when reconnecting, red when failed | CONTEXT.md: Reconnection UX      |
| 2   | Automatic reconnection | After server restart, client reconnects without user action     | Plan 01: Reconnection manager    |
| 3   | Exponential backoff    | Reconnection delays increase (1s, ~2s, ~4s, visible in console) | Plan 01: Backoff calculator      |
| 4   | Max retry exhaustion   | After 10 failed attempts, shows error state, stops retrying     | Plan 01: FAILED state transition |
| 5   | Toast notifications    | "Connection lost" on disconnect, "Connected" on reconnect       | Plan 03: UX integration          |

### 10.3 Write UAT.md

After all tests complete, write results:

**File: `.planning/phases/08-websocket-reconnection/08-UAT.md`**

```markdown
# Phase 08: WebSocket Reconnection - UAT Results

**Tested:** 2026-03-22
**Tester:** User (interactive)
**Result:** 4/5 PASSED, 1 ISSUE

## Test Results

| #   | Test                   | Result         | Notes                                                 |
| --- | ---------------------- | -------------- | ----------------------------------------------------- |
| 1   | Connection indicator   | PASS           | Green/yellow/red states work correctly                |
| 2   | Automatic reconnection | PASS           | Reconnects after server restart                       |
| 3   | Exponential backoff    | PASS           | Delays visible: 1.2s, 2.4s, 4.1s (jitter working)     |
| 4   | Max retry exhaustion   | ISSUE (MEDIUM) | Error state shows but indicator stays yellow, not red |
| 5   | Toast notifications    | PASS           | "Connection lost" and "Connected" toasts appear       |

## Issues

### Issue 1: Indicator does not turn red on FAILED state

- **Severity:** MEDIUM
- **Expected:** Red indicator when max retries exhausted
- **Actual:** Indicator stays yellow (RECONNECTING color) even in FAILED state
- **Likely cause:** State change listener does not handle FAILED state
```

### 10.4 Handle UAT issues

If UAT issues exist, spawn parallel debuggers:

```python
Task(
  prompt="""
  <debug_context>
  **UAT Issue:** Connection indicator does not turn red on FAILED state
  **Expected:** Red indicator when max retries exhausted
  **Actual:** Yellow indicator persists in FAILED state
  **Likely files:** src/components/connection-indicator.tsx, src/ws/reconnect-manager.ts
  </debug_context>
  Diagnose the root cause.
  """,
  subagent_type="lu-debugger",
  description="Diagnose: Indicator not red on FAILED"
)
```

After diagnosis, plan fixes via `lu-planner` in `--gaps` mode, verify via `code-architect` (quick review), then execute via `lu-executor`.

### 10.5 Code quality review

After UAT passes (or issues are fixed), spawn parallel reviewer agents in cold isolation:

```python
# Get changed files
# git diff --name-only main...HEAD -- '*.ts' '*.tsx'

# Spawn ALL reviewers in PARALLEL
Task(
  prompt="Review for conventions and standards: {changed_files}",
  subagent_type="dx-advocate",
  description="DX review"
)

Task(
  prompt="Review for DRY and complexity: {changed_files}",
  subagent_type="code-simplifier",
  description="Simplification review"
)

Task(
  prompt="Review for architecture patterns: {changed_files}",
  subagent_type="code-architect",
  description="Architecture review"
)

Task(
  prompt="Review for security (WebSocket, network code): {changed_files}",
  subagent_type="security-auditor",
  description="Security review"
)
```

Merge findings by severity. CRITICAL issues block; HIGH/MEDIUM are warnings with options.

### 10.6 Final learning capture + research promotion

Spawn `lu-learner` to close the learning loop. **Note:** This is the second `lu-learner` invocation (the first was in Step 9, section 9.11, capturing post-execution implementation findings). This invocation has two distinct responsibilities:

1. **Extract new learnings** from UAT results, code review findings, and the full execution session
2. **Promote high-value `research:*` engrams** from the repo vault to permanent `pattern:*`/`pitfall:*`/`decision:*` in the default vault (Decision 4 -- deferred promotion)

Only `research:*` engrams that were validated through actual execution (tracked via `session:applied-engrams` from Step 9) are candidates for promotion. This ensures only proven research reaches the permanent namespace.

```python
Task(
  prompt="""
  <learning_context>
  **Phase:** 08 - WebSocket Reconnection
  **Verification:** PASSED
  **UAT:** 4/5 PASSED (1 issue fixed)
  **Code review:** PASSED (0 critical, 1 medium)
  **Repo vault:** luca-framework
  **Default vault:** default

  **Session findings from MuninnDB:**
  {recall all session:* engrams from this session}

  **Applied engrams:**
  {recall session:applied-engrams}

  **Graduated research engrams (from Step 6):**
  {recall all research:* engrams from repo vault}

  **Instructions:**
  1. Extract validated patterns (approaches that worked)
  2. Extract confirmed pitfalls (issues encountered)
  3. Extract new decisions (choices made during execution)
  4. Extract procedures (successful task sequences that can be reused)
  5. **PROMOTE** high-value research:* engrams to permanent namespaces:
     - research:pattern-* -> pattern:* in DEFAULT vault (cross-cutting)
     - research:pitfall-* -> pitfall:* in DEFAULT vault (cross-cutting)
     - research:decision-* -> decision:* in REPO vault (project-specific)
     Only promote engrams that were actually applied during execution.
  6. Route new learnings to correct vault per routing rules
  7. Deduplicate against existing engrams
  8. Clear session context after extraction
  </learning_context>
  """,
  subagent_type="lu-learner",
  description="Final learning capture + research promotion"
)
```

**Example learnings extracted:**

```
# Default vault (cross-cutting)
mcp__muninn__muninn_remember(
  vault: "default",
  concept: "pitfall:bun-ws-send-during-connecting",
  content: "Bun's WebSocket.send() throws TypeError if called while connection is in CONNECTING state. Always check readyState === WebSocket.OPEN before sending, or queue messages for replay after OPEN."
)

mcp__muninn__muninn_remember(
  vault: "default",
  concept: "pattern:ws-send-queue-during-reconnect",
  content: "Queue WebSocket messages attempted during RECONNECTING state. Replay queue on successful reconnection (OPEN event). Clear queue on FAILED or intentional CLOSED."
)

# Default vault (procedure:* is cross-cutting per vault routing rules)
mcp__muninn__muninn_remember(
  vault: "default",
  concept: "procedure:ws-reconnection-implementation",
  content: "Successful procedure for implementing WebSocket reconnection: (1) Define state types with discriminated union + AbortController, (2) Implement backoff calculator as pure function, (3) Build reconnection manager composing state + backoff, (4) Add heartbeat as separate module, (5) Wire to UI last. Total: 3 plans, 8 tasks, 2 waves."
)
```

### 10.7 Clear session context

After learning capture, clear session engrams:

```
# Session engrams have been processed -- no longer needed
# lu-learner handles this as part of its closing protocol
```

### 10.8 Present final status

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca > PHASE 08 VERIFIED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Verification: PASSED
UAT: 5/5 PASSED (1 issue fixed during UAT)
Code review: PASSED (0 critical)

Learnings captured:
  Default vault: 2 new engrams (1 pitfall, 1 pattern)
  Repo vault: 1 new procedure

Next:
  /phase-discuss 9 -- gather context for next phase
  /milestone-audit -- if this was the final phase
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Outputs

| Output                      | Location                                   | Description                                         |
| --------------------------- | ------------------------------------------ | --------------------------------------------------- |
| UAT.md                      | `.planning/phases/{NN}-{name}/{NN}-UAT.md` | Test results with pass/fail per test                |
| Code review findings        | In-memory (logged)                         | Merged reviewer findings by severity                |
| Fix commits (if UAT issues) | Git commits                                | Fixes for UAT-discovered issues                     |
| Pattern engrams             | MuninnDB default vault                     | Validated approaches from execution                 |
| Pitfall engrams             | MuninnDB default vault                     | Issues encountered during execution                 |
| Decision engrams            | MuninnDB repo vault                        | Choices made during execution                       |
| Procedure engrams           | MuninnDB default vault (`procedure:*`)     | Successful task sequences for reuse (cross-cutting) |

## Agents Involved

| Agent              | Count               | Role                                                            | Isolation | Model Tier (MODERATE)          |
| ------------------ | ------------------- | --------------------------------------------------------------- | --------- | ------------------------------ |
| `lu-debugger`      | 0-N (per UAT issue) | Diagnose root cause of UAT failures                             | None      | capable (DEBUGGER_PRESET)      |
| `lu-planner`       | 0-1 (if UAT issues) | Plan fixes in gaps mode                                         | None      | balanced (ORCHESTRATOR preset) |
| `code-architect`   | 0-1 (if fix plans)  | Verify fix plans (quick review)                                 | **Cold**  | capable (DEEP_ANALYSIS preset) |
| `dx-advocate`      | 1                   | DX conventions review                                           | **Cold**  | capable (DEEP_ANALYSIS preset) |
| `code-simplifier`  | 1                   | DRY and complexity review                                       | **Cold**  | capable (DEEP_ANALYSIS preset) |
| `code-architect`   | 1                   | Architecture review                                             | **Cold**  | capable (DEEP_ANALYSIS preset) |
| `security-auditor` | 0-1 (conditional)   | Security review for network code                                | **Cold**  | capable (DEEP_ANALYSIS preset) |
| `lu-learner`       | 1                   | Extract learnings + promote research:\* to permanent namespaces | None      | fast (FAST_PROMOTED preset)    |

## v1 Mapping

**v1 behavior**: The `verify` skill ran UAT testing, spawned parallel code reviewers, diagnosed issues with `lu-debugger`, planned fixes, and captured learnings via `lu-learner`. This step is largely unchanged from v1.

**v2 changes**:

- Learning capture is richer because the executor tracked `session:applied-engrams`, showing which graduated research was actually useful
- Procedure extraction is more detailed because plans had `@research` annotations, so the learner can reference which research informed which task
- UAT tests can reference specific research findings when describing expected behavior
- Code reviewers have access to the research corpus for context-aware review (e.g., security auditor knows the heartbeat timeout rationale)

## Failure Modes

| Failure                                   | Cause                                        | Mitigation                                                                                |
| ----------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| UAT reveals fundamental flaw              | Feature does not work at all                 | lu-debugger diagnoses, lu-planner creates fix plan, re-execute and re-verify              |
| Code review finds CRITICAL issue          | Security vulnerability in WebSocket handling | Block progression, plan fix, re-execute                                                   |
| Learning capture misses important finding | Session context was cleared prematurely      | lu-learner reads SUMMARY.md files as backup; session:findings persisted before clearing   |
| UAT tests do not cover all features       | SUMMARY.md incomplete or misleading          | lu-verifier already checked goal coverage in Step 9; UAT is user-facing validation on top |
| Fix cycle exhausts budget                 | Multiple UAT issues each requiring fix plans | Cap fix iterations per complexity matrix; present partial results to user                 |

## Example

### Complete verification flow for WebSocket reconnection

**VERIFICATION.md (from Step 9 lu-verifier):**

```markdown
# Phase 08 Verification

**Phase goal:** Add WebSocket reconnection with exponential backoff
**Status:** PASSED

## Must-Haves Verified

| Truth                                       | Status | Evidence                                                                               |
| ------------------------------------------- | ------ | -------------------------------------------------------------------------------------- |
| State machine transitions correctly         | PASS   | src/ws/connection-state.ts: 6 states, transition() function, AbortController per state |
| Exponential backoff activates on disconnect | PASS   | src/ws/backoff.ts: calculateBackoff() with jitter, tested formula                      |
| Max retry causes FAILED state               | PASS   | src/ws/reconnect-manager.ts: attempt >= maxRetries triggers FAILED transition          |
| Heartbeat detects network disconnect        | PASS   | src/ws/heartbeat.ts: ping/pong with EWMA adaptive timeout                              |
| UI shows connection status                  | PASS   | src/components/connection-indicator.tsx: subscribes to state events                    |
```

**UAT result:** 4/5 PASSED initially, 1 MEDIUM issue fixed (indicator color for FAILED state).

**Code review:** DX advocate found lodash import opportunity (MEDIUM), code-architect approved state machine pattern (no issues), security-auditor approved WebSocket handling (no issues).

**Learnings captured + research promoted:**

- `pitfall:bun-ws-send-during-connecting` (default vault -- new finding from execution)
- `pattern:ws-send-queue-during-reconnect` (default vault -- new finding from execution)
- `procedure:ws-reconnection-implementation` (default vault -- new procedure)
- Promoted `research:pattern-ws-reconnection-state-machine` -> `pattern:ws-reconnection-state-machine` (default vault)
- Promoted `research:pitfall-bun-ws-close-not-on-network-disconnect` -> `pitfall:bun-ws-close-not-on-network-disconnect` (default vault)

**Session cleared.** Phase 08 complete. Ready for next phase or milestone audit.
