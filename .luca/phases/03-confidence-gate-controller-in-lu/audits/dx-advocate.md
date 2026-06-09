# Audit — dx-advocate

## Verdict
APPROVE

## Summary
The confidence-gate instructions are largely clear and internally consistent; three genuine DX gaps were found (ambiguous `ask` surfacing mechanism, silent failure path when gate output is empty, and a broken table row in the skill that buries the `finalize` row outside the table), with additional minor inconsistencies between the skill and command bodies.

## Findings

- **[MUST-FIX]** The `ask` entry handling says "surface ONE targeted question to the user" but never specifies HOW — no tool name, no format template, no instruction to wait for a typed reply vs. use `AskUserQuestion`. An LLM executing these instructions may output prose to the conversation and race ahead without waiting, or may try to use the wrong tool entirely. The companion command (`lu.ts` line 76) is identically underspecified.
  - File: `packages/luca-tools/src/artifacts/skills/lu/index.ts:109`
  - Suggestion: Add a concrete instruction: "Use the `AskUserQuestion` tool (or equivalent user-facing pause) with the question: `[<decision>] Which alternative should I use? Options: <alternatives-as-list>`. Do not continue until the user replies." Mirror the same language in `lu.ts:76`.

- **[MUST-FIX]** The `finalize` pipeline-table row appears AFTER the "Executor prompt injection" subsection (skill line 131), outside the Markdown table that ended at line 91. The injected row is plain text that won't render as a table row. An LLM reading the step table will miss the `finalize` step entirely during the normal pipeline loop, causing it to never finalize.
  - File: `packages/luca-tools/src/artifacts/skills/lu/index.ts:131`
  - Suggestion: Move the `finalize` row back inside the pipeline-loop table (between `learn` and the table's closing `|`), and relocate the "Confidence Gate" + "Executor prompt injection" subsections below the table as named subsections. This is a structural rendering bug.

- **[SHOULD-FIX]** No instruction covers the case where `luca confidence gate --slug <slug>` returns an empty journal (all buckets empty — all entries were `auto`, or no entries were logged). The current prose says "proceed silently" for `auto` entries but gives no explicit "if all three buckets are empty, skip to step 5 immediately" path. An overly-cautious LLM may stall waiting for something to happen.
  - File: `packages/luca-tools/src/artifacts/skills/lu/index.ts:101-116`
  - Suggestion: Add after the bucket routing: "If all three buckets are empty (counts.research === 0 and counts.ask === 0), skip directly to step 5 (advance to execute). No output needed."

- **[SHOULD-FIX]** The `researcher` spawn for `research` entries lacks a concrete prompt template. "Entry's `decision`, `category`, and `reasoning` as the prompt focus" leaves it open to interpretation — the LLM may dump raw JSON, omit the category, or use the wrong researcher prompt shape.
  - File: `packages/luca-tools/src/artifacts/skills/lu/index.ts:107` and `packages/luca-tools/src/artifacts/commands/lu.ts:75`
  - Suggestion: Provide a minimal template, e.g.: `Task(agent: "researcher", prompt: "Research the following planning decision:\nDecision: <entry.decision>\nCategory: <entry.category>\nBackground: <entry.reasoning>\n\nReturn: your recommendation (1–2 sentences) and confidence level.")` This prevents shape-drift between researcher calls.

- **[SHOULD-FIX]** The `lu` command (`lu.ts`) and the `lu` skill (`index.ts`) describe the `plan-review.md` append step with different granularity. The command (line 77) says "Read `.luca/phases/<slug>/plan-review.md`, then append"; the skill (line 112) additionally says "Get the phase dir via `luca phase current`" and specifies "Use the `Edit` tool to append." The command omits both the `luca phase current` call and the `Edit` vs `Write` distinction — a LLM following only the command may use the `Write` tool and clobber the existing file.
  - File: `packages/luca-tools/src/artifacts/commands/lu.ts:77`
  - Suggestion: Align the command to the skill: explicitly state "Get the phase dir via `luca phase current`. Use the `Edit` tool (not `Write`) to append the section — `Write` would overwrite the existing reviewer output."

- **[NOTE]** The `execute.ts` Checkpoint Interaction section (line 92) mentions gate `ask` items "were resolved at the plan-review step and injected into this prompt as `<confidence-gate-resolutions>`" — good. However, neither the skill nor the command tells the executor what to DO if it receives an empty `<confidence-gate-resolutions>` block (all-auto run). Not blocking, but clarifying "if this block is empty, no ambiguities need resolution" would prevent an LLM from looking for a block that simply isn't there.

- **[NOTE]** The `--slug <currentPhaseSlug>` argument to `luca confidence gate` is described as "parse the JSON response" without showing a sample JSON shape. While `{ auto, research, ask, counts }` is given, a concrete minimal example would remove ambiguity about whether each bucket is an array of entry objects or just counts. Both the skill and command assume the reader knows the schema without reference.

## Verified locations (anti-sycophancy attestation)

1. `skills/lu/index.ts:109` — `ask` surfacing instruction confirmed underspecified (no tool name, no prompt format, only "surface ONE targeted question").
2. `skills/lu/index.ts:131` — `finalize` table row confirmed to appear outside the closing `|` of the pipeline table, as orphan prose between the "Executor prompt injection" block and the closing `</workflow>` tag.
3. `skills/lu/index.ts:112` vs `commands/lu.ts:77` — `Edit` vs no-tool-specified discrepancy confirmed by direct comparison of both files.
4. `execute.ts:92` — Confidence gate injection receipt confirmed present and correctly referencing the `<confidence-gate-resolutions>` block format.
5. `triage.ts:133` — `full-auto` description updated to match gate-pause semantics (confirmed "confidence-gate `ask` items" language present).

## Counts
- MUST_FIX: 2
- SHOULD_FIX: 3
- NOTE: 2
- CROSS_PHASE: 0
