# scout-graduate

Capture high-value scouting findings as MuninnDB engrams for long-term framework memory.

## main

# Scout Graduate

Sub-skill for Step 8 of the scout pipeline (cross-cutting batch).

## Arguments

- integrated_slugs: List of integrated scout slugs
- deferred_slugs: List of deferred scout slugs (also get engrams)
- digest_paths: Map of slug to digest path
- impact_paths: Map of slug to impact path

## Vault Resolution

Scout engrams go to the REPO vault (project-scoped):

\`\`\`bash
REPO_VAULT=$(cat .planning/config.json 2>/dev/null | grep -o '"vault"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"')
\`\`\`

## Process


For each scout (integrated AND deferred):

1. Read digest and impact documents
2. Extract key findings worth preserving as long-term memory
3. Score each finding: confidence * 0.40 + actionability * 0.35 + uniqueness * 0.25
4. Only graduate findings above 0.55 threshold
5. Store as MuninnDB engrams using muninn_remember:

### Concept Prefix Mapping

- scout:technique-{slug} -- Novel techniques discovered (what the article taught us)
- scout:pattern-{slug} -- Patterns applicable to framework (how to apply it)
- scout:decision-{slug} -- Integration decisions made (why we chose integrate/defer/conflict)

### Deferred Items

Deferred decisions are ESPECIALLY important to capture:
- Store the deferral reasoning and conditions-to-revisit
- Future milestone planning can recall these to reassess

### Engram Linking

Link related engrams:
- Link scout:technique-X to scout:decision-X (technique informs decision)
- Link scout:pattern-X to existing pattern:* engrams (if related patterns exist)

## Output

After graduation:
1. Advance all graduated scouts to MEMORY_CAPTURED
2. Report: N engrams created, N below threshold (skipped), N linked