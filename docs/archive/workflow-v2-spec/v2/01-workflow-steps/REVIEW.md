# Review: 01-workflow-steps

## Reviewer: Workflow Completeness Reviewer (Cold Isolation)

## Date: 2026-03-22

## Iteration: 1

## Summary Assessment

The 10-step workflow documentation is impressively thorough, with detailed process descriptions, concrete MuninnDB operations, well-structured running examples, and explicit failure mode tables for every step. However, there are several inconsistencies between the step docs and the orchestration-flow.md cross-reference, a missing step (Deep Expand is documented but has no review loop path back from Step 5), and a few handoff gaps where data produced by one step is not explicitly consumed by the next. The documentation is close to implementation-ready but has roughly 5 issues that would cause an implementer to guess or make wrong assumptions.

## Critical Findings (blocks implementation)

- **CRIT-WS-001**: `01-workflow-steps/README.md` vs `04-agent-orchestration/orchestration-flow.md` -- **Step numbering mismatch**. The step docs number the steps 1-10 as: Ideate, Research, Discuss, Deep Expand, Review Research, Graduate, Plan, Review Plan, Execute, Verify. But the orchestration flow document numbers them differently: Step 1 = Parse & Route (maps to Ideate+Router), Step 2 = Complexity Classification (part of Ideate), Step 3 = Research, Step 4 = Discuss, Step 5 = Review Research, Step 6 = Graduate, Step 7 = Plan, Step 8 = Review Plan, Step 9 = Execute, Step 10 = Verify. Critically, **Deep Expand (Step 4 in the workflow docs) is completely absent from the orchestration flow**. The orchestration flow jumps directly from Discuss (its Step 4) to Review Research (its Step 5) with no specialist deep-dive step in between. An implementer building the orchestrator from orchestration-flow.md would produce a pipeline missing an entire step. -- **Resolution**: Add Deep Expand to the orchestration flow diagram between Discuss and Review Research, or explicitly document that Deep Expand is folded into the research review revision cycle.

- **CRIT-WS-002**: `05-review-research.md` -- **Revision loop targets wrong step**. When Step 5 review finds issues requiring revision, section 5.5 spawns `lu-phase-researcher` agents to fix specific issues in the research files. But some revision requests (e.g., "Add CONNECTING timeout transition" for the state-machine-deep.md) target **deep expansion files** from Step 4. The document does not specify: if the deep expansion file needs revision, does the revision go back to Step 4 (spawn a new specialist)? Or does Step 5 simply revise the file in-place? The revision cycle needs to distinguish between revisions to Step 2 output vs Step 4 output, since they have different authoring contexts and constraints. -- **Resolution**: Clarify in section 5.5 whether revisions to deep expansion files follow the same path as revisions to initial research files, or whether Step 4 is re-entered. Document the decision.

- **CRIT-WS-003**: `04-agent-orchestration/orchestration-flow.md` -- **Agent names inconsistent with step docs**. The orchestration flow introduces agent names that do not appear in any step document: `lu-architecture-researcher`, `lu-implementation-researcher`, `lu-ecosystem-researcher`, `lu-risk-researcher` (Step 3), `lu-completeness-reviewer`, `lu-accuracy-reviewer`, `lu-actionability-reviewer` (Step 5), `lu-research-graduator` (Step 6), `performance-auditor` (Step 10). Meanwhile, the step docs use `lu-phase-researcher` (for all research agents in Steps 2 and 4), `lu-verifier` (for research reviewers in Step 5), `lu-learner` (for graduation in Step 6). An implementer reading both documents would not know which agent names to use. -- **Resolution**: Decide on canonical agent names and align both documents. The step docs appear to reuse existing v1 agents (`lu-phase-researcher`, `lu-verifier`, `lu-learner`) while the orchestration flow introduces new specialized agents. This is a fundamental design decision that must be resolved before implementation.

## Important Findings (should fix)

- **IMP-WS-001**: `01-ideate.md` -- **DEEP_EXPAND skip path not documented for TRIVIAL**. Step 4 (Deep Expand) documents that TRIVIAL complexity skips the step entirely ("TRIVIAL: 0 -- skip Step 4"). But Step 1's failure mode table says TRIVIAL routes to "direct execution (skip steps 2-8)". These are inconsistent -- does TRIVIAL skip steps 2-8 entirely (going from Ideate straight to Execute), or does it run Research with 1 facet and skip only Deep Expand? The README table shows TRIVIAL still goes through Research, Discuss, etc. -- **Resolution**: Clarify the TRIVIAL fast-path in the README and Step 1. Either document the exact skip list for TRIVIAL or remove the "skip steps 2-8" claim from Step 1's failure mode table.

- **IMP-WS-002**: `02-research.md` -- **Research file naming convention conflicts with orchestration flow**. Step 2 uses facet-name-based file names: `.planning/research/bun-websocket-api.md`, `.planning/research/reconnection-patterns.md`. The orchestration flow uses numbered prefixes: `.planning/research/01-architecture-patterns.md`, `.planning/research/02-implementation-approaches.md`. The README's file conventions section says `.planning/research/{facet-name}.md` (no number prefix). -- **Resolution**: Settle on one convention. The facet-name approach from Step 2 is more descriptive and should be canonical.

- **IMP-WS-003**: `05-review-research.md` and `08-review-plan.md` -- **Review files not specified in outputs**. The orchestration flow says reviewers write files to `.planning/research/reviews/*-review.md`, but the step docs say review scores are "In-memory (logged to session)". The step docs do mention a MuninnDB `session:research-review` convergence record, but there is no file-based artifact for review results. An implementer needs to know: are review results persisted to files (inspectable, diffable) or only to memory? -- **Resolution**: Decide whether review results are file-based (consistent with the "file-based communication" principle in the orchestration flow) or in-memory. If file-based, add the file path convention. If in-memory, update the orchestration flow to remove the file references.

- **IMP-WS-004**: `06-graduate.md` -- **GRADUATION-REPORT.md artifact mentioned in orchestration flow but absent from step docs**. The orchestration flow says `lu-research-graduator` writes `.planning/research/GRADUATION-REPORT.md`. The Step 6 document has no mention of this file. The step's outputs table lists only MuninnDB engrams and the session:graduation record. -- **Resolution**: Add GRADUATION-REPORT.md to Step 6 outputs, or remove it from the orchestration flow.

- **IMP-WS-005**: `03-discuss.md` -- **Orchestration flow step numbering places Discuss at Step 4 (after Deep Expand would have been Step 4 in workflow docs)**. But more importantly, the orchestration flow places Discussion BEFORE Deep Expand: its sequence is Research -> Discuss -> Review Research. But the workflow step docs place Discussion BEFORE Deep Expand too (Step 3 Discuss, Step 4 Deep Expand), so the sequencing is actually correct. However, the orchestration flow completely omits Deep Expand between Discuss and Review Research, which means the data flow is broken -- Deep Expand depends on CONTEXT.md and PREMORTEM.md from Discuss (Step 3), which is correct, but the orchestration flow shows no such step. -- **Resolution**: This is a restatement of CRIT-WS-001. Deep Expand must be added to the orchestration flow.

- **IMP-WS-006**: `09-execute.md` -- **lu-verifier and lu-learner overlap between Steps 9 and 10**. Step 9 (sections 9.10 and 9.11) spawns both `lu-verifier` and `lu-learner` at the end of execution. Step 10 then begins with "Goal-backward verification (already completed in Step 9)". This creates ambiguity: is Step 10 a separate step or just a continuation of Step 9? The outputs table for Step 9 includes VERIFICATION.md, and Step 10's process says "Its VERIFICATION.md output is available." This means Step 9 and Step 10 share responsibility for verification, making the step boundary unclear. -- **Resolution**: Either move lu-verifier and lu-learner entirely to Step 10 (cleaner boundary), or rename Step 10 to "UAT + Code Review + Learning" and make clear that goal verification happens in Step 9 while UAT happens in Step 10.

- **IMP-WS-007**: `08-review-plan.md` -- **Plan review uses `lu-plan-checker` but orchestration flow also uses `lu-plan-checker`**. This is consistent. However, Step 5 uses `lu-verifier` for research review, while the orchestration flow uses specialized reviewer agents (`lu-completeness-reviewer`, etc.). If Step 5 genuinely uses `lu-verifier`, this agent is overloaded: it does research review in Step 5, goal-backward verification in Step 9, and code verification in Step 10. A single agent definition serving three very different roles will be hard to maintain and prompt correctly. -- **Resolution**: Consider whether Step 5's research reviewers should be a distinct agent type (as the orchestration flow implies) rather than reusing `lu-verifier`.

## Minor Findings (nice to have)

- **MIN-WS-001**: `02-research.md` -- **Tool strategy references Context7** which is not defined anywhere in the workflow docs. "Context7" appears to be an MCP tool or library documentation service, but no explanation is provided. An implementer would not know how to implement "Context7 first" without additional context. -- **Resolution**: Add a brief footnote or link explaining what Context7 is.

- **MIN-WS-002**: `07-plan.md` -- **`session:info` concept prefix** is used for planning session metadata but is not in the vault routing table in the project rules. The vault-routing rule lists `session:*` as repo vault, so this routes correctly, but the concept `session:info` seems generic and could collide with other session info writes. -- **Resolution**: Consider a more specific concept like `session:plan-info` or document that `session:info` is overwritten per step.

- **MIN-WS-003**: `README.md` -- **Overview table MuninnDB column has formatting issues**. Step 1's MuninnDB interaction column contains a pipe character that breaks the table rendering in some Markdown renderers: `| 1 | [Ideate](01-ideate.md) | User (manual) | None | User's rough idea | Structured intent in STATE.md | \`muninn_recall\` (prior art) | New (was implicit) |` -- this appears to have one too many columns vs the header. -- **Resolution**: Verify the table renders correctly. The header has 8 columns but several rows appear to have column misalignment.

- **MIN-WS-004**: `01-ideate.md` -- **Structured intent example has indentation issue**. The `**Prior art:**` and `**Appetite:**` lines appear to be indented under `OUT:` when they should be top-level fields:

  ```
  - OUT: Server-side WebSocket changes, new WS message types, ws npm package
    **Prior art:** decision:ws-native (use Bun built-in WebSocket)
    **Appetite:** TBD (set in Step 3)
  ```

  -- **Resolution**: Fix the markdown indentation so Prior art and Appetite are at the same level as IN/OUT.

- **MIN-WS-005**: `06-graduate.md` -- **Link count discrepancy**. Section 6.5 creates 3 links (all from `pattern:ws-reconnection-state-machine`). Section 6.6 says "5 links created". Section 6.7 says "Links: 5 (state machine -> timer cleanup, backoff, pitfall)". But only 3 `muninn_link` calls are shown. -- **Resolution**: Either show all 5 link operations or change the text to say 3.

- **MIN-WS-006**: `09-execute.md` -- **Appetite field referenced in input table but never checked during execution**. Step 9 lists "Appetite" as an input (token budget ceiling) but the execution process never describes how the appetite ceiling is enforced. No budget check, no context percentage monitoring, no early termination on budget exhaustion. -- **Resolution**: Either add a section on appetite enforcement during execution or note that appetite is advisory only at this step.

- **MIN-WS-007**: `10-verify.md` -- **`procedure:ws-reconnection-implementation` routed to repo vault**. Section 10.6 stores this procedure in `luca-framework` vault, but the vault routing table says `procedure:*` should go to the default vault. The example correctly explains the procedure is project-specific, but the concept prefix `procedure:*` maps to default vault per the routing rules. -- **Resolution**: Either route to default vault (per rules) or document this as an exception with rationale.

## Handoff Gap Analysis

### Step 1 -> Step 2: CLEAN

Structured intent (STATE.md), cognitive report (in-memory), and complexity classification are all explicitly listed as Step 2 inputs. The prior art decision (`decision:ws-native`) is correctly used to constrain research scope.

### Step 2 -> Step 3: CLEAN

Research files and SUMMARY.md are explicitly listed as Step 3 inputs. The handoff paragraph at the end of Step 2 confirms this.

### Step 3 -> Step 4: CLEAN

CONTEXT.md and PREMORTEM.md from Step 3 are explicitly listed as Step 4 inputs. Deep Expand correctly consumes locked decisions and risk scenarios.

### Step 4 -> Step 5: CLEAN

Deep expansion files are explicitly listed in Step 5 inputs alongside initial research. The complete corpus (initial + deep) is reviewed.

### Step 5 -> Step 6: GAP

Step 5 outputs include "Revised research files" and a "Convergence record" in MuninnDB. Step 6 inputs include "Reviewed research corpus" and "Review convergence record". However, **Step 5 does not produce a structured convergence record with explicit "APPROVED" status**. The Step 5 outputs table says the convergence record goes to MuninnDB `session:research-review`, but the content of that record is not specified. Step 6 would need to verify the research is actually approved before graduating. The gap: what does Step 6 check to confirm Step 5 actually converged? Is it just the orchestrator's in-memory state, or should Step 6 read the MuninnDB record?

### Step 6 -> Step 7: MINOR GAP

Step 6 outputs MuninnDB engrams. Step 7 inputs include "Graduated engrams (MuninnDB recalled)". The handoff works via MuninnDB recall, but **the specific recall queries in Step 7.1 search by context string, not by concept prefix**. If the recall query "WebSocket reconnection patterns decisions pitfalls" does not match the engram content well enough, some graduated engrams might be missed. The engram concepts use machine-readable prefixes like `pattern:ws-reconnection-state-machine`, but the recall query is natural language. This could be fragile.

### Step 7 -> Step 8: CLEAN

PLAN.md files from Step 7 are the primary input to Step 8. Research corpus is available for cross-reference.

### Step 8 -> Step 9: CLEAN

Approved plans with warnings stored in MuninnDB `session:plan-review-warnings` are explicitly consumed by Step 9.

### Step 9 -> Step 10: MINOR GAP

Step 9 spawns both `lu-verifier` and `lu-learner` (sections 9.10, 9.11). Step 10 then says verification was "already completed in Step 9". This overlapping boundary means the handoff is implicit -- Step 10 depends on artifacts already written during Step 9. The gap: if the orchestrator implements Steps 9 and 10 as separate skill invocations, the `lu-learner` from Step 9 would have already run, but Step 10 also runs `lu-learner` for "Final learning capture". **Are there two lu-learner invocations?** Step 9.11 captures execution learnings. Step 10.6 captures post-UAT learnings. This is probably intentional but should be explicitly stated.

## Running Example Consistency Check

The WebSocket reconnection running example flows coherently across all 10 steps with minor discontinuities:

### Consistent Elements

- The raw intent ("WebSocket reconnection with exponential backoff") is preserved from Step 1 through Step 10
- The `decision:ws-native` constraint from MuninnDB recall in Step 1 correctly constrains research in Step 2 (no ws/socket.io investigated)
- The 4 research facets from Step 2 (bun-websocket-api, reconnection-patterns, error-handling, testing-strategy) are consistently referenced
- PREMORTEM scenarios (heartbeat false positives, timer leaks, thundering herd) flow correctly from Step 3 through Step 4 deep-dives
- The state machine (6 states, 14 transitions) is consistent from research through graduation through planning through execution
- Close code mapping (reconnectable vs non-reconnectable) is consistent across all references
- Graduated engrams are correctly recalled and applied in Step 9

### Discontinuities

1. **Facet naming shift**: Step 2 names 4 facets (bun-websocket-api, reconnection-patterns, error-handling, testing-strategy). Step 4 names 4 deep-dive topics (bun-ws-close-codes, heartbeat-implementation, timer-safety, state-machine). The deep-dive topics do not map 1:1 to the initial facets -- they are re-derived from CONTEXT.md and PREMORTEM.md. This is correct behavior but could confuse an implementer expecting a direct mapping.

2. **Plan numbering**: Step 7 uses `{NN}-01-PLAN.md`, `{NN}-02-PLAN.md`, `{NN}-03-PLAN.md`. Step 8 refers to `08-01-PLAN.md`, `08-02-PLAN.md`, `08-03-PLAN.md` (hardcoding phase 08). Step 7's example says "Phase {N}" while Step 8 says "Phase 08". This is fine for the running example but the inconsistent use of `{NN}` vs `08` could confuse copy-paste implementers.

3. **Testing strategy facet disappears**: Step 2 researches a `testing-strategy` facet. Step 4 does not deep-dive it. Step 5's review example does reference `testing-strategy.md` (Bun.sleep claim verification). But no plan task in Step 7 addresses testing. Step 9's SUMMARY.md says "No runtime tests (testing deferred to Plan 03)". This is a natural outcome (testing research informed the plan that deferred tests) but the research-to-plan trace is not as clean for this facet.

4. **Heartbeat module appears unplanned in Step 7 example**: Step 7 shows Plan 02 for "Heartbeat mechanism" but the full plan content is not shown (only Plan 01 is detailed). The heartbeat deep-dive from Step 4 informs Plan 02, but without seeing Plan 02's tasks, the handoff from research to plan is not traceable for the heartbeat feature.

5. **Send queue deviation**: Step 9's SUMMARY.md mentions "Added send queue for messages attempted during RECONNECTING state (not in plan, but research:deep/state-machine-deep.md#edge-cases suggested it)". This deviation is well-documented but the research section referenced (`#edge-cases`) was never shown in the Step 4 deep-dive example. The running example implies research content that was not shown.

## Verdict: NEEDS REVISION

Three critical findings must be addressed before this documentation can serve as an implementation specification:

1. Deep Expand must be added to the orchestration flow (CRIT-WS-001)
2. The revision loop target in Step 5 needs clarification for deep expansion files (CRIT-WS-002)
3. Agent names must be aligned between step docs and orchestration flow (CRIT-WS-003)

The 7 important findings should be addressed to prevent implementer confusion, particularly the TRIVIAL skip-path ambiguity (IMP-WS-001), the file naming convention conflict (IMP-WS-002), and the Step 9/10 boundary overlap (IMP-WS-006). The minor findings are polish items that improve quality but do not block implementation.
