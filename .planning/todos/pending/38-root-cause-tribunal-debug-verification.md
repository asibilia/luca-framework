---
title: Add Root Cause Tribunal for debug fix validation
area: framework/agents
created: 2026-03-02
source: conversation — debate-pattern-review team research (agent-analyst + skill-auditor)
---

## Context

When lu-debugger proposes a fix for a bug, the fix goes through verification — but currently the verifier only checks if the fix resolves the symptom, not whether it addresses the actual root cause. Two researchers identified this as a debate opportunity where lu-verifier should independently challenge lu-debugger's diagnosis.

## Task

Add a Root Cause Tribunal that activates after debugging:

1. **Trigger:** lu-debugger proposes fix for root cause X
2. **Challenge round:**
   - lu-verifier independently reproduces original bug
   - lu-verifier tests if fix resolves it
   - lu-verifier checks for side effects
   - lu-verifier challenges: "Is this treating the symptom or the cause?"
3. **If disagreement:**
   - Debugger defends with evidence (stack trace, reproduction steps)
   - Verifier presents counterargument
   - Resolution: verified fix OR "needs deeper investigation"

### Example scenario

- Button-save failure → debugger1 says "API endpoint missing", debugger2 says "validation blocks submit"
- Tribunal resolves: validation blocks submit, API endpoint exists but is never reached

### Token cost

- +20-30k tokens per complex failure set
- Gate: COMPLEX+ phases with multi-issue debugging only

## Notes

- Skill-auditor noted this in the `verify` skill audit
- Agent-analyst proposed this as "Pattern 3: Root Cause Tribunal"
- Current agents: `src/agents/luca/lu-debugger.agent.ts`, `src/agents/luca/lu-verifier.agent.ts`
- Lower priority than Design Tribunal (#36) and Verification Tribunal (#37)
