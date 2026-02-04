# Model Profiles

Model profiles control which Claude model each Luca agent uses. This allows balancing quality vs token spend.

## Profile Definitions

| Agent | `quality` | `balanced` | `budget` |
|-------|-----------|------------|----------|
| lu-planner | opus | opus | sonnet |
| lu-roadmapper | opus | sonnet | sonnet |
| lu-executor | opus | sonnet | sonnet |
| lu-phase-researcher | opus | sonnet | haiku |
| lu-project-researcher | opus | sonnet | haiku |
| lu-research-synthesizer | sonnet | sonnet | haiku |
| lu-debugger | opus | sonnet | sonnet |
| lu-codebase-mapper | sonnet | haiku | haiku |
| lu-verifier | sonnet | sonnet | haiku |
| lu-plan-checker | sonnet | sonnet | haiku |
| lu-integration-checker | sonnet | sonnet | haiku |
| dx-advocate | sonnet | sonnet | haiku |
| code-simplifier | sonnet | sonnet | haiku |
| security-auditor | sonnet | sonnet | haiku |

## Profile Philosophy

**quality** - Maximum reasoning power

- Opus for all decision-making agents
- Sonnet for read-only verification
- Use when: quota available, critical architecture work

**balanced** (default) - Smart allocation

- Opus only for planning (where architecture decisions happen)
- Sonnet for execution and research (follows explicit instructions)
- Sonnet for verification (needs reasoning, not just pattern matching)
- Use when: normal development, good balance of quality and cost

**budget** - Minimal Opus usage

- Sonnet for anything that writes code
- Haiku for research and verification
- Use when: conserving quota, high-volume work, less critical phases

## Resolution Logic

Orchestrators resolve model before spawning:

```
1. Read .planning/config.json
2. Get model_profile (default: "balanced")
3. Look up agent in table above
4. Pass model parameter to Task call
```

## Switching Profiles

Runtime: `/lu-set-profile <profile>`

Per-project default: Set in `.planning/config.json`:

```json
{
  "model_profile": "balanced"
}
```

## Design Rationale

**Why Opus for lu-planner?**
Planning involves architecture decisions, goal decomposition, and task design. This is where model quality has the highest impact.

**Why Sonnet for lu-executor?**
Executors follow explicit PLAN.md instructions. The plan already contains the reasoning; execution is implementation.

**Why Sonnet (not Haiku) for verifiers in balanced?**
Verification requires goal-backward reasoning - checking if code *delivers* what the phase promised, not just pattern matching. Sonnet handles this well; Haiku may miss subtle gaps.

**Why Haiku for lu-codebase-mapper?**
Read-only exploration and pattern extraction. No reasoning required, just structured output from file contents.

**Why Sonnet/Haiku for code reviewers (dx-advocate, code-simplifier, security-auditor)?**
These agents read code and compare against known patterns (project standards, OWASP rules). Pattern matching with structured output. No architecture decisions. Sonnet in balanced for nuanced convention detection; Haiku in budget for high-volume review.
