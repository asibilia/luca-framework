/**
 * workflow-save Skill - Save Luca workflow run data to MuninnDB for persistent cross-session memory.
 */
import { createSkill } from "~/skills/__helpers/create-skill";
import type { SkillConfig } from "~/skills/__schemas/skill.schemas";

const workflowSaveConfig: SkillConfig = {
  frontmatter: {
    name: "workflow-save",
    description: `Save Luca workflow run data to MuninnDB for persistent cross-session memory. Use this skill after phase execution completes, when a session pauses or ends, after verification runs, or when the user asks to save, snapshot, or persist workflow state. Also trigger when the user mentions muninn, workflow memory, run history, session tracking, or wants to record what happened during a workflow run.`,
  },
  sections: [
    {
      title: "main",
      content: `<main>
# Workflow Save

Persist Luca workflow run data as atomic memories in MuninnDB. Each piece of data becomes its own memory with inline enrichment (type, summary, entities), linked to related memories via shared entities. This creates a queryable history of everything Luca does across sessions.

## Why This Matters

MuninnDB is Luca's canonical memory system, providing semantic search, entity graphs, contradiction detection, and temporal decay — the foundation for Luca to genuinely learn from its own execution history. Every workflow run produces valuable signal; this skill captures it before it's lost.

## Vault Resolution

Read \`.planning/config.json\` and extract \`muninn.vault\` as REPO_VAULT. Set DEFAULT_VAULT = "default". Use REPO_VAULT for project-scoped operations (session, metric, phase execution, verification, scorecard) and DEFAULT_VAULT for cross-cutting operations (pattern, pitfall, preference, procedure).

All workflow-save operations are project-scoped (session history, phase results, metrics) — use REPO_VAULT for all MuninnDB operations in this skill.

## Two Modes

### Automatic (post-phase / post-session)

Called as the final step of \`/phase-execute\` and \`/session-pause\`. Captures only what changed since the last save — new commits, latest harness results, phase outcome, session summary.

### Manual (\`/workflow-save\`)

Invoked directly by the user. Takes a full snapshot of current state — everything automatic mode captures, plus current scorecard, metrics, and any in-progress session context from MuninnDB.

---

## Memory Taxonomy

Each memory is atomic — one concept per memory. Always include inline enrichment fields (\`type\`, \`summary\`, \`entities\`) when calling \`muninn_remember\` or \`muninn_remember_batch\`.

### Session Memories

| Type | When | What to Capture |
|------|------|-----------------|
| \`session_start\` | Session begins | session_id, branch, base_branch, complexity, oversight level, github_issue, timestamp |
| \`session_end\` | Session pauses/ends | session_id, duration, phases completed count, total commits, reason for pause, blockers if any |

### Execution Memories

| Type | When | What to Capture |
|------|------|-----------------|
| \`phase_execution\` | Phase completes | phase number, phase name/goal, plans executed count, waves count, overall status (success/partial/failed), duration |
| \`plan_execution\` | Plan completes | plan file path, tasks completed, artifacts created/modified/deleted, deviations noted |
| \`commit\` | Git commit made | short hash, full message, files changed count, insertions/deletions, phase context |

### Verification Memories

| Type | When | What to Capture |
|------|------|-----------------|
| \`harness_result\` | Harness runs | per-check status (test/typecheck/lint/build), error count, warning count, duration |
| \`verification\` | Verifier completes | goal achievement assessment, UAT results, gaps found, gap fix iterations needed |

### Convergence Memories

| Type | When | What to Capture |
|------|------|-----------------|
| \`convergence\` | Iteration completes | error_count, error_count_delta, fingerprint_overlap, convergence_status (improved/stalled/regressed), iteration number |
| \`stall_event\` | Stall detected | stale_count, halt decision (continue/halt), debate result if debate agent participated, reason |

### Agent Performance Memories

| Type | When | What to Capture |
|------|------|-----------------|
| \`agent_invocation\` | Agent completes | agent_name, status (success/partial/failed/timeout), duration_ms, context_tier, isolation_mode, model_used |
| \`scorecard_snapshot\` | Manual save | full scorecard: per-agent invocation_count, success_count, failure_count, avg_duration_ms |

### Learning Memories

| Type | When | What to Capture |
|------|------|-----------------|
| \`pattern\` | Learning extracted | validated approach, confidence level, source phase, tags |
| \`decision\` | Decision recorded | choice made, rationale, alternatives considered, confidence |
| \`pitfall\` | Issue discovered | problem description, root cause, fix applied, severity |

### Error Memories

| Type | When | What to Capture |
|------|------|-----------------|
| \`error\` | Significant error | error message (normalized), file, line, classification (transient/persistent), iterations_seen |
| \`routing_decision\` | Router classifies | complexity assigned, model selected, reasoning, override if any |

---

## Entity Taxonomy

Entities create the relational graph between memories. Use these types consistently so recall and traversal work across sessions.

| Entity Type | Name Format | Examples |
|-------------|-------------|---------|
| \`session\` | session UUID | \`sess-a1b2c3d4\` |
| \`milestone\` | version string | \`v3.0.0\`, \`v3.1.0\` |
| \`phase\` | \`phase-{NN}\` | \`phase-06\`, \`phase-03\` |
| \`plan\` | plan filename | \`PLAN-06-01.md\` |
| \`branch\` | full branch name | \`53--v3-data-integrity\` |
| \`agent\` | agent name | \`lu-executor\`, \`lu-verifier\` |
| \`commit\` | short hash | \`a0acf99c\` |
| \`project\` | project name | \`luca-framework\` |
| \`error\` | fingerprint hash | \`err-5f3a\` |

---

## Data Sources

Read from these locations to build memories. Use the state bridge as primary, fall back to direct file reads.

### State (current position)

\`\`\`bash
# Primary
luca-bridge read-status
# Fallback
luca-bridge read-status 2>/dev/null
\`\`\`

### Execution artifacts

- \`.planning/checkpoints/*.json\` — per-iteration convergence snapshots
- \`.planning/harness-result.json\` — latest harness output
- \`.planning/metrics.json\` — aggregated measurements
- \`.planning/scorecard.json\` — agent performance tracking

### Session context

- MuninnDB session memories — current session findings (via \`muninn_recall\`)
- MuninnDB long-term memories — existing learnings (via \`muninn_recall\`)
- \`.continue-here.md\` — session continuation context (if pausing)

### Git history

\`\`\`bash
git log --oneline -20 --format="%h %s"
git diff --stat HEAD~1
git branch --show-current
\`\`\`

---

## Procedure

### Step 1: Assess scope

Determine what needs saving based on trigger mode:

- **Automatic post-phase**: Focus on the just-completed phase — its execution result, harness output, commits made during the phase, convergence data, agent invocations.
- **Automatic post-session**: Focus on session summary — total phases completed, duration, all commits this session, session-end context from MuninnDB session memories.
- **Manual snapshot**: Capture everything — full state, all recent execution data, scorecard, metrics, in-progress context.

### Step 2: Read data sources

Read the relevant files from the data sources listed above. Skip files that don't exist or are empty — not every run produces every artifact.

### Step 3: Build atomic memories

For each data point, construct a memory object with:

\`\`\`json
{
  "concept": "phase-06 execution result",
  "content": "Phase 06 (model routing redesign) completed successfully. 3 plans executed across 2 waves. All tasks completed with no deviations. Duration: ~45 minutes. Commits: a0acf99c, 506bbba6.",
  "type": "phase_execution",
  "summary": "Phase 06 model routing redesign completed successfully",
  "entities": [
    {"name": "phase-06", "type": "phase"},
    {"name": "v3.0.0", "type": "milestone"},
    {"name": "sess-abc123", "type": "session"},
    {"name": "53--v3-data-integrity", "type": "branch"}
  ]
}
\`\`\`

Guidelines for good memories:

- **One concept per memory** — don't combine phase results with harness results
- **Include concrete data** — hashes, counts, durations, statuses. Not vague summaries.
- **Name entities consistently** — always \`phase-06\` not \`Phase 6\` or \`phase 6\`
- **Write content as natural language** — it needs to be semantically searchable

### Step 4: Store in batch

Use \`muninn_remember_batch\` to store all memories in a single call (max 50 per batch). If more than 50 memories, split into multiple batches.

Capture the returned IDs — you'll need them for linking.

### Step 5: Link related memories

After storing, create links between related memories using \`muninn_link\`:

**Relation types:**

| Relation | Meaning | Example |
|----------|---------|---------|
| \`is_part_of\` | Memory belongs to a larger context | commit is_part_of phase, phase is_part_of milestone |
| \`verified_by\` | Result was checked by verification | phase_execution verified_by harness_result |
| \`produced\` | Action produced an artifact | plan_execution produced commit |
| \`triggered\` | Event caused another event | convergence stall triggered stall_event |
| \`followed_by\` | Temporal sequence | session_start followed_by session_end |
| \`learned_from\` | Learning derived from execution | phase_execution learned_from pattern/decision/pitfall |
| \`relates_to\` | General association | error relates_to agent_invocation |

**Linking priorities** (most valuable links first):

1. Phase executions to their verification results
2. Commits to the phase that produced them
3. Learnings to the phase they came from
4. Stall events to the convergence data that triggered them
5. Session start to session end

**HARD GATE: Do NOT proceed to Step 6 until every memory stored in Step 4 has at least one link.** The minimum required link count equals the number of memories stored in Step 4 — one link per memory, no exceptions. If time is constrained and semantic linking is not possible, use the minimum-viable fallback: link each memory to the current session memory via \`is_part_of\`. An unlinked memory is an orphan and defeats the purpose of the graph. Verify your link count before continuing.

### Step 6: Confirm

Report to the user what was saved:

- Number of memories stored
- Key entities created/referenced
- Links established
- Any data sources that were missing or empty

---

## Example: Post-Phase Automatic Save

After Phase 06 completes, the skill produces these memories:

1. **phase_execution**: "Phase 06 (model routing redesign) completed successfully. 3 plans, 2 waves, ~45min."
2. **harness_result**: "Phase 06 harness: test passed, typecheck passed, lint passed, build passed. 0 errors, 0 warnings."
3. **commit**: "a0acf99c — docs(05-01,05-02): verify Phase 5 agentic reliability todos"
4. **commit**: "506bbba6 — fix(03-01): add eventType/timestamp indexes to observer_events"
5. **convergence**: "Phase 06 converged in 1 iteration. Error count: 0, delta: 0, status: improved."
6. **agent_invocation**: "lu-executor: 3 invocations, 3 success, avg 42s, model: sonnet"
7. **agent_invocation**: "lu-verifier: 1 invocation, 1 success, 18s, model: sonnet"

Then links:

- memories 1-7 all linked to phase-06 entity via is_part_of
- memory 2 linked to memory 1 via verified_by
- memories 3-4 linked to memory 1 via produced
- memories 6-7 linked to session entity via is_part_of

## Example: Session Pause Save

At session pause, the skill produces:

1. **session_end**: "Session sess-abc123 ended after 2h15m. Completed phases 05, 06. 4 commits. Paused: context window approaching limit."
2. **scorecard_snapshot**: "Agent scorecard at session end: lu-executor 6/6 success avg 40s, lu-verifier 2/2 success avg 20s, lu-cognition 1/1 success avg 8s."

Links:

- session_end to session_start via followed_by
- scorecard_snapshot to session entity via is_part_of

---

## Recalling Saved Data

The skill doesn't handle recall directly — use MuninnDB's recall tools whenever you need history:

\`\`\`
muninn_recall(vault=REPO_VAULT, context="phase 06 execution results")
muninn_recall(vault=REPO_VAULT, context="verification failures this milestone")
muninn_recall(vault=REPO_VAULT, context="what happened in last session")
muninn_find_by_entity(vault=REPO_VAULT, entity_name="phase-06")
muninn_entity_timeline(vault=REPO_VAULT, entity_name="v3.0.0")
\`\`\`

Use \`mode="deep"\` on recall for thorough graph traversal when you need connected context.

---

## Edge Cases

- **No checkpoints exist**: Skip convergence memories. This is normal for TRIVIAL/SIMPLE tasks.
- **No harness result**: Skip verification memories. Harness may not have run yet.
- **Empty session context**: Skip learning memories. Session may not have produced learnings yet.
- **Multiple sessions same day**: Each session gets its own session_start/session_end pair. The session_id disambiguates.
- **Partial phase completion**: Still save what completed. Mark phase_execution status as \`partial\` and note what remains.
- **MuninnDB unavailable**: Log a warning and continue. Workflow should never block on memory persistence.
</main>`,
      order: 1,
    },
  ],
};

export const workflowSaveSkill = createSkill(workflowSaveConfig);
