# Review Round 3 (Spot-Check): 01-workflow-steps

## Reviewer: Workflow Spot-Check Reviewer (Round 3)

## Date: 2026-03-23

## Iteration: 3

## Summary

Round 3 is a targeted spot-check of the 6 files modified to address Round 2 findings. All critical and important issues from R2 (NEW-WS-001, NEW-WS-002, NEW-WS-003, NEW-WS-004, NEW-WS-005, NEW-WS-006) have been correctly resolved. Several R1 carry-over issues (MIN-WS-005, MIN-WS-007) are also fixed. No new issues were introduced.

---

## Files Checked

1. `06-graduate.md`
2. `08-review-plan.md`
3. `07-plan.md`
4. `09-execute.md`
5. `10-verify.md`
6. `03-discuss.md`

---

## Per-File Results

### 06-graduate.md

Targeted fixes for NEW-WS-001 (CRITICAL) and MIN-WS-005 (MINOR carry-over from R1).

| Check | Decision | Result | Evidence |
| --- | --- | --- | --- |
| Agent names | Decision 2 | **PASS** | Section 6.3 (line 51): "dedicated `lu-research-graduator` agent (Decision 2 -- NOT `lu-learner`)". Agents Involved table (line 224): `lu-research-graduator`. No `lu-learner (adapted)` anywhere in the agents table. `lu-learner` mentioned only in context of its Step 10 role. |
| research:* prefixes | Decision 4 | **PASS** | Classification table (lines 39-47): all concepts use `research:pitfall-*`, `research:pattern-*`, `research:decision-*`. Batch operations (lines 100-132): all 7 engrams use `research:*` prefix. No `pattern:*`/`pitfall:*`/`decision:*` direct writes during graduation. |
| All graduation to repo vault | Decision 4 | **PASS** | Batch operation (line 101): `vault: "luca-framework"` (repo vault). Section 6.2 table: all entries show `luca-framework` vault. Section 6.4 introductory text (line 97): "all graduation engrams use the `research:*` namespace and go to the repo vault." |
| Scoring formula | Decision 5 | **PASS** | Section 6.3 (lines 56-57): `score = confidence * 0.40 + actionability * 0.35 + uniqueness * 0.25`, `threshold = 0.55`. Weighted sum, not product. |
| Directory paths | Decision 7 | **PASS** | All paths use `.planning/phases/{NN}-{name}/research/` format. Inputs table (lines 20-21), outputs table (line 218), handoff text (line 274). No flat `.planning/research/` paths. |
| Model tier | Decision 10 | **PASS** | Agents Involved table (line 224): `balanced (ORCHESTRATOR preset)`. Previously was `fast (FAST_PROMOTED preset)`. Matches Decision 10. |
| Link count consistency | MIN-WS-005 | **PASS** | Section 6.5 now shows 5 `muninn_link` calls (lines 140-168). Section 6.6 (line 177) says "5 links created". Section 6.7 (lines 197-198) says "Links: 5 (state machine -> timer cleanup, backoff, pitfall, close code map, heartbeat config)". All three locations are consistent. |
| Deferred promotion documented | Decision 4 | **PASS** | Lines 7, 14, 37, 97, 177, 201-203, 234, 272 all consistently describe the deferred promotion model (research:* in repo vault now, promotion to permanent namespaces in Step 10). |

### 08-review-plan.md

Targeted fixes for NEW-WS-002 (IMPORTANT) and NEW-WS-005 (MINOR).

| Check | Decision | Result | Evidence |
| --- | --- | --- | --- |
| Agent names | Decision 2 | **PASS** | Section 8.2 (line 38): "`code-architect`, `dx-advocate`, `security-auditor` per Decision 2". Agent prompts (lines 73, 99, 125): `subagent_type` values are `code-architect`, `dx-advocate`, `security-auditor`. Agents Involved table (lines 245-247): all three listed individually. No `lu-plan-checker` in v2 context; `lu-plan-checker` appears only in v1 Mapping section (line 252) as historical reference. |
| No 7-dimension/numeric scoring | Decision 3 | **PASS** | No "Score each dimension 1-10" text. No numeric score thresholds (">= 7/10", ">= 8/10"). Section 8.2 (lines 38-39): "gap-severity model. Each reviewer uses the DEEP_ANALYSIS preset." Output format (lines 67-70): `G-ARCH-001: [severity: BLOCKING]` with "No numeric scores." Section 8.4 (lines 159-163): convergence is "0 BLOCKING findings", not score thresholds. |
| Gap ID format | Decision 8 | **PASS** | Section 8.2 output formats (lines 68-69): `G-ARCH-001`, `G-DX-001`, `G-SEC-001`. Section 8.3 (lines 137, 147): `G-ARCH-001`, `G-DX-001`. No `GAP-C-`/`GAP-I-` format anywhere. |
| 3 reviewers at all complexity levels | Decision 13 | **PASS** | Section 8.1 table (lines 27-32): all 5 complexity levels show "3" reviewers. Line 34: "Complexity affects model tier and iteration budget, not reviewer count." |
| Iteration budgets | Decision 14 | **PASS** | Section 8.1 table: TRIVIAL=1, SIMPLE=1, MODERATE=2, COMPLEX=2, CRITICAL=3. These match Decision 14 exactly. Previously had COMPLEX=3 and CRITICAL=4. |
| Directory paths | Decision 7 | **PASS** | Inputs table (line 14): `.planning/phases/{NN}-{name}/research/*.md`. Outputs table (line 237): `.planning/phases/{NN}-{name}/*-PLAN.md`. No flat `.planning/research/` paths. |
| Convergence model | Decision 3 | **PASS** | Section 8.1 (line 24): "gap-severity model from `05-review-loops/convergence-criteria.md`". Section 8.4 (line 159): references canonical convergence source. Findings are BLOCKING/ADVISORY, not numeric. Section 8.4 uses the plan-review-specific terms (BLOCKING/ADVISORY rather than CRITICAL/IMPORTANT/MINOR from research review), which is appropriate differentiation. |
| Reference, don't redefine | Decision 19 | **PASS** | Sections 8.1, 8.4, and the Purpose paragraph all reference `05-review-loops/convergence-criteria.md` and `05-review-loops/plan-review-protocol.md` as canonical sources instead of redefining convergence criteria inline. |

### 07-plan.md

Targeted fixes for NEW-WS-004 (IMPORTANT).

| Check | Decision | Result | Evidence |
| --- | --- | --- | --- |
| Directory paths | Decision 7 | **PASS** | Section 7.2 (line 68): `.planning/phases/${PHASE_DIR}/research/SUMMARY.md` (phase-scoped). Section 7.3 (line 103): `@research(.planning/phases/{NN}-{name}/research/08-state-machine.md#state-transitions)`. Plan example (lines 169, 186, 202-203): all `@research` annotations use `.planning/phases/{NN}-websocket-reconnection/research/` paths. No `.planning/research/` flat paths. No `deep/` subdirectory. |
| Research filenames | Decision 12 | **PASS** | Annotations reference numbered files: `08-state-machine.md`, `07-timer-safety.md`, `01-architecture-patterns.md`, `02-implementation-approaches.md`. No facet-named files like `state-machine-deep.md`. |
| Agent names | Decision 2 | **PASS** | Only `lu-planner` used (appropriate for this step). No inappropriate agent references. |
| Step numbering | Decision 1 | **PASS** | Title is "Step 7: Plan". Consistent with canonical numbering. |
| Engram references | Decision 4 | **PASS** | Section 7.3 (lines 88-95): all engram references use `research:*` prefix (`research:pattern-*`, `research:pitfall-*`, `research:decision-*`). No direct `pattern:*`/`pitfall:*` references in graduated engram context. |

### 09-execute.md

Targeted fixes for NEW-WS-003 (IMPORTANT) and NEW-WS-004 (IMPORTANT).

| Check | Decision | Result | Evidence |
| --- | --- | --- | --- |
| Dual lu-learner documented | NEW-WS-003 | **PASS** | Section 9.11 (lines 272-273): "**Note:** This is the first of two `lu-learner` invocations. This invocation captures implementation findings and execution-time discoveries. The second invocation in Step 10 (section 10.6) captures the full learning loop including UAT results, code review findings, and promotes high-value `research:*` engrams to permanent `pattern:*`/`pitfall:*`/`decision:*` namespaces (Decision 4)." The note clearly distinguishes the two invocations by scope and purpose. |
| lu-learner scope constraint | NEW-WS-003 | **PASS** | Section 9.11 prompt (lines 285-287): "Do NOT promote research:* engrams to permanent namespaces yet -- that happens in Step 10 after UAT." This prevents the first invocation from preempting Step 10's promotion role. |
| Directory paths | Decision 7 | **PASS** | All `@research` annotations (lines 116-117, 122-123, 343-344) use `.planning/phases/{NN}-websocket-reconnection/research/` paths. No `.planning/research/` flat paths. No `deep/` subdirectory. Filenames are numbered: `08-state-machine.md`, `07-timer-safety.md`. |
| Research filenames | Decision 12 | **PASS** | References use `08-state-machine.md` and `07-timer-safety.md` (numbered). No `state-machine-deep.md` or `timer-safety-deep.md`. |
| Agent names | Decision 2 | **PASS** | `lu-executor`, `lu-verifier`, `lu-learner` -- all appropriate for this step. No inappropriate agent references. |
| Engram references | Decision 4 | **PASS** | Section 9.4 (lines 118-119, 125-127): engram references use `research:*` prefix. Section 9.6 (line 175): `session:applied-engrams` tracks application of both `pattern:*` and `research:*` concepts. The `pattern:` references in 9.6 are in the context of listing engram concepts that were applied (not writing new engrams), though this inconsistency is cosmetic since the actual graduated concepts are `research:pattern-*` etc. See note below. |
| Step numbering | Decision 1 | **PASS** | Title is "Step 9: Execute". Consistent with canonical numbering. |

**Note on 09-execute.md section 9.6 (line 175):** The `session:applied-engrams` content references `pattern:ws-reconnection-state-machine` and `pattern:abort-controller-timer-cleanup` and `decision:bun-ws-close-code-reconnection-map` without the `research:` prefix. Since Step 6 graduated these as `research:pattern-*` and `research:decision-*`, the applied-engrams tracking should reference the actual concept names (`research:pattern-ws-reconnection-state-machine` etc.). This is a minor cosmetic inconsistency -- the engram concepts exist under `research:*` prefix after graduation but are referenced without it. This is not blocking but could confuse an implementer.

### 10-verify.md

Targeted fixes for NEW-WS-003 (IMPORTANT) and MIN-WS-007 (MINOR carry-over from R1).

| Check | Decision | Result | Evidence |
| --- | --- | --- | --- |
| Dual lu-learner documented | NEW-WS-003 | **PASS** | Section 10.6 (line 178): "**Note:** This is the second `lu-learner` invocation (the first was in Step 9, section 9.11, capturing post-execution implementation findings)." Clearly distinguishes the two invocations. |
| Research promotion in Step 10 | Decision 4 | **PASS** | Section 10.6 (lines 181-183): "Promote high-value `research:*` engrams from the repo vault to permanent `pattern:*`/`pitfall:*`/`decision:*` in the default vault (Decision 4 -- deferred promotion)." Promotion instructions (lines 210-214) specify the mapping: `research:pattern-* -> pattern:*`, `research:pitfall-* -> pitfall:*`, `research:decision-* -> decision:*`. Only applied engrams are promoted (line 214). |
| procedure:* vault routing | MIN-WS-007 | **PASS** | Section 10.6 example (line 241): explicit comment "# Default vault (procedure:* is cross-cutting per vault routing rules)". Line 243: `vault: "default"`. Outputs table (line 289): `MuninnDB default vault (procedure:*)`. Previously routed to repo vault. Now matches vault routing rules. |
| Agent names | Decision 2 | **PASS** | `lu-debugger`, `lu-planner`, `code-architect`, `dx-advocate`, `code-simplifier`, `security-auditor`, `lu-learner` -- all appropriate for this step. No inappropriate agent references. |
| Directory paths | Decision 7 | **PASS** | Inputs table (line 19): `.planning/phases/{NN}-{name}/research/*.md`. Outputs table (line 283): `.planning/phases/{NN}-{name}/{NN}-UAT.md`. No flat `.planning/research/` paths. |
| Step numbering | Decision 1 | **PASS** | Title is "Step 10: Verify + UAT". Consistent with canonical numbering. |
| No pattern:*/pitfall:* during graduation | Decision 4 | **PASS** | Step 10 is the correct place for promotion. Example (lines 228-246) writes `pitfall:*`, `pattern:*`, `procedure:*` -- but these are new findings from execution and promotions from `research:*`, not graduation writes. Lines 353-358 show the promotion path clearly. |

### 03-discuss.md

Targeted fix for NEW-WS-006 (MINOR).

| Check | Decision | Result | Evidence |
| --- | --- | --- | --- |
| Directory paths | Decision 7 | **PASS** | Auto-mode research reference (line 105): `.planning/phases/{NN}-{name}/research/02-implementation-approaches.md`. Inputs table (line 13): `.planning/phases/{NN}-{name}/research/*.md`. Section 3.2 (line 35): `"$RESEARCH_DIR"` constructed from `${PHASE_DIR}`. Pre-mortem prompt (line 235): `.planning/phases/{NN}-{name}/research/SUMMARY.md`. No flat `.planning/research/` paths. |
| Research filenames | Decision 12 | **PASS** | Reference uses `02-implementation-approaches.md` (numbered). Previously was `bun-websocket-api.md` (facet-named). |
| Agent names | Decision 2 | **PASS** | `lu-discuss-researcher` and `lu-premortem` -- appropriate for this step. No inappropriate agent references. |
| Step numbering | Decision 1 | **PASS** | Title is "Step 3: Discuss + Pre-mortem". Consistent with canonical numbering. |

---

## R2 Issue Resolution Tracker

| R2 Issue | Severity | Status | File(s) Fixed |
| --- | --- | --- | --- |
| NEW-WS-001 | CRITICAL | **RESOLVED** | `06-graduate.md` -- all batch operations now use `research:*` prefix in repo vault, agent is `lu-research-graduator`, model tier is ORCHESTRATOR |
| NEW-WS-002 | IMPORTANT | **RESOLVED** | `08-review-plan.md` -- gap-severity model (BLOCKING/ADVISORY), 3 reviewers at all levels, `code-architect`/`dx-advocate`/`security-auditor` agents, iteration budgets match Decision 14 |
| NEW-WS-003 | IMPORTANT | **RESOLVED** | `09-execute.md` (section 9.11) and `10-verify.md` (section 10.6) -- both document dual invocation with distinct scope |
| NEW-WS-004 | IMPORTANT | **RESOLVED** | `07-plan.md` and `09-execute.md` -- all research paths use phase-scoped layout, numbered filenames |
| NEW-WS-005 | MINOR | **RESOLVED** | `08-review-plan.md` -- iteration budgets now TRIVIAL=1, SIMPLE=1, MODERATE=2, COMPLEX=2, CRITICAL=3 |
| NEW-WS-006 | MINOR | **RESOLVED** | `03-discuss.md` -- stale path replaced with phase-scoped path |
| MIN-WS-005 (R1) | MINOR | **RESOLVED** | `06-graduate.md` -- now shows 5 links in code, claims 5 in text (consistent) |
| MIN-WS-007 (R1) | MINOR | **RESOLVED** | `10-verify.md` -- `procedure:*` now routes to default vault with explicit comment |

---

## Remaining Issues

### REM-R3-001 (MINOR): session:applied-engrams uses non-prefixed concept names

**Location:** `09-execute.md` section 9.6 (line 175)

The `session:applied-engrams` content references engrams as `pattern:ws-reconnection-state-machine`, `pattern:abort-controller-timer-cleanup`, and `decision:bun-ws-close-code-reconnection-map`. However, after Step 6 graduation these engrams exist under `research:pattern-*` and `research:decision-*` names in the repo vault. The applied-engrams tracking should reference the actual `research:*`-prefixed concept names to match what was graduated. This is a cosmetic inconsistency -- an implementer would need to know that the concepts to recall are `research:pattern-ws-reconnection-state-machine`, not `pattern:ws-reconnection-state-machine`.

**Severity:** MINOR -- does not affect the correctness of the overall design, but could confuse implementers about which concept names to use in recall operations.

### REM-R3-002 (MINOR, carry-over): session:info concept prefix collision

**Location:** `07-plan.md` section 7.1 (line 55)

Carry-over from R1 MIN-WS-002. The `session:info` concept is generic and could collide with other session info writes. Not blocking.

### REM-R3-003 (MINOR, carry-over): Appetite enforcement not documented

**Location:** `09-execute.md`

Carry-over from R1 MIN-WS-006. Step 9 lists appetite in inputs and passes it to executor prompts but does not document how the appetite ceiling is enforced (budget check, context monitoring, early termination). Not blocking -- appetite can be treated as advisory.

---

## Verdict: APPROVED

All critical and important issues from Round 2 have been correctly resolved. The three remaining issues are all MINOR (one new cosmetic inconsistency, two carry-overs from Round 1 that were classified as nice-to-have). The fixes are internally consistent, align with the CANONICAL-DECISIONS.md authority document, and do not introduce new contradictions. The section is ready for implementation.
