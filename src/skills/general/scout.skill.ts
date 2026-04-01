/**
 * scout Skill - Automated article intelligence pipeline for scouting external
 * agentic development research.
 *
 * Deterministic state machine orchestrator that ingests external articles,
 * researches them, assesses framework impact, and produces actionable todos.
 * Uses Agent() sub-agents for all leaf work — no direct LLM judgment for
 * step ordering.
 *
 * @example
 * ```
 * /scout                  — Process all pending URLs from .planning/scouting/inbox.md
 * /scout https://url      — Process a single URL directly
 * /scout --review         — Re-process items from manual-review/
 * /scout --deferred       — List deferred items for milestone planning
 * ```
 */
import { createSkill } from "~/skills/__helpers/create-skill";
import type { SkillConfig } from "~/skills/__schemas/skill.schemas";

const scoutConfig: SkillConfig = {
  frontmatter: {
    name: "scout",
    description:
      "Automated article intelligence pipeline for scouting external agentic development research via /scout command.",
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `<main>
# /scout — Article Intelligence Pipeline

Deterministic state machine orchestrator that ingests external articles, researches them, assesses framework impact, and produces actionable todos.

## Arguments

- \`/scout\` — Process all pending URLs from \`.planning/scouting/inbox.md\`
- \`/scout https://url\` — Process a single URL directly
- \`/scout --review\` — Re-process items from \`manual-review/\`
- \`/scout --deferred\` — List deferred items for milestone planning

## Vault Resolution

\\\`\\\`\\\`bash
REPO_VAULT=$(cat .planning/config.json 2>/dev/null | grep -o '"vault"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"')
if [ -z "$REPO_VAULT" ]; then REPO_VAULT=\${LUCA_MUNINN_VAULT:-default}; fi
\\\`\\\`\\\`

## Sub-agent Delegation

This skill is a **flat Agent() orchestrator**. ALL code work is delegated to leaf-worker agents via Agent(). You CANNOT write code directly.

## Pipeline Architecture

### Phase A: Per-Article Pipeline (sequential per article)

For each URL, read or create state file at \`.planning/scouting/.scout-state/{slug}.json\`. Resume from current state.

**State Machine Transitions** (strictly enforced — no step skipping):

| Current State | Agent to Spawn | Next State |
|---|---|---|
| PENDING | Agent(name: "scout-ingest-{slug}") | INGESTED |
| INGESTED | Agent(name: "scout-relevance-{slug}") | RELEVANCE_CHECKED (or LOW_RELEVANCE) |
| RELEVANCE_CHECKED | Agent(name: "scout-research-{slug}") | RESEARCHED |
| RESEARCHED | Agent(name: "scout-analyze-{slug}") | ANALYZED |
| ANALYZED | Agent(name: "scout-impl-research-{slug}") | IMPL_RESEARCHED |
| IMPL_RESEARCHED | (no agent — mark READY) | READY |

After each Agent() returns:
1. Validate the expected output artifact exists
2. Update state file: advance current_state, append to history, record artifact path
3. Update \`.planning/scouting/inbox.md\` — mark URL as \`<!-- processed:YYYY-MM-DD -->\`

If an Agent() fails or artifact is missing: log error, do NOT advance state, continue to next article.

### Phase B: Cross-Cutting Batch (after all per-article pipelines reach READY)

Only runs when ALL pending articles have reached READY (or terminal) state.

| Step | Agent to Spawn | State Transition |
|---|---|---|
| 1 | Agent(name: "scout-integrate") — batch all READY articles | READY -> INTEGRATION_ANALYZED |
| 2 | Agent(name: "scout-plan") — generate todos | INTEGRATION_ANALYZED -> TODOS_CREATED |
| 3 | Agent(name: "scout-graduate") — MuninnDB capture | TODOS_CREATED -> MEMORY_CAPTURED |
| 4 | (Deterministic) Run updateScoutIndex() | MEMORY_CAPTURED -> INDEXED -> COMPLETE |

### Routing Based on Integration Verdicts

After scout-integrate returns, check per-article verdicts:
- **integrate**: Continue to scout-plan
- **defer**: Move state to DEFERRED, write deferred template to \`.planning/scouting/deferred/\`
- **conflict**: Move state to CONFLICTING, write manual-review template to \`.planning/scouting/manual-review/\`

## Step-by-Step Execution


### Step 1: Parse Arguments

Parse which mode to run:
- No args or URL arg: Process pending URLs
- \`--review\`: List manual-review items, offer to re-process
- \`--deferred\`: List deferred items with conditions-to-revisit

### Step 2: Collect URLs

**If no args:** Read \`.planning/scouting/inbox.md\`, extract all URLs not marked \`<!-- processed -->\`
**If URL arg:** Use the single provided URL
**If --review:** Scan \`.planning/scouting/.scout-state/*.json\` for LOW_RELEVANCE or CONFLICTING states
**If --deferred:** Scan for DEFERRED states, display list, RETURN (read-only)

### Step 3: Per-Article Loop

For each URL:
1. Generate slug: lowercase title/URL, kebab-case, truncate ~50 chars
2. Check for existing state file at \`.planning/scouting/.scout-state/{slug}.json\`
3. If exists: resume from current_state
4. If not: create new state file with PENDING state
5. Step through state machine transitions (Phase A table above)
6. Each step: spawn Agent(), validate output, advance state

### Step 4: Batch Readiness Check

After all per-article loops complete:
- Count articles in READY state
- If 0 READY articles: skip Phase B, RETURN with summary
- If 1+ READY articles: proceed to Phase B

### Step 5: Cross-Cutting Batch (Phase B)

Execute Phase B table above. After Step 4 (deterministic index update):
- Import and call \`updateScoutIndex\` from scout-index.ts
- Commit results

### Step 6: Summary

Display final summary:
- Total articles processed
- Per-state counts (integrated, deferred, low-relevance, conflicting)
- Links to generated todo files (if any)

## State File Schema

Each article state file at \`.planning/scouting/.scout-state/{slug}.json\`:

\\\`\\\`\\\`json
{
  "url": "https://...",
  "slug": "article-slug",
  "current_state": "PENDING",
  "history": [
    { "from": "PENDING", "to": "INGESTED", "timestamp": "ISO-8601", "artifact": "path" }
  ],
  "artifacts": {
    "digest": ".planning/scouting/digests/{slug}.md",
    "research": ".planning/scouting/research/{slug}.md",
    "impact": ".planning/scouting/impact/{slug}.md"
  },
  "verdict": null,
  "created_at": "ISO-8601",
  "updated_at": "ISO-8601"
}
\\\`\\\`\\\`

## Progressive Disclosure

Each Agent() sub-agent receives ONLY its step's context:
- scout-ingest: receives URL only
- scout-relevance: receives digest path only
- scout-research: receives digest path only
- scout-analyze: receives digest path + research output paths
- scout-impl-research: receives impact document path
- scout-integrate: receives all READY impact document paths
- scout-plan: receives integration analysis path
- scout-graduate: receives all completed documents for the batch

No agent sees the full pipeline. This prevents step-skipping by design.

## Error Recovery

- State files are the resume mechanism — re-running \`/scout\` picks up where interrupted
- Each state transition is atomic: advance state AFTER artifact is written
- Agent failures leave state unchanged, allowing retry on next run

## Next Steps

| Condition | Action | Command |
|-----------|--------|---------|
| Pipeline complete | Check project status | \`/progress\` |
| Items need review | Re-process flagged items | \`/scout --review\` |
| Deferred items exist | List for milestone planning | \`/scout --deferred\` |
| Want to commit | Commit changes | Run \`bun run commit\` |
| Want PR | Create pull request | Run \`gh pr create\` |

**Primary:** \`/progress\` — See project status after scouting run

</main>`,
      order: 1,
    },
  ],
};

export const scoutSkill = createSkill(scoutConfig);
