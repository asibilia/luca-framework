# The Elephant-Goldfish Model, and what Luca can take from it

Research note, 2026-10-28. Primary source: Google's open-source repo
[google/elephant-goldfish-model](https://github.com/google/elephant-goldfish-model)
(read at commit `05f8984`, 2026-10-28) and the essay it is built on, Dave
Rensin's
[Elephants, Goldfish and the New Golden Age of Software Engineering](https://drensin.medium.com/elephants-goldfish-and-the-new-golden-age-of-software-engineering-c33641a48874),
which Google Research lists as a publication
([research.google](https://research.google/pubs/elephants-goldfish-and-the-new-golden-age-of-software-engineering/)).
Luca line numbers are from `origin/main` at `1722024` (engine 14.0.0-alpha.25).
The local `main` checkout was behind it when this was written.

## TL;DR

- **The goldfish is a reviewer, not a worker.** In Google's model the Elephant is a long, deep-context session that writes a design doc with you. Goldfish are fresh, read-only sessions that test that doc *before any code*. The "goldfish agents run small tasks" framing is not in the sources. Implementation is out of EGM's scope.
- **Luca is the half EGM leaves out.** EGM stops at "tell AI to build to the plan". Luca builds the plan with fresh agents per ticket, gates, ticket reviews, and a final review. On the build side, Luca already goes further than EGM.
- **Luca's biggest gap is before the run.** No model reads the spec cold before agents start. Intake checks structure and placeholders in plain code only. Luca's own runs show the cost: 64 assumptions across 3 tickets (#541), and 100+ per run (#655).
- **Top recommendation: a goldfish spec check.** Before a spec gets `ready-for-agent`, a fresh, read-only agent paraphrases the spec and lists the decisions it leaves to the implementer. Start it as a Luca skill, not an engine step.
- **Don't copy the parts built for a human at the keyboard.** One question at a time, consensus gates, a zero-decision hard gate, and file lists in specs don't fit an unattended engine or the `/to-spec` template.

## Pages

- [The model (from the sources)](elephant-goldfish/the-model.md)
- [Luca today, gaps and recommendations](elephant-goldfish/luca-gaps.md)
- [Sources and open questions](elephant-goldfish/sources.md)
