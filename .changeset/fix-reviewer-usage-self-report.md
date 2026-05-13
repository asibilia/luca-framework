---
"@alecsibilia/luca-mastracode": patch
---

Fix reviewer subagent usage self-report drift. reviewer-dx and reviewer-simpl perspectives did not emit the required usage comment because the instruction was buried in SUBAGENT_SHARED_PREFIX (prepended before reviewer-specific prose). Added explicit usage instruction inside reviewer.ts Output Format section to ensure it's the final line of response. Added presence test in subagent-telemetry-prose.test.ts to catch drift.
