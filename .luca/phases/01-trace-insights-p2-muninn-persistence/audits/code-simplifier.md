PERSPECTIVE: simplification
VERDICT: REQUEST_CHANGES
FINDINGS:
- [MUST-FIX] `seenTraceIds` is declared with skip semantics but never wired into the execution path. F3 (index.ts:249) states "The next run skips these already-analyzed boundary traces", yet the `--since auto` resolution paragraph (index.ts:65) resolves only the window start, Stage A2 (index.ts:83-97) filters only by `gt(start_time, ...)`, and Stage B (index.ts:125-134) builds the pool with no exclusion step. An executor following the stages in order re-fetches and can re-deep-read every boundary trace each run; the field is dead weight whose documented behavior never happens — an internal contradiction between F3's claim and the procedure.
  File: packages/luca-tools/src/artifacts/skills/trace-insights/index.ts:249
  Suggestion: Add one sentence to the `--since auto` paragraph (line 65) or Stage A3: "When resolving from the cursor, exclude root runs whose trace id appears in the cursor's `seenTraceIds`." Alternatively, drop `seenTraceIds` from the cursor schema entirely and rely on the (already documented) fingerprint/evolve dedup to absorb overlap repeats — either fix removes the contradiction.
  Cross-phase: false
- [MUST-FIX] F1 dedup else-branch is mislabeled, leaving the matched-but-non-FLAT case with contradictory guidance. index.ts:223 evolves only on "concept matches AND it is a FLAT engram"; index.ts:224 labels the only other branch "Otherwise (no match): create". A recall that returns a matching concept on a non-FLAT (tree) engram satisfies neither description: it cannot take the evolve branch, and the create branch's parenthetical explicitly denies a match exists. An executor hitting this case must improvise between skip, create-duplicate, and unsafe-evolve.
  File: packages/luca-tools/src/artifacts/skills/trace-insights/index.ts:224
  Suggestion: Relabel the else branch: "Otherwise (no concept match, or the matching engram is not FLAT): create it via `muninn_remember` ..." — making create-a-parallel-memory the explicit, safe fallback (consistent with the best-effort caveat at line 226).
  Cross-phase: false
- [SHOULD-FIX] Precondition gh check vs Failure Modes row pull in opposite directions. index.ts:50 says "Also verify `gh auth status` succeeds when issue logging will run" immediately after an abort instruction (for missing env vars), priming abort-on-failure; the Failure Modes row (index.ts:278) instead says complete Stages A–D and render would-be issues. Not a strict contradiction, but a drift-prone ambiguity at the exact decision point.
  File: packages/luca-tools/src/artifacts/skills/trace-insights/index.ts:50
  Suggestion: Append to line 50: "(a gh auth failure is non-fatal — see Failure Modes: complete A–D and render Stage E as would-be issues)."
  Cross-phase: false
- [SHOULD-FIX] Garbled Failure Modes sentence readable as an instruction. index.ts:273 "Abort, list available project names is NOT possible read-safely — report the name tried" can be misparsed as "Abort, [then] list available project names". 
  File: packages/luca-tools/src/artifacts/skills/trace-insights/index.ts:273
  Suggestion: Rewrite: "Abort and report the project name tried (enumerating available project names is out of scope)."
  Cross-phase: false
- [SHOULD-FIX] The 1-hour trailing overlap is restated three times (index.ts:65, :248, :249) and the dry-run cursor-READ exemption twice (index.ts:65, :204). Consistent today, but a future change to the overlap value or the dry-run rule must be made in every copy or the body self-contradicts.
  File: packages/luca-tools/src/artifacts/skills/trace-insights/index.ts:65
  Suggestion: Define the overlap once in F3 and have line 65 reference it ("minus the trailing overlap defined in Stage F3"); keep the dry-run exemption authoritative in one place (the Stage F header) and reference it from the flag table/line 65.
  Cross-phase: false
- [NOTE] Notes claim "Its only persistent state — the analysis cursor — lives in MuninnDB" (index.ts:285); F1 insight memories and F2 digests are also persistent MuninnDB writes. The "state" framing is defensible but imprecise.
- [NOTE] Test file mixes `it` and `test` (index.test.ts:10, :107) — one alias would do.
- [NOTE] Checked explicitly for the brief's "same literal asserted twice" concern: no exact-duplicate `toContain` literals across the test file (closest pairs — `mcp__muninn__muninn_remember` at :18 vs `mcp__muninn__muninn_recall` at :152, and `--label trace-insights` at :135 vs `metric:trace-insights-cursor` at :148 — are distinct strings). No finding.
- [NOTE] Stage F was cross-checked against the scope guard and flag table for contradictions: routing-table concepts (index.ts:208-213) match the guard's permitted surface (index.ts:29); the forbidden list (index.ts:33) matches F1's "muninn_consolidate is forbidden here" (index.ts:226); dry-run semantics agree across index.ts:29, :59, :65, :204. No contradiction found on those axes — the two MUST-FIX items above are the only internal inconsistencies detected.

CONSOLIDATED:
  MUST_FIX_COUNT: 2
  SHOULD_FIX_COUNT: 3
  NOTE_COUNT: 4
  CROSS_PHASE_COUNT: 0
