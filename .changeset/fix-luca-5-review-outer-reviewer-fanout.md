---
"@alecsibilia/luca-mastracode": patch
---

fix(luca:5-review): remove fenced block bug in reviewer spawn directive

- review.md Step 4: replaced ```` ``` ```` fenced code block with 5-line `// →` inline
  directive prose. Fenced blocks are treated as illustrative documentation by
  LLM agents, not executable instructions — root cause of all 4 outer reviewer
  subagents returning success:false with durationMs:0.
- Use Date.now() in correlationId pattern (was literal `<ts>` placeholder).
- Add success:false variant for complete records (was hardcoded true).
- reviewer.ts:107: "of the output block above" restores specificity (was "of
  your output" — ambiguous with two closing ```` ``` ```` in file).
- subagent-telemetry-prose.test.ts: add fence-split regression test + Date.now()
  reference test to prevent recurrence.

Closes #18
