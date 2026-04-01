# Cognitive Pre-Flight Workflow

This workflow is executed by `<%= branding.commandPrefix %>-cognition` agent before major operations. It prepares the cognitive context for downstream agents.

## Purpose

- Load project identity from MuninnDB (`brain:project-identity`)
- Selectively recall relevant memories from MuninnDB (`muninn_recall`)
- Initialize session working memory in MuninnDB (`session:*` engrams)
- Generate intuition flags to guide execution

> **Note (v9.2.0):** File-based memory (BRAIN.md, MEMORY.md, WORKING.md) is sunset.
> All cognitive pre-flight now uses MuninnDB exclusively.
> Use `muninn_recall_tree` for project identity and `muninn_recall` for patterns,
> decisions, and pitfalls.

## When This Runs

- Before `<%= branding.commandSlash %>` routes to execution
- Before `/<%= branding.commandPrefix %>-plan-phase` begins planning
- Before `/<%= branding.commandPrefix %>-execute-phase` begins execution
- Before `/<%= branding.commandPrefix %>-debug` begins investigation

## Process

### Step 1: Load Project Identity

Recall the project brain tree from MuninnDB:

```
mcp__muninn__muninn_recall_tree(vault: REPO_VAULT, root: "brain:project-identity")
```

**Extract from recalled tree:**

- Project name, domain, purpose
- Stack: languages, frameworks, databases
- Architecture patterns
- Code conventions
- Development preferences

If no tree exists yet, note "Project identity not seeded — run /seed-memory to bootstrap."

### Step 2: Extract Task Keywords

From the incoming task/request, extract keywords for memory recall:

```
Task Analysis:
- Technical terms: [component names, libraries, patterns]
- Action types: [refactor, add, fix, debug, etc.]
- Domain concepts: [auth, payment, UI, API, etc.]
- File patterns: [paths mentioned]
```

These keywords drive selective memory recall.

### Step 3: Selective Memory Recall via MuninnDB

#### 3a. Milestone-Scoped Recall (Preferred)

When a current milestone is known (from state.json or bridge), use the scored
recall engine. This ranks entries by a composite score combining milestone
proximity, tag overlap, confidence, and recency:

```bash
# Read current milestone from state
BRIDGE_PATH=$(node -e "console.log(require.resolve('@alecsibilia/luca-framework/state/bridge'))" 2>/dev/null || echo "packages/luca-framework/src/state/bridge.ts")
CURRENT_MILESTONE=$(bun run "$BRIDGE_PATH" read-status 2>/dev/null \
  | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.current_milestone || '')" 2>/dev/null)
```

Then call MuninnDB with milestone context:

```
mcp__muninn__muninn_recall(
  vault: REPO_VAULT,
  context: "milestone:{CURRENT_MILESTONE} {TASK_TAGS}"
)
```

Also recall from the default vault for cross-project patterns:

```
mcp__muninn__muninn_recall(
  vault: "default",
  context: "{TASK_TAGS}"
)
```

**Scoring formula:**

| Factor              | Weight | Description                              |
| ------------------- | ------ | ---------------------------------------- |
| Milestone proximity | 0.4    | Same=1.0, adjacent=0.7, 2 apart=0.4      |
| Tag overlap         | 0.3    | Intersection of entry tags and task tags |
| Confidence          | 0.15   | high=1.0, medium=0.6, low=0.3            |
| Recency             | 0.15   | <30d=1.0, <90d=0.7, <180d=0.4, else=0.2  |

Entries from the current milestone are strongly preferred. Entries without a
milestone tag receive a neutral proximity score of 0.5.

#### 3b. Keyword-Based Recall (Fallback)

When no milestone is set, fall back to tag-based filtering via MuninnDB:

```
mcp__muninn__muninn_recall(vault: REPO_VAULT, context: "{TASK_TAGS}")
mcp__muninn__muninn_recall(vault: "default", context: "{TASK_TAGS}")
```

Merge results from both vaults by score, dedup by concept prefix.

**Search for:**

| Type        | MuninnDB Concept Prefix | Purpose                 |
| ----------- | ----------------------- | ----------------------- |
| Patterns    | `pattern:*`             | Apply proven approaches |
| Decisions   | `decision:*`            | Respect prior decisions |
| Pitfalls    | `pitfall:*`             | Avoid known issues      |
| Preferences | `preference:*`          | Honor user preferences  |

**Selection criteria:**

- High confidence entries preferred
- Recent entries weighted higher
- Direct keyword matches over partial
- **Limit to 3-5 items** to avoid context bloat

### Step 4: Initialize Working Memory in MuninnDB

Create a session engram to track this workflow run:

```
mcp__muninn__muninn_remember(
  vault: REPO_VAULT,
  concept: "session:start",
  content: "Session started at {TIMESTAMP}. Workflow: {workflow}. Phase: {phase}."
)
```

Use subsequent `muninn_remember` calls with `session:findings` throughout execution
to log discoveries, candidate patterns, and pitfalls in real time.

### Step 5: Generate Intuition Flags

Based on memory recall, generate flags:

**For each recalled pattern:**

```
IF task aligns with pattern:
  FLAG: OPPORTUNITY - "Pattern X can be applied"
IF task conflicts with pattern:
  FLAG: RISK - "Pattern X suggests different approach"
```

**For each recalled pitfall:**

```
IF task touches same area:
  FLAG: CAUTION - "Pitfall Y occurred in this area"
IF task explicitly fixing pitfall:
  NOTE: KNOWN ISSUE - "This addresses known pitfall Y"
```

**For each recalled decision:**

```
IF task revisits decision area:
  NOTE: PRIOR DECISION - "Decision Z constrains this"
IF task conflicts with decision:
  FLAG: RISK - "This conflicts with decision Z"
```

**For unknown territory:**

```
IF no patterns, decisions, or pitfalls match:
  FLAG: UNKNOWN - "No prior experience with this type of task"
```

### Step 6: Output Cognitive Report

```markdown
## COGNITIVE PRE-FLIGHT COMPLETE

### Project Identity

{Summary from brain:project-identity MuninnDB tree, or "Not seeded — run /seed-memory"}

### Memory Recall

**Patterns:** {N} relevant patterns loaded
**Decisions:** {N} relevant decisions recalled
**Pitfalls:** {N} cautions flagged

### Relevant Context

{Bulleted list of specific recalled items}

### Intuition Flags

| Flag   | Type                             | Reason |
| ------ | -------------------------------- | ------ |
| {flag} | RISK/CAUTION/OPPORTUNITY/UNKNOWN | {why}  |

### Session Memory

Initialized in MuninnDB at session:start

### Ready For

{Next agent: router, planner, executor, debugger}
```

### Step 7: Persist Complexity to state.json

After complexity is classified (by <%= branding.commandPrefix %>-router), update via bridge:

```bash
luca-bridge set-field --field=complexity --value='"${COMPLEXITY}"' 2>/dev/null || true
```

This ensures complexity persists across sessions for:

- Resumption context
- Learning validation
- Classification accuracy tracking

## Success Criteria

- [ ] brain:project-identity recalled from MuninnDB (or noted as missing)
- [ ] Keywords extracted from task
- [ ] Milestone-scoped recall attempted (if current_milestone is set)
- [ ] MuninnDB queried for relevant patterns, decisions, pitfalls
- [ ] Relevant items identified (3-5 max)
- [ ] Session engram initialized in MuninnDB (session:start)
- [ ] Intuition flags generated
- [ ] Cognitive report output
- [ ] Complexity classification persisted via bridge

## Notes

- Pre-flight adds ~10-15% context overhead
- Worthwhile tradeoff for memory-aided development
- Can be skipped with `--skip-memory` flag if needed
- Memory recall is selective - not everything is loaded
- Milestone recall uses scored ranking (proximity + tags + confidence + recency)
- Entries without milestone tags receive neutral 0.5 proximity score
- File-based memory (BRAIN.md, MEMORY.md, WORKING.md) is sunset as of v9.2.0
