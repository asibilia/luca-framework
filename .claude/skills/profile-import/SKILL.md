# profile-import

Import learnings from the global memory profile (~/.luca/global-memory.json) into this project.

## main

# Profile Import

Import learnings from the global memory profile into this project's MEMORY.md.

**Arguments:** `[--from=project-name] [--dry-run]`

- **Default:** Import all entries from global memory, deduplicating against local entries
- `--from=project-name`: Only import entries from a specific source project
- `--dry-run`: Show what would be imported without writing any changes

---

## Process

1. **Load global memory profile:**

   ```bash
   GLOBAL_PROFILE=$(bun run src/memory/__helpers/bridge.ts read-global-memory 2>/dev/null || echo 'null')
   ```

   If null: report "No global memory profile found at ~/.luca/global-memory.json" and exit.

2. **Parse arguments:**
   - Check for `--from=` to filter by source project
   - Check for `--dry-run` flag

3. **Filter by source project (if --from specified):**
   - Only include entries where source_project matches the specified project name
   - Case-insensitive comparison

4. **Load local MEMORY.md:**

   ```bash
   LOCAL_MEMORY=$(bun run src/memory/__helpers/bridge.ts read-memory 2>/dev/null || echo '{"entries":[]}')
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

7. **Otherwise, write merged entries to MEMORY.md:**

   ```
   Imported {N} entries from global memory

   Categories: {breakdown}
   Source projects: {list}
   Entries skipped (duplicates): {N}

   Imported entries are tagged with [from: project-name] for traceability.
   ```

---

## Anti-Patterns

- Do NOT import without loading local MEMORY.md first (needed for deduplication)
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