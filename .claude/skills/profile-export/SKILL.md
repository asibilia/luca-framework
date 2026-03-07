# profile-export

Export portable learnings from this project to the global memory profile (~/.luca/global-memory.json).

## main

# Profile Export

Export portable learnings from this project to the global memory profile for cross-project knowledge transfer.

**Arguments:** `[--include-decisions] [--min-confidence=medium]`

- **Default:** Exports patterns, preferences, and pitfalls with medium+ confidence
- `--include-decisions`: Also include decision entries (project-specific by default)
- `--min-confidence=low|medium|high`: Minimum confidence threshold (default: medium)

---

## Process

1. **Read BRAIN.md and MEMORY.md:**

   ```bash
   BRAIN_JSON=$(bun run src/memory/__helpers/bridge.ts read-brain 2>/dev/null || echo '{}')
   MEMORY_JSON=$(bun run src/memory/__helpers/bridge.ts read-memory 2>/dev/null || echo '{"entries":[]}')
   ```

2. **Parse arguments:**
   - Check for `--include-decisions` flag
   - Check for `--min-confidence=` value
   - Build export options accordingly

3. **Call exportToGlobalMemory:**
   - Uses the export options from arguments
   - Creates ~/.luca/ directory if needed
   - Merges with existing global memory (deduplicates by ID and title)

4. **Report results:**

   ```
   Profile exported to ~/.luca/global-memory.json

   Categories: patterns, preferences, pitfalls
   Entries exported: {N}
   Entries skipped (duplicates): {N}
   Min confidence: {level}

   The global profile can be imported into other projects with /profile-import.
   ```

---

## Anti-Patterns

- Do NOT export without reading BRAIN.md first (source_project comes from brain)
- Do NOT overwrite existing global memory -- always merge and deduplicate
- Do NOT include decisions unless explicitly requested (they are project-specific)

---

## Success Criteria

- [ ] BRAIN.md and MEMORY.md loaded successfully
- [ ] Export options applied from arguments
- [ ] Global memory file created or updated at ~/.luca/global-memory.json
- [ ] Entries tagged with source_project for provenance tracking
- [ ] Duplicate entries skipped correctly
- [ ] User sees summary of what was exported