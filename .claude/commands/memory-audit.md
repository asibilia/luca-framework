---
name: memory-audit
description: Paginated LLM-judged retro-pass over a MuninnDB vault — classify trust tiers, write a resumable cursor, emit a per-run report.
---

# /memory-audit

Activate the `memory-audit` skill to run a paginated, LLM-judged retro-pass over a MuninnDB vault: classify each memory's trust tier (inferred vs. verified), write a resumable cursor so a long audit can be continued across runs, and emit a per-run report.

Run the `memory-audit` skill now. Optional arguments (`--dry-run` default, `--apply`, `--vault <name>`, `--resume`, `--limit <n>`, `--auto`):

$ARGUMENTS
