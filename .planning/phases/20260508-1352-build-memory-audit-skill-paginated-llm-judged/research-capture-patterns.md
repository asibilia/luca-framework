# Research Capture — Implementation Patterns

**Subagent**: researcher
**Perspective**: patterns
**Timestamp**: 2026-05-08T17:53Z

## Findings

### Frontmatter
- Two patterns: full (`name`+`description`, luca-init/gh-prepare) vs description-only (arch-audit).
- Use full when complex invocation conditions exist.

### Phase/Step Numbering
- luca-init: `## Phase N — Name`
- gh-prepare: `### N. Name`
- arch-audit: `## Step N: Name`
- Recommend `## Step N — Name` for memory-audit.

### ask_user Pattern
- Always preceded by oversight check: skip if `state.oversight === "full-auto"`.
- Abort branch: explicit "Write nothing. Stop the skill." prose.
- Options array with label + description.

### MuninnDB Calls
- Recall on entry: `mcp__muninn__muninn_recall(vault, context[], tags[], limit)`.
- Remember + trust (verified): `<!-- Tier: verified -->` HTML comment immediately before code block, then `muninn_remember` then `muninn_trust(id, "verified", vault)`.
- Inferred remember: `<!-- Tier: inferred -->` marker, no trust followup.
- Batch always inferred (per memory-tier-discipline.ts:18).
- op_id idempotency: only luca-init uses, and only because tool emits it. Skill shouldn't construct unless deliberate.

### Slash Command Shim
```yaml
---
name: memory-audit
description: One-liner
---

Activate the `memory-audit` skill. Optional args:

$ARGUMENTS
```

### State JSON Persistence
- `atomicWriteSync` (util/atomic-write.ts:8-14) — writeFileSync to .tmp + renameSync (POSIX-atomic).
- Used by `luca-store.ts:182`, `pipeline-lock.ts:187,210`.
- Skill should NOT use atomicWriteSync directly — invoke via writePlanningFileTool.
- BUT: writePlanningFileTool uses non-atomic writeFileSync. Tradeoff: cursor state vulnerable to crash mid-write. Mitigation: write cursor AFTER trust calls succeed (idempotent retry on next run).

### Report Markdown Structure
- review.md REVIEW-{wave}.md table format:
  ```
  # Memory Audit — {ISO}
  ## Summary
  ## Judgments
  | id | concept | previous | proposed | rationale |
  ## Totals
  ```

### Vault Resolution in Skills
- One-liner: `Vault from .planning/config.json → muninn.vault, fallback "default".`
- Don't duplicate full prose — SUBAGENT_SHARED_PREFIX handles ambient context.

### Tier Markers
- `<!-- Tier: X -->` HTML comment on line immediately before code fence.
- `memory-tier-callsite.test.ts` scans `skills/**` and enforces.

### Paginated Walks
- ZERO precedent for `muninn_list`/`get_enrichment_candidates` in framework.
- memory-audit will be first. Define cursor loop pattern explicitly.
