# Model Profiles

Model profiles control which Claude model each <%= branding.frameworkName %> agent uses. This allows balancing quality vs token spend.

## Profile Definitions

| Agent | `quality` | `balanced` | `budget` |
|-------|-----------|------------|----------|
| <%= branding.commandPrefix %>-planner | opus | opus | sonnet |
| <%= branding.commandPrefix %>-roadmapper | opus | sonnet | sonnet |
| <%= branding.commandPrefix %>-executor | opus | sonnet | sonnet |
| <%= branding.commandPrefix %>-phase-researcher | opus | sonnet | haiku |
| <%= branding.commandPrefix %>-project-researcher | opus | sonnet | haiku |
| <%= branding.commandPrefix %>-research-synthesizer | sonnet | sonnet | haiku |
| <%= branding.commandPrefix %>-debugger | opus | sonnet | sonnet |
| <%= branding.commandPrefix %>-repo-mapper | sonnet | haiku | haiku |
| <%= branding.commandPrefix %>-verifier | sonnet | sonnet | haiku |
| <%= branding.commandPrefix %>-plan-checker | sonnet | sonnet | haiku |
| <%= branding.commandPrefix %>-integration-checker | sonnet | sonnet | haiku |
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

Runtime: `/<%= branding.commandPrefix %>-set-profile <profile>`

Per-project default: Set in `.planning/config.json`:

```json
{
  "model_profile": "balanced"
}
```

## Design Rationale

**Why Opus for <%= branding.commandPrefix %>-planner?**
Planning involves architecture decisions, goal decomposition, and task design. This is where model quality has the highest impact.

**Why Sonnet for <%= branding.commandPrefix %>-executor?**
Executors follow explicit PLAN.md instructions. The plan already contains the reasoning; execution is implementation.

**Why Sonnet (not Haiku) for verifiers in balanced?**
Verification requires goal-backward reasoning - checking if code *delivers* what the phase promised, not just pattern matching. Sonnet handles this well; Haiku may miss subtle gaps.

**Why Haiku for <%= branding.commandPrefix %>-repo-mapper?**
Read-only exploration and pattern extraction. No reasoning required, just structured output from file contents.

**Why Sonnet/Haiku for code reviewers (dx-advocate, code-simplifier, security-auditor)?**
These agents read code and compare against known patterns (project standards, OWASP rules). Pattern matching with structured output. No architecture decisions. Sonnet in balanced for nuanced convention detection; Haiku in budget for high-volume review.
