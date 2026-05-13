---
"@alecsibilia/luca-mastracode": patch
---

Fix reviewer subagent usage self-report drift. reviewer-dx and reviewer-simpl perspectives did not emit the required usage comment because the instruction was buried in SUBAGENT_SHARED_PREFIX (prepended before reviewer-specific prose). Added reinforcing usage clarification as the terminal instruction in reviewer.ts (final bullet of the Constraints section) so it is the last directive the model reads before responding. Added presence + terminal-position test in subagent-telemetry-prose.test.ts to catch drift.
