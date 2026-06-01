---
"@alecsibilia/luca": patch
---

Reconcile the v13 agent roster so every agent a skill spawns actually ships, and restore the beneficial tooling the port dropped. Previously skills referenced a dozen v12 agents that don't exist in v13 (they fell back to generic read-only agents), and the verification tribunal / model-tier routing referenced dropped subsystems.

**New subagents (ported — genuinely reusable primitives):**
- `test-writer` — authors focused, non-vacuous tests and runs them; tests are first-class in v13 again, and the tribunal uses it to settle a dispute with an empirical repro.
- `debater` — stance-parameterized adversarial validator (DEFEND/CHALLENGE a proposition with calibrated confidence). The reusable primitive behind the verification tribunal and any decision that benefits from adversarial validation.

**Extended:** `reviewer` gains an `integration` perspective (cross-phase wiring), replacing the dropped `lu-integration-checker`.

**Verification tribunal** re-implemented on v13 agents: `debater` (defender/challenger) + `test-writer` (empirical repro) + `reviewer` (integration), with the orchestrator arbitrating by confidence-weighted majority. Used in phase-execute (diagnostic + root-cause tribunals) and milestone-audit (rebuttal round).

**Dropped agents folded into existing agents / inline orchestration** (no dangling spawns): `lu-research-synthesizer`→`researcher`; `lu-roadmapper`→inline `luca roadmap create` (matching milestone-new); `lu-discuss-researcher`→`researcher`; `lu-repo-architect`→`architect`; the roadmap-revision swarm (`lu-pm-planner`, `lu-roadmap-architect/prioritizer/qa/synthesizer`)→`architect`/`reviewer` role spawns; `lu-cognition` (pre-flight) and `lu-router` (complexity) → inline orchestrator steps; `lu-pm-planner` (session WSJF)→`architect`.

**Removed** the stale `resolveModelForAgent` / `model-routing.ts` prose across 6 skills — that module was never ported to v13; agent model tiers come from each agent's own definition / the harness default.

Net roster: 10 subagents (was 8) + 10 mode-agents. Every `subagent_type=` across all skills now resolves to a real v13 agent.
