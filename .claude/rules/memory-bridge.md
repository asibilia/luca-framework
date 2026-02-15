# Memory bridge CLI reference: how to read/write memory files via the typed bridge layer

## rule

# Memory Bridge

## Overview

Luca uses a memory bridge CLI (`src/memory/bridge.ts`) as the primary interface for reading and writing memory files (MEMORY.md, WORKING.md, PROCEDURES.md). The bridge wraps existing parsers/serializers in shell-friendly commands with JSON output.

**Note:** BRAIN.md is NOT managed by the memory bridge. It is 3.6KB, read-only, and agents need the full markdown. Use `cat .planning/BRAIN.md` directly.

## Bridge CLI Commands

### Read Commands

| Command                                                                         | Description                       | Output                                                                                      |
| ------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------- |
| `bun run src/memory/bridge.ts read-memory`                                      | Compact summary index             | `{entries_count, categories, total_tokens, entries: [{id,title,category,tags,confidence}]}` |
| `bun run src/memory/bridge.ts read-memory --tags=X,Y --limit=N`                 | Filtered full entries by tags     | `{entries: [MemoryEntry[]]}`                                                                |
| `bun run src/memory/bridge.ts read-memory --category=pattern --limit=N`         | Filtered full entries by category | `{entries: [MemoryEntry[]]}`                                                                |
| `bun run src/memory/bridge.ts read-working`                                     | Parsed WORKING.md structure       | `{sections, total_tokens, status}`                                                          |
| `bun run src/memory/bridge.ts read-procedures`                                  | Summary index of procedures       | `{active_count, retired_count, entries: [{id,title,trigger,tags,success_rate,status}]}`     |
| `bun run src/memory/bridge.ts read-procedures --query="..." --tags=X --limit=N` | Scored procedure recall           | `{entries: [ProcedureEntry[]]}`                                                             |
| `bun run src/memory/bridge.ts check-context`                                    | Token usage across all files      | ContextUsageResult JSON                                                                     |
| `bun run src/memory/bridge.ts check-compression`                                | Compression recommendations       | `{should_compress, triggers, recommended_actions[], entry_recommendations[]}`               |

### Write Commands

| Command                                                                          | Description                      | Output                                  |
| -------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------- |
| `bun run src/memory/bridge.ts append-working --section=findings --content="..."` | Append to WORKING.md section     | `{section, total_tokens, status}`       |
| `bun run src/memory/bridge.ts clear-working`                                     | Reset WORKING.md to empty        | `{cleared, status, session_started_at}` |
| `bun run src/memory/bridge.ts update-procedure-stats --id=X --success=true`      | Update procedure execution stats | `{id, execution_count, success_rate}`   |

### Valid Section Names for append-working

`session_info`, `memory_recall`, `planning_notes`, `findings`, `hypotheses`, `candidate_learnings`

## Usage Patterns

### Reading Memory (Skills/Agents)

Always use the bridge as primary, with raw file fallback:

\`\`\`bash

# Primary: Read memory summary from bridge (compact JSON, saves tokens)

MEMORY_JSON=$(bun run src/memory/bridge.ts read-memory 2>/dev/null || echo '{"entries":[],"entries_count":0}')

# Fallback: Read MEMORY.md directly (full 91KB markdown)

MEMORY_CONTENT=$(cat .planning/MEMORY.md 2>/dev/null || echo "No memory file")
\`\`\`

### Filtered Memory Recall

\`\`\`bash

# Primary: Read only debugging-relevant entries (saves ~90% tokens vs full file)

MEMORY_JSON=$(bun run src/memory/bridge.ts read-memory --tags=debugging,pitfalls --limit=10 2>/dev/null || echo '{"entries":[]}')
\`\`\`

### Reading Working Memory

\`\`\`bash

# Primary: Read structured working memory from bridge

WORKING_JSON=$(bun run src/memory/bridge.ts read-working 2>/dev/null || echo '{"sections":[],"total_tokens":0,"status":"cleared"}')

# Fallback: Read WORKING.md directly

WORKING_CONTENT=$(cat .planning/WORKING.md 2>/dev/null || echo "")
\`\`\`

### Scored Procedure Recall

\`\`\`bash

# Primary: Scored recall via bridge (filters active, scores by relevance)

PROCEDURES_JSON=$(bun run src/memory/bridge.ts read-procedures --query="implement feature" --tags=api,coding --limit=5 2>/dev/null || echo '{"entries":[]}')

# Fallback: Read PROCEDURES.md directly

PROCEDURES_CONTENT=$(cat .planning/PROCEDURES.md 2>/dev/null || echo "")
\`\`\`

### Writing to Working Memory

\`\`\`bash

# Primary: Append finding via bridge (structured, validated)

bun run src/memory/bridge.ts append-working --section=findings --content="Found performance issue in X" 2>/dev/null || true

# Fallback: Append directly

echo "- Found performance issue in X" >> .planning/WORKING.md
\`\`\`

### Clearing Working Memory

\`\`\`bash

# Primary: Clear via bridge (creates fresh structured WORKING.md)

bun run src/memory/bridge.ts clear-working 2>/dev/null || true

# Fallback: Reset from template

cp .cursor/luca/templates/WORKING.md .planning/WORKING.md
\`\`\`

### Checking Context Usage

\`\`\`bash

# Get token usage across all memory files with quality zone

bun run src/memory/bridge.ts check-context 2>/dev/null

# Returns: {total_tokens, budget_tokens, usage_percent, zone, breakdown[]}

\`\`\`

## Token Savings

The memory bridge provides significant token savings compared to raw file reads:

| Operation           | Raw File                     | Bridge                     | Savings        |
| ------------------- | ---------------------------- | -------------------------- | -------------- |
| Read all memory     | ~23K tokens (full MEMORY.md) | ~2K tokens (compact index) | ~90%           |
| Filtered recall     | ~23K tokens                  | ~500 tokens (5 entries)    | ~98%           |
| Read working memory | Variable                     | Structured JSON            | Parsing effort |
| Procedure recall    | Full file                    | Top 5 scored entries       | ~80%           |

## Graceful Defaults

All bridge commands return sensible defaults when files don't exist:

- `read-memory` with no file: `{entries_count: 0, entries: []}`
- `read-working` with no file: `{sections: [], total_tokens: 0, status: "cleared"}`
- `read-procedures` with no file: `{active_count: 0, retired_count: 0, entries: []}`
- `check-context` always works (reports 0 tokens for missing files)

## Error Handling

All bridge commands use `2>/dev/null || ...` to gracefully fall back if:

- The bridge module is not available
- Memory files don't exist
- Any runtime error occurs

This ensures the workflow never breaks due to bridge issues.

## What the Bridge Does NOT Handle

- **BRAIN.md reads**: Use `cat .planning/BRAIN.md` directly (small file, needs full markdown)
- **MEMORY.md writes**: lu-learner agent handles this (requires LLM judgment for dedup, confidence)
- **PROCEDURES.md creation**: lu-learner handles procedure extraction
- **State machine operations**: Use `src/state-machine/bridge.ts` instead
