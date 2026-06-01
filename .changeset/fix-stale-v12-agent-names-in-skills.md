---
"@alecsibilia/luca": patch
---

Fix skills spawning non-existent v12 agent names. The mastracode→luca-tools port renamed the agents (dropped the `lu-` prefix, consolidated reviewers into one `reviewer` subagent) but the skill bodies still used the old names — so `/lu` and friends spawned `subagent_type="lu-executor"`, `"lu-verifier"`, `"lu-phase-researcher"`, `"code-architect"`, etc., which don't resolve to any installed v13 agent. Claude Code then fell back to a generic/read-only agent that lacked the real agent's tools and instructions, which is why subagents "couldn't write" their own artifacts and the orchestrator had to persist everything.

Renamed across all skills (both `subagent_type=` spawn values and imperative prose): `lu-executor`→`executor`, `lu-verifier`→`verifier`, `lu-learner`→`learner`, `lu-phase-researcher`/`lu-project-researcher`→`researcher`, `lu-plan-checker`→`plan-reviewer`, and the per-perspective reviewers (`code-architect`/`dx-advocate`/`code-simplifier`/`security-auditor`/`ui`)→`reviewer` (perspective passed in the prompt).

Resolved in this PR (agent-roster reconciliation): the tribunal pattern is re-implemented as the `debater` subagent (defend/challenge) plus the `integration` reviewer perspective; `test-writer` is restored as a first-class subagent; roadmap creation is handled inline by the orchestrator via `luca roadmap create`; and the stale `resolveModelForAgent`/`model-routing.ts` prose is removed (model tiers come from each agent's own definition in v13). No v12 agent names remain unaccounted for.
