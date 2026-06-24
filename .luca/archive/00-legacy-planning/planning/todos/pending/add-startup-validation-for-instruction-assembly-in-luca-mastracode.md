---
title: "Add startup validation for instruction assembly in luca-mastracode"
area: architecture
created: 2026-04-14
priority: medium
source: research
---

## Task

Add startup validation for instruction assembly in luca-mastracode

## Context

Research found that instruction assembly in luca-mastracode has no validation. If an instruction `.md` file is missing or `readFileSync` throws, the error only surfaces at request time (when the LLM makes its first call), not at startup. The `getAgentConstraints()` lazy singleton also has a timing dependency on `installRules()` — if called before rules are installed, it silently drops all `alwaysApply` rules for the entire session.

## Suggested Implementation

- Add a startup validation pass in `src/index.ts` after `installRules()` that calls `buildInstructions()` for each mode
- Check `result.length > 0` for each assembled instruction string
- Throw at startup (not request time) if any validation fails
- Optionally verify expected section headers are present

## MuninnDB Recall

For full research context, search MuninnDB for 'instruction-assembly-pipeline' or recall tag 'research'.
