---
title: "Scout: Create workflow documentation"
area: scouting
created: 2026-03-28
source: conversation
tags: [scout, docs, phase-4]
---

## Context

The scouting pipeline is a new major workflow that needs comprehensive documentation for both human users and AI agents.

## Task

Create documentation artifacts:

1. **`docs/scouting/README.md`** — User-facing guide:
   - What the scouting pipeline does
   - How to drop links in inbox.md
   - How to run `/scout` and its variants (`--review`, `--deferred`)
   - Status lifecycle explanation (with state diagram)
   - How to interpret output documents (digests, impact analyses, integration analyses)
   - How deferred items feed back into milestone planning

2. **Agent documentation** — JSDoc on all new agents and skills per mandatory-documentation rule:
   - Complete parameter descriptions
   - Return type documentation
   - Usage examples
   - Error handling documentation

3. **Update AGENTS.md** — Add scout agents to the agent inventory if applicable

4. **Update existing skill documentation** — If `/scout` integrates with other skills (milestone-new, etc.), document the integration points

## Notes

- README.md should include a visual pipeline diagram (ASCII or mermaid)
- State lifecycle diagram showing all transitions including terminal states
- Document the anti-step-skipping enforcement: why the state machine exists, how it prevents skipping
- Include examples of each document type (digest, impact, deferred, manual-review)
