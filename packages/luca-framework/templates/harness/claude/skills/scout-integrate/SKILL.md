# scout-integrate

Perform cross-cutting integration analysis on batch of READY articles and route based on verdicts.

## main

# Scout Integrate

Sub-skill for Step 6 of the scout pipeline (cross-cutting batch).

## Arguments

- slugs: List of READY article slugs
- impact_paths: List of impact document paths for READY articles

## Process


1. Spawn <%= branding.commandPrefix %>-scout-integrator agent with all impact document paths
2. Wait for completion
3. Read the integration analysis document for per-scout verdicts
4. For each scout verdict:
   - **integrate**: Advance state to INTEGRATION_ANALYZED, continue to todo generation
   - **defer**: Create deferred document in docs/scouting/deferred/{date}-{slug}.md, advance state to DEFERRED
   - **conflict**: Create manual-review document with conflict annotation, advance state to CONFLICTING

## Deferred Document

Must include:
- Links to original digest and impact documents
- Why Deferred (from integration analysis reasoning)
- Conditions to Revisit (specific, actionable criteria)
- Value If Implemented (from impact document)

## Conflict Document

Must include:
- The new recommendation from the scout
- The existing todo(s) that conflict
- Why they conflict (from integration analysis)
- Suggestion for resolution

## Output

Return summary of verdicts: N integrated, N deferred, N conflicting.