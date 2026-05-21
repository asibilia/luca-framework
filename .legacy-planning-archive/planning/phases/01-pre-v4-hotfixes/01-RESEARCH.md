# Phase 1: Pre-v4 Hotfixes - Research

**Researched:** 2026-03-09
**Domain:** Prompt-level agent/skill modifications — MuninnDB linking, orchestrator resilience
**Confidence:** HIGH

## Summary

This phase makes three surgical prompt-level changes to two agents and one skill. All changes are text edits to TypeScript source files in `src/` that compile to `.claude/` and `.cursor/` via `bun run build:all`. No runtime infrastructure changes are involved.

**#97 (lu-learner + workflow-save):** The lu-learner `write_memory` step stores engrams but has no linking instructions. A new `link_memories` step must be inserted between `write_memory` (line 429) and `clear_working` (line 447). The `workflow-save` Step 5 has complete linking documentation but the LLM skips it because there is no blocking gate; a hard gate phrase must be inserted before Step 6.

**#98 (phase-execute):** The phase-execute skill has no wave journaling, no code review persistence, and the existing suspend/resume system (Step 4.5) handles context exhaustion for the "stop" zone but not a graceful mid-session budget warning for "HIGH/CRITICAL." Three additive instructions blocks must be inserted: a JSONL journal append after each wave, a REVIEW.md write after Step 8, and a context budget check between waves.

**Primary recommendation:** Make changes in order — lu-learner first (simplest, most isolated), then workflow-save (one-sentence gate addition), then phase-execute (three distinct insertion points).

## Standard Stack

No new libraries. All changes are prose instructions inside TypeScript template strings.

### MuninnDB Tools Referenced

| Tool                           | Purpose                                     | Already Used In                          |
| ------------------------------ | ------------------------------------------- | ---------------------------------------- |
| `mcp__muninn__muninn_link`     | Create directed link between two memory IDs | workflow-save Step 5 (but skipped)       |
| `mcp__muninn__muninn_recall`   | Semantic recall to find related memories    | lu-learner `load_working`, `load_memory` |
| `mcp__muninn__muninn_remember` | Store new engram                            | lu-learner `write_memory`                |
| `mcp__muninn__muninn_forget`   | Clear session context                       | lu-learner `clear_working`               |

The `muninn_link` signature is: `muninn_link(vault: "default", source_id: <id>, target_id: <id>, relation: <string>)`. The returned IDs from `muninn_remember` are used as inputs. Relation types in use: `learned_from`, `relates_to`, `is_part_of`.

## Architecture Patterns

### Pattern 1: Step insertion in lu-learner execution_flow

The `execution_flow` section is a sequence of named `<step>` blocks. Current sequence (relevant portion):

```
load_working → load_memory → extract_patterns → extract_decisions →
extract_pitfalls → extract_procedures → update_confidence →
write_memory → [INSERT HERE] → clear_working → generate_summary
```

The new `link_memories` step goes at line 446, directly after the closing `</step>` of `write_memory` and before the opening `<step name="clear_working">`.

### Pattern 2: Hard gate phrase in workflow-save

Step 5 is a markdown section (`### Step 5: Link related memories`). The LLM skips it because it reads as optional documentation. The fix is inserting a blocking instruction before the first instruction of Step 6.

Current Step 5 ends at `### Step 6: Confirm` (line 221). Insertion point: add a `**HARD GATE:**` block as the last paragraph inside Step 5, before the `---` separator and Step 6.

### Pattern 3: Three additive blocks in phase-execute

The three insertion points in `phase-execute.skill.ts` are:

| Change               | Insertion After                                                 | Location Approx                                  |
| -------------------- | --------------------------------------------------------------- | ------------------------------------------------ |
| Wave Journal append  | Each wave completes in Step 4 (after "Verify SUMMARYs created") | After line ~340 (inside Step 4 loop description) |
| Context budget check | Before each new wave starts (Step 4 loop header)                | Same region, as a pre-wave check                 |
| REVIEW.md write      | After Step 8.1 handling completes (before Step 9)               | After line ~1776                                 |

### Recommended Project Structure

No structural changes. All edits are within existing files.

## Don't Hand-Roll

| Problem                          | Don't Build              | Use Instead                                        | Why                                                                                     |
| -------------------------------- | ------------------------ | -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Finding related memories to link | Custom similarity logic  | `muninn_recall` then `muninn_link`                 | MuninnDB semantic recall already ranks by similarity                                    |
| Tracking wave completion         | Custom checkpoint format | Append-only JSONL (same as `session-ledger.jsonl`) | Mirrors existing pattern; simple, grep-friendly                                         |
| Context size detection           | Token counting           | Qualitative language ("HIGH/CRITICAL budget")      | LLM has no access to exact token counts; use heuristic language as in existing Step 4.5 |

**Key insight:** The existing Step 4.5 (suspend/resume) already handles "stop" zone. The new context budget check for #98 Change 3 is a lighter warning for "HIGH/CRITICAL" that triggers earlier — it complements rather than replaces Step 4.5.

## Common Pitfalls

### Pitfall 1: IDs not captured before linking

**What goes wrong:** `muninn_remember` returns an ID in the response. If the step doesn't explicitly capture it, the subsequent `muninn_link` call has nothing to link.
**Why it happens:** LLMs sometimes discard return values unless told to capture them.
**How to avoid:** In the `link_memories` step, explicitly instruct: "Capture the ID returned by each `muninn_remember` call in the `write_memory` step. If IDs were not captured, re-recall the concept by name first to get its ID."
**Warning signs:** If linking instructions say "use the ID from Step X" but Step X doesn't say "capture the returned ID."

### Pitfall 2: workflow-save gate must be a blocking phrase, not a warning

**What goes wrong:** Soft language like "ensure linking is done" is skipped. The current Step 5 is all soft language.
**Why it happens:** The LLM treats advisory text as optional.
**How to avoid:** Use imperative blocking language: "**Do NOT proceed to Step 6 until you have called `muninn_link` at least N times.**" where N is concrete and verifiable.

### Pitfall 3: JSONL journal path must be relative to phase directory

**What goes wrong:** If the path is hardcoded as `.planning/phases/NN/` it breaks across phases.
**Why it happens:** Template placeholders get substituted wrong.
**How to avoid:** Use `{phase_dir}/.wave-progress.jsonl` where `{phase_dir}` is already defined in the skill (e.g., in Step 4, it's the scanned directory).

### Pitfall 4: REVIEW.md must be written before Step 9 state transition

**What goes wrong:** The `VERIFY_PASSED` transition fires in Step 9. If REVIEW.md is written after, a compaction event between Steps 8 and 9 loses the review data.
**Why it happens:** Wrong ordering.
**How to avoid:** REVIEW.md write is part of Step 8.1 completion, before Step 9.

### Pitfall 5: build:all must NOT be run in-session

**What goes wrong:** `bun run build:all` crashes Claude Code session (per MEMORY.md).
**How to avoid:** The CONTEXT.md already notes this. The plan should instruct the executor to edit src/ files only and note that build:all must be run by the developer post-session.

## Code Examples

### link_memories step (lu-learner)

```typescript
// Insert as new <step name="link_memories"> between write_memory and clear_working
`<step name="link_memories">
After writing new memories, link them to semantically related existing memories to reduce the orphan ratio.

For each new engram stored in \`write_memory\`:

1. Capture the ID returned by \`muninn_remember\`. If the ID was not captured, recall by concept name:

\`\`\`
mcp__muninn__muninn_recall(vault: "default", context: "[concept name just stored]")
\`\`\`

2. Find the top 2-3 related memories via semantic recall:

\`\`\`
mcp__muninn__muninn_recall(vault: "default", context: "[concept domain — e.g., TypeScript patterns, MuninnDB, authentication]")
\`\`\`

3. Link to the top 2-3 results using \`muninn_link\`:

\`\`\`
mcp__muninn__muninn_link(vault: "default", source_id: "[new memory ID]", target_id: "[related memory ID]", relation: "relates_to")
\`\`\`

4. If the phase/session that produced this learning is known, also link with \`learned_from\`:

\`\`\`
mcp__muninn__muninn_link(vault: "default", source_id: "[new memory ID]", target_id: "[phase or session memory ID]", relation: "learned_from")
\`\`\`

**Minimum:** Create at least 1 link per new memory. Zero links is a failure condition.

Log: "Linked N new memories, M total links created."
</step>`;
```

### workflow-save hard gate (before Step 6)

```markdown
**HARD GATE — Step 5 must complete before Step 6.**

Do NOT call the Step 6 confirm function until you have called `muninn_link` at least N times, where N equals the number of memories stored in Step 4. If the batch returned 7 IDs, you must create at least 7 links before proceeding.

Minimum viable linking (if time-constrained): link each memory to the session memory via `is_part_of`.
```

### Wave progress journal append (phase-execute, inside Step 4 loop)

```markdown
**After each wave completes (executor Tasks return and SUMMARYs verified):**

Append a line to the wave progress journal:

\`\`\`bash
echo '{"wave":{wave_number},"plans":["{plan_01_name}","{plan_02_name}"],"status":"complete","summaries_found":{N},"ts":"'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"}' >> {phase_dir}/.wave-progress.jsonl
\`\`\`

This journal persists across context compaction. On resume, read it to skip already-completed waves.
```

### Context budget check (phase-execute, before each wave)

```markdown
**Before starting each wave, check context budget:**

If the transcript feels large (many agent results already consumed) or the context zone reads as "degrading" or higher:

1. Write current state to wave journal (as above)
2. Write `.continue-here.md`:

\`\`\`markdown

# Continue Here

**Phase:** {phase_number}
**Last completed wave:** {last_completed_wave}
**Completed plans:** {comma-separated list}
**Remaining waves:** {list}

Resume: \`/phase-execute {phase_number}\`
The wave journal at \`{phase_dir}/.wave-progress.jsonl\` tracks progress.
\`\`\`

3. Inform the user and stop:

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Luca ► CONTEXT BUDGET HIGH — GRACEFUL HANDOFF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Context budget is in the HIGH/CRITICAL zone before wave {N}.
Progress saved to .wave-progress.jsonl and .continue-here.md.
Start a fresh session and run /phase-execute {phase_number} to resume.
\`\`\`

**Note:** This is a lighter check than Step 4.5 (which handles the "stop" zone with bridge suspend/resume). This check fires earlier to convert a potential compaction crash into a clean handoff.
```

### REVIEW.md write (phase-execute, end of Step 8.1)

```markdown
**After processing all reviewer findings (Step 8.1), write REVIEW.md:**

\`\`\`bash
cat > {phase_dir}/REVIEW.md << 'REVIEW_EOF'

# Code Review — Phase {phase_number}

**Reviewed:** {timestamp}
**Files reviewed:** {FILE_COUNT}
**Reviewers:** dx-advocate, code-simplifier, code-architect, ui{, security-auditor if spawned}

## Summary

| Severity | Count |
| -------- | ----- |
| CRITICAL | {N}   |
| HIGH     | {N}   |
| MEDIUM   | {N}   |
| LOW      | {N}   |

## Findings

{merged and deduplicated findings in YAML format}
REVIEW_EOF
\`\`\`

This file persists reviewer findings across context compaction. It is referenced by session-resume when recovering a mid-review session.
```

## State of the Art

| Old Approach                     | Current Approach            | When Changed | Impact               |
| -------------------------------- | --------------------------- | ------------ | -------------------- |
| No linking after muninn_remember | Explicit link_memories step | This phase   | Reduces orphan ratio |
| Advisory Step 5 in workflow-save | Hard gate before Step 6     | This phase   | Forces linking       |
| Wave completion in-memory only   | JSONL journal on disk       | This phase   | Survives compaction  |
| Reviewer findings in-memory only | REVIEW.md persistence       | This phase   | Survives compaction  |

## Open Questions

1. **ID capture in lu-learner write_memory**
   - What we know: `muninn_remember` returns an ID in the tool response.
   - What's unclear: Whether the current `write_memory` step prose actually causes the LLM to capture the returned ID or discard it.
   - Recommendation: The `link_memories` step should include a fallback path: "If IDs were not captured, use `muninn_recall` on the concept name to retrieve the ID." This makes the step self-healing.

2. **muninn_link signature — does it accept relation as a string?**
   - What we know: `workflow-save.skill.ts` line 205 already documents `muninn_link` with relations like `is_part_of`, `verified_by`, `produced`, `learned_from`, `relates_to`. These are already used in the skill prose.
   - What's unclear: Exact parameter name (`relation` vs `relationship` vs `type`).
   - Recommendation: Use the same pattern already in workflow-save Step 5 as the reference; it has been written by someone with access to the actual API. Confidence: HIGH that `muninn_link` is correct.

3. **phase_dir variable availability in phase-execute**
   - What we know: Step 7 defines `PHASE_DIR=".planning/phases/{phase_number}-*"`. Steps 4+ use `{phase_dir}` as a template placeholder.
   - What's unclear: Whether the JSONL path should use bash variable `$PHASE_DIR` (resolves to glob) or `{phase_dir}` template (resolves to literal path).
   - Recommendation: Use the pattern already in Step 7 for the JSONL append: `find $PHASE_DIR -maxdepth 0 | head -1` to get the resolved path, or use the same `{phase_dir}` placeholder convention the skill already uses.

## Sources

### Primary (HIGH confidence)

- Direct read of `src/agents/general/lu-learner.agent.ts` — current step sequence, exact line numbers
- Direct read of `src/skills/general/workflow-save.skill.ts` — Step 5 structure, relation types, existing muninn_link documentation
- Direct read of `src/skills/general/phase-execute.skill.ts` — all 2000+ lines; identified Steps 4, 4.5, 8, 8.1, 9
- Direct read of `.planning/todos/pending/97-fix-muninndb-orphan-ratio.md` — exact change specification
- Direct read of `.planning/todos/pending/98-compaction-resilient-orchestrators.md` — exact change specification
- Direct read of `.planning/phases/01-pre-v4-hotfixes/01-CONTEXT.md` — decisions and scope guardrail

### Secondary (MEDIUM confidence)

- Inference from existing `workflow-save.skill.ts` Step 5 muninn_link examples — signature pattern is consistent with CONTEXT.md decision

## Metadata

**Confidence breakdown:**

- lu-learner insertion point: HIGH — exact line identified (between line 445 and 447)
- workflow-save gate: HIGH — insertion point is clear (end of Step 5, before Step 6)
- phase-execute wave journal: HIGH — pattern mirrors existing session-ledger.jsonl
- phase-execute REVIEW.md: HIGH — clear insertion point after Step 8.1 (line ~1776)
- phase-execute context budget check: MEDIUM — the "HIGH/CRITICAL zone" language is qualitative; exact phrasing needs to be intuitive to the LLM
- muninn_link relation parameter name: HIGH — corroborated by existing workflow-save Step 5 prose

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable domain, no external dependencies)

---

## Exact Insertion Points Summary

### File 1: `src/agents/general/lu-learner.agent.ts`

- **Insert:** New `<step name="link_memories">` block
- **Between:** Line 445 (`</step>` closing `write_memory`) and line 447 (`<step name="clear_working">`)
- **Content:** See Code Examples above

### File 2: `src/skills/general/workflow-save.skill.ts`

- **Insert:** Hard gate paragraph
- **Location:** Inside `### Step 5: Link related memories` section, after the linking priorities list (line ~219) and before the `### Step 6: Confirm` heading (line ~221)
- **Content:** See Code Examples above

### File 3: `src/skills/general/phase-execute.skill.ts`

- **Insert A (wave journal):** After the "Verify SUMMARYs created" bullet inside Step 4 description (~line 340 area). Append on every wave completion.
- **Insert B (context budget check):** As a pre-wave guard at the top of the wave loop in Step 4 — before "Read plan contents" block. Fires before each wave (not after).
- **Insert C (REVIEW.md):** After the final routing in Step 8.1 (`**If clean (or LOW only):** Continue to step 9.`), before `### 9. Signal Verification and Update State` (~line 1778).
