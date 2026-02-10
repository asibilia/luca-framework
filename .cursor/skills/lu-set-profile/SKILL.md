---
name: "lu-set-profile"
description: "Quick switch model profile for Luca agents. Use when user wants to change model profile, mentions /lu-set-profile, or needs to adjust cost/quality tradeoff."
disable-model-invocation: true
---

<main>
<main>
# Luca Set Profile

Quick switch model profile for Luca agents.

**Arguments:** `<profile>` (quality | balanced | budget)

## Profiles

| Profile | Description |
|---------|-------------|
| **quality** | Opus everywhere except verification — higher cost, deeper analysis |
| **balanced** | Opus for planning, Sonnet for execution — good balance (default) |
| **budget** | Sonnet for writing, Haiku for research/verification — lowest cost |

## Model Mapping

| Agent | quality | balanced | budget |
|-------|---------|----------|--------|
| lu-planner | opus | opus | sonnet |
| lu-roadmapper | opus | sonnet | sonnet |
| lu-executor | opus | sonnet | sonnet |
| lu-phase-researcher | opus | sonnet | haiku |
| lu-project-researcher | opus | sonnet | haiku |
| lu-research-synthesizer | sonnet | sonnet | haiku |
| lu-verifier | sonnet | sonnet | haiku |
| lu-plan-checker | sonnet | sonnet | haiku |

## Process

1. **Validate profile:**
   - Must be one of: quality, balanced, budget
   - Error with usage if invalid

2. **Update config:**

   ```bash
   # Update model_profile in config.json
   ```

3. **Confirm:**

   ```
   ✓ Model profile set to: {profile}
   
   Applies to:
   - /lu-plan-phase
   - /lu-execute-phase
   - /lu-debug
   - All agent spawning commands
   ```

## Success Criteria

- [ ] Profile validated
- [ ] config.json updated
- [ ] User knows what changed

## Next Steps

Profile updated to `{profile}`. Takes effect on next agent invocation.

**Common follow-ups:**
- `/lu-progress` — Continue your work
- `/lu-settings` — Adjust other settings
</main>
</main>