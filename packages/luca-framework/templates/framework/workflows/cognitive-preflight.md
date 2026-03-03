# Cognitive Pre-Flight Workflow

This workflow is executed by `lu-cognition` agent before major operations. It prepares the cognitive context for downstream agents.

## Purpose

- Load project identity from BRAIN.md
- Selectively recall relevant memories from MEMORY.md
- Initialize session working memory in WORKING.md
- Generate intuition flags to guide execution

## When This Runs

- Before `/lu` routes to execution
- Before `/lu-plan-phase` begins planning
- Before `/lu-execute-phase` begins execution
- Before `/lu-debug` begins investigation

## Process

### Step 1: Load Project Identity

```bash
# Check for BRAIN.md
if [ -f .planning/BRAIN.md ]; then
  echo "Loading project identity..."
  cat .planning/BRAIN.md
else
  echo "No BRAIN.md configured - operating without project identity"
fi
```

**Extract from BRAIN.md:**

- Project name, domain, purpose
- Stack: languages, frameworks, databases
- Architecture patterns
- Code conventions
- Development preferences

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

### Step 3: Selective Memory Recall

#### 3a. Milestone-Scoped Recall (Preferred)

When a current milestone is known (from STATE.md or bridge), use the scored
recall engine. This ranks entries by a composite score combining milestone
proximity, tag overlap, confidence, and recency:

```bash
# Read current milestone from state
# Resolve bridge: try installed package, then monorepo path
BRIDGE_PATH=$(node -e "console.log(require.resolve('@alecsibilia/luca-framework/state/bridge'))" 2>/dev/null || echo "packages/luca-framework/src/state/bridge.ts")
CURRENT_MILESTONE=$(bun run "$BRIDGE_PATH" read-status 2>/dev/null \
  | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.current_milestone || '')" 2>/dev/null)

if [ -n "$CURRENT_MILESTONE" ] && [ -f .planning/MEMORY.md ]; then
  # Milestone-scoped recall via memory bridge
  # Tags come from Step 2 keyword extraction
  RECALL_JSON=$(bun run src/memory/__helpers/bridge.ts read-memory \
    --milestone="${CURRENT_MILESTONE}" \
    --tags="${TASK_TAGS}" \
    --limit=5 2>/dev/null)
  echo "$RECALL_JSON"
fi
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

When no milestone is set, or MEMORY.md has no milestone-tagged entries, fall
back to tag-based filtering:

```bash
# Fallback: tag-based filtering via bridge
if [ -f .planning/MEMORY.md ]; then
  RECALL_JSON=$(bun run src/memory/__helpers/bridge.ts read-memory \
    --tags="${TASK_TAGS}" \
    --limit=5 2>/dev/null)
  echo "$RECALL_JSON"
fi

# Final fallback: read MEMORY.md directly
if [ -z "$RECALL_JSON" ] && [ -f .planning/MEMORY.md ]; then
  echo "Searching memory for relevant entries..."
  cat .planning/MEMORY.md
fi
```

**Search MEMORY.md sections:**

| Section     | Search For       | Purpose                 |
| ----------- | ---------------- | ----------------------- |
| Patterns    | Keyword matches  | Apply proven approaches |
| Decisions   | Related choices  | Respect prior decisions |
| Pitfalls    | Matching areas   | Avoid known issues      |
| Preferences | Applicable prefs | Honor user preferences  |

**Selection criteria:**

- High confidence entries preferred
- Recent entries weighted higher
- Direct keyword matches over partial
- **Limit to 3-5 items** to avoid context bloat

### Step 4: Initialize Working Memory

Create or reset `.planning/WORKING.md`:

```bash
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
```

```markdown
# Working Memory

## Session Info

- **Started**: $TIMESTAMP
- **Workflow**: [workflow name]
- **Phase**: [phase if applicable]
- **Plan**: [plan if applicable]

---

## Current Context

### Task

- **Goal**: [extracted from input]
- **Complexity**: [to be classified]
- **Scope**: [files/areas if known]

### Memory Recall

- **Patterns loaded**: [from Step 3]
- **Decisions recalled**: [from Step 3]
- **Pitfalls flagged**: [from Step 3]

---

## Immediate Findings

### Discovery

<!-- Log findings as work progresses -->

### Code Observations

<!-- Note interesting patterns found -->

### Dependencies Identified

<!-- Track dependencies discovered -->

---

## Hypotheses

<!-- For debugging workflows -->

---

## In-Progress Notes

### Current Task

<!-- Detailed notes -->

### Blockers

<!-- Things blocking progress -->

### Questions

<!-- Questions to resolve -->

---

## Session Log

| Time | Action | Result |
| ---- | ------ | ------ |

---

## Pre-Learning Extraction

### Candidate Patterns

<!-- Patterns that worked -->

### Candidate Decisions

<!-- Decisions made -->

### Candidate Pitfalls

<!-- Issues encountered -->

---

_Session Status_

- [x] Active
- [ ] Learnings extracted
- [ ] Ready to clear
```

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

{Summary from BRAIN.md or "Not configured"}

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

### Working Memory

Initialized at `.planning/WORKING.md`

### Ready For

{Next agent: router, planner, executor, debugger}
```

### Step 7: Persist Complexity to STATE.md

After complexity is classified (by lu-router), update STATE.md:

```bash
TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M")
sed -i '' "s/Task Complexity:.*/Task Complexity: ${COMPLEXITY} (classified ${TIMESTAMP})/" .planning/STATE.md
```

This ensures complexity persists across sessions for:

- Resumption context
- Learning validation
- Classification accuracy tracking

## Success Criteria

- [ ] BRAIN.md checked (loaded or noted as missing)
- [ ] Keywords extracted from task
- [ ] Milestone-scoped recall attempted (if current_milestone is set in STATE)
- [ ] MEMORY.md searched for relevant entries (milestone-scored or tag-filtered)
- [ ] Relevant items identified (3-5 max)
- [ ] WORKING.md initialized with session context
- [ ] Intuition flags generated
- [ ] Cognitive report output
- [ ] Complexity classification persisted to STATE.md

## Notes

- Pre-flight adds ~10-15% context overhead
- Worthwhile tradeoff for memory-aided development
- Can be skipped with `--skip-memory` flag if needed
- Memory recall is selective - not everything is loaded
- Milestone recall uses scored ranking (proximity + tags + confidence + recency)
- Entries without milestone tags receive neutral 0.5 proximity score
