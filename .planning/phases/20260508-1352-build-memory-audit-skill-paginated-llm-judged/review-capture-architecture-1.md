# Review Capture — Architecture [Wave 1]

**Subagent**: reviewer
**Perspective**: architecture
**Verdict**: REQUEST_CHANGES

## MUST-FIX (2)
- **ARCH-1** [test gap, T4 weakness] memory-audit.test.ts:106 uses `/mcp__muninn__muninn_remember\s*\(/` (call-form). Plan PLAN.md:49 + RESEARCH.md:87 specify word-boundary `\b`. Fix: `expect(outside).not.toMatch(/mcp__muninn__muninn_remember\b/)`.
- **ARCH-2** [missing test] D15 cross-vault abort prose at SKILL.md:85 has no regression test. Add: `expect(content).toContain('"vault"'); expect(content).toMatch(/abort.*vault|vault.*abort/i)`.

## SHOULD-FIX (2)
- **ARCH-S1** writePlanningFile vs writePlanningFileTool naming inconsistency (SKILL.md:153 vs PLAN G-ARCH-001).
- **ARCH-S2** 24-hour idempotency gap — `complete:true` won't visit memories added after the snapshot. Add note in Step 1.3 / Step 6.

## NOTE
- Fence test correctly implemented; D2/D8/D9 verified clean; slash-shim D12 compliant.
