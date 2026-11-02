# Sources and open questions

Part of [The Elephant-Goldfish Model, and what Luca can take from it](../elephant-goldfish-model.md).

## Sources

Primary (Google):

- google/elephant-goldfish-model, commit `05f8984` (2026-10-28): [README.md](https://github.com/google/elephant-goldfish-model/blob/main/README.md), [docs/getting_started.md](https://github.com/google/elephant-goldfish-model/blob/main/docs/getting_started.md), [docs/faq.md](https://github.com/google/elephant-goldfish-model/blob/main/docs/faq.md), [docs/designs/architecture.md](https://github.com/google/elephant-goldfish-model/blob/main/docs/designs/architecture.md), [docs/designs/review.md](https://github.com/google/elephant-goldfish-model/blob/main/docs/designs/review.md), [docs/designs/drift_report.md](https://github.com/google/elephant-goldfish-model/blob/main/docs/designs/drift_report.md), [skills/egm-review-loop/SKILL.md](https://github.com/google/elephant-goldfish-model/blob/main/skills/egm-review-loop/SKILL.md), [skills/egm-draft/SKILL.md](https://github.com/google/elephant-goldfish-model/blob/main/skills/egm-draft/SKILL.md), [agents/comprehension.md](https://github.com/google/elephant-goldfish-model/blob/main/agents/comprehension.md), [agents/synthesizer.md](https://github.com/google/elephant-goldfish-model/blob/main/agents/synthesizer.md), [resources/execution_instructions.md](https://github.com/google/elephant-goldfish-model/blob/main/resources/execution_instructions.md), [resources/document_standards/implementation-readiness-standard.md](https://github.com/google/elephant-goldfish-model/blob/main/resources/document_standards/implementation-readiness-standard.md).
- Dave Rensin, [Elephants, Goldfish and the New Golden Age of Software Engineering](https://drensin.medium.com/elephants-goldfish-and-the-new-golden-age-of-software-engineering-c33641a48874) (Medium, 2026). Listed by Google Research: [research.google/pubs/...](https://research.google/pubs/elephants-goldfish-and-the-new-golden-age-of-software-engineering/).

Secondary (context only, not relied on for claims about the model):

- Help Net Security, [Google open-sources the Elephant-Goldfish Model plugin](https://www.helpnetsecurity.com/2026/10/26/google-elephant-goldfish-model-plugin/) (2026-10-26).

Luca:

- `GLOSSARY.md`; wayfinder map #325; issues #333, #338, #541, #641, #655.
- `packages/engine/docs/how-a-run-moves.md`, `ticket-review.md`, `final-review.md`, `crash-recovery.md`, `memory.md`, `choices-made.md`.
- `packages/engine/src/intake/intake-checks.ts`, `src/intake/criteria-checks.ts`, `src/agents/role-prompts.ts`, `src/agents/reviewer-instructions.ts`, `src/agents/common-instructions.ts`, `src/core/pull-request-text.ts`, `src/cli/init.ts`.
- The `to-spec` and `to-tickets` skills from `mattpocock/skills`, as installed in `~/.claude/skills/`.

## Confidence / open questions

- **High** on what EGM is. The repo and the essay agree, and the repo's own design docs state the roles and the loop.
- **The question's framing is off.** No source describes goldfish agents that *execute* small tasks. In EGM, goldfish only review (docs, and in brainstorm, ideas). The nearest thing is Rensin's Step 8: a fresh session implements from the doc. Luca's per-ticket fresh agents are that idea built out. They are Luca's design, not EGM's.
- **Unverified.** "Thousands of Google engineers" is Google's own claim (README line 16). The repo shows no data on review precision. `test_scenarios.yaml` benchmarks are named in [review.md](https://github.com/google/elephant-goldfish-model/blob/main/docs/designs/review.md), lines 182-188, but this note did not read their results.
- **Open.** How many of Luca's assumptions a spec check would really catch. Rec. 2 measures it before rec. 1's cost is proven. Running rec. 1 by hand on two or three past specs (#510, #641) and checking its findings against those runs' journals would answer it cheaply.
- **Open.** Whether `/to-spec`'s "no file paths" rule costs Luca anything. The codebase reader in rec. 1 would show whether specs name seams that don't exist.
- **Not checked.** EGM's brainstorm "6-lens swarm" personas, its bootstrap design, and its Claude Code harness notes (`docs/claude.md`) were skimmed or not read. None bear on the engine.
