# config-profile

Switch the model profile (quality/balanced/budget) for <%= branding.frameworkName %> agent delegation.

## main

<main>
# <%= branding.frameworkName %> Set Profile

Quick switch model profile for <%= branding.frameworkName %> agents.

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
| <%= branding.commandPrefix %>-planner | opus | opus | sonnet |
| <%= branding.commandPrefix %>-roadmapper | opus | sonnet | sonnet |
| <%= branding.commandPrefix %>-executor | opus | sonnet | sonnet |
| <%= branding.commandPrefix %>-phase-researcher | opus | sonnet | haiku |
| <%= branding.commandPrefix %>-project-researcher | opus | sonnet | haiku |
| <%= branding.commandPrefix %>-research-synthesizer | sonnet | sonnet | haiku |
| <%= branding.commandPrefix %>-verifier | sonnet | sonnet | haiku |
| <%= branding.commandPrefix %>-plan-checker | sonnet | sonnet | haiku |

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
   - /phase-plan
   - /phase-execute
   - /debug
   - All agent spawning commands
   ```

## Success Criteria

- [ ] Profile validated
- [ ] config.json updated
- [ ] User knows what changed

## Next Steps

Profile updated to `{profile}`. Takes effect on next agent invocation.

**Common follow-ups:**
- `/progress` — Continue your work
- `/config-settings` — Adjust other settings
</main>