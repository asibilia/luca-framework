---
"@alecsibilia/luca": patch
---

Fix unresolvable `subagent_type` references in shipped skills.

Claude Code resolves agent types by **normalized display name only** (`executor` → `Executor`, `plan-reviewer` → `Plan Reviewer`); frontmatter `id` is not consulted. Three values used by the shipped skills never matched any installed agent's name:

- `subagent_type="reviewer"` (12 sites) → `"Code Reviewer"`
- `subagent_type="architect"` (2 sites) → `"luca: Architect"`
- `subagent_type="debater"` (2 sites) → `"Adversarial Debater"`

This is how pipeline sessions ended up spawning the orphaned v12 shadow agents (`luca-executor`, `luca-planner`): when the correct spawn failed to resolve, the model fell back to the v12 files whose descriptions explicitly advertise themselves for the skill (e.g. "Invoked by /phase-execute") — and broke entirely once `luca doctor --fix` removed those shadows. With the references fixed, the v12 shadows are now truly inert and safe to prune.

Verified empirically: all remaining `subagent_type` values resolve against the v13 roster via the normalization rule.
