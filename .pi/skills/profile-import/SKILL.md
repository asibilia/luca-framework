---
name: profile-import
description: Import learnings from the global memory profile (~/.luca/global-memory.json) into this project.
---

# profile-import

Import learnings from the global memory profile (~/.luca/global-memory.json) into this project.

## main

# Profile Import

Import learnings from the global memory profile into this project's MuninnDB.

**Arguments:** `[--from=project-name] [--dry-run]`

## Vault Resolution

Read `.planning/config.json` and extract `muninn.vault` as REPO_VAULT. Set DEFAULT_VAULT = "default".

\`\`\`bash
REPO_VAULT=$(cat .planning/config.json 2>/dev/null | grep -o '"vault"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"')
if [ -z "$REPO_VAULT" ]; then
  REPO_VAULT=${LUCA_MUNINN_VAULT:-default}
fi
DEFAULT_VAULT="default"
\`\`\`

Use REPO_VAULT for project-scoped operations (brain:project, session, local memory) and DEFAULT_VAULT for cross-cutting operations (global patterns, brain:user).

- **Default:** Import all entries from global memory, deduplicating against local entries
- `--from=project-name`: Only import entries from a specific source project
- `--dry-run`: Show what would be imported without writing any changes

---

## Process

1. **Load global memory profile from MuninnDB:**

   ```
   GLOBAL_PROFILE = mcp__muninn__muninn_recall(vault: DEFAULT_VAULT, context: "global memory patterns from other projects")
   ```

   If empty: report "No global memory profile found in MuninnDB" and exit.

2. **Parse arguments:**
   - Check for `--from=` to filter by source project
   - Check for `--dry-run` flag

3. **Filter by source project (if --from specified):**
   - Only include entries where source_project matches the specified project name
   - Case-insensitive comparison

4. **Load local project memory from MuninnDB:**

   ```
   LOCAL_MEMORY = mcp__muninn__muninn_recall(vault: REPO_VAULT, context: "all project memory entries for deduplication")
   ```

5. **Merge entries:**
   - Deduplicate by ID and normalized title (case-insensitive)
   - Local entries always take precedence over global entries
   - Tag imported entries with their source_project

6. **If --dry-run:**

   ```
   Dry run: would import {N} entries from global memory

   Entries to import:
   - [{category}] {title} (from: {source_project})
   - [{category}] {title} (from: {source_project})
   ...

   Entries skipped (duplicates): {N}

   Run without --dry-run to apply changes.
   ```

7. **Otherwise, write merged entries to MuninnDB using batch import:**

   ```
   mcp__muninn__muninn_remember_batch(vault: REPO_VAULT, memories: [{concept, content, type, summary, entities}...])
   ```

   Report results:

   ```
   Imported {N} entries from global memory

   Categories: {breakdown}
   Source projects: {list}
   Entries skipped (duplicates): {N}

   Imported entries are tagged with [from: project-name] for traceability.
   ```

---

## Anti-Patterns

- Do NOT import without loading local project memory from MuninnDB first (needed for deduplication)
- Do NOT replace local entries with global entries (local always takes precedence)
- Do NOT import without deduplication (would accumulate duplicates over time)
- Do NOT modify global memory during import (global memory is read-only during import)

---

## Success Criteria

- [ ] Global memory profile loaded from ~/.luca/global-memory.json
- [ ] Filter by source project works when --from is specified
- [ ] Dry run mode shows preview without writing
- [ ] Deduplication by ID and title prevents duplicates
- [ ] Local entries always take precedence
- [ ] Imported entries tagged with source_project
- [ ] User sees summary of import results