---
name: profile-export
description: Export portable learnings from this project to the global memory profile (~/.luca/global-memory.json).
disable-model-invocation: true
---

<main>
# Profile Export

Export portable learnings from this project to the global memory profile for cross-project knowledge transfer.

**Arguments:** `[--include-decisions] [--min-confidence=medium]`

- **Default:** Exports patterns, preferences, and pitfalls with medium+ confidence
- `--include-decisions`: Also include decision entries (project-specific by default)
- `--min-confidence=low|medium|high`: Minimum confidence threshold (default: medium)

---

## Vault Resolution

Read `.planning/config.json` and extract `muninn.vault` as REPO_VAULT. Set DEFAULT_VAULT = "default".

\`\`\`bash
REPO_VAULT=$(cat .planning/config.json 2>/dev/null | grep -o '"vault"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"')
if [ -z "$REPO_VAULT" ]; then
  REPO_VAULT=${LUCA_MUNINN_VAULT:-default}
fi
DEFAULT_VAULT="default"
\`\`\`

Use REPO_VAULT for project-scoped operations (brain:project, session, project patterns) and DEFAULT_VAULT for cross-cutting operations (brain:user, global patterns).

## Process

1. **Read project identity and memory from MuninnDB:**

   ```
   # Recall project brain (identity, conventions)
   mcp__muninn__muninn_recall_tree(vault: REPO_VAULT, id: "brain:project-identity")

   # Recall all project memory entries
   mcp__muninn__muninn_recall(vault: REPO_VAULT, context: "all project patterns, decisions, pitfalls, and preferences")
   ```

2. **Parse arguments:**
   - Check for `--include-decisions` flag
   - Check for `--min-confidence=` value
   - Build export options accordingly

3. **Export to MuninnDB global graph:**

   ```
   mcp__muninn__muninn_export_graph(vault: REPO_VAULT)
   ```

   - Exports the full memory graph for cross-project transfer
   - Deduplicates by entity and concept

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

- Do NOT export without loading project identity first (source_project comes from brain:* in MuninnDB)
- Do NOT overwrite existing global memory -- always merge and deduplicate
- Do NOT include decisions unless explicitly requested (they are project-specific)

---

## Success Criteria

- [ ] Project identity and memory loaded successfully from MuninnDB
- [ ] Export options applied from arguments
- [ ] Global memory file created or updated at ~/.luca/global-memory.json
- [ ] Entries tagged with source_project for provenance tracking
- [ ] Duplicate entries skipped correctly
- [ ] User sees summary of what was exported
</main>