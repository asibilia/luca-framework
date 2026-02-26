---
title: Pi Library Integration — New Output Target & Extensions
area: framework
created: 2026-02-26
source: conversation
---

## Context

Building out the foundation of the Luca framework to work with the Pi library (https://pi.dev/). Pi is an agentic coding platform similar to Claude Code and Cursor, and Luca needs to support it as a first-class output target alongside the existing `.claude/` and `.cursor/` outputs.

## Task

### Research Phase

- Study the Pi library platform (https://pi.dev/) — understand its extension model, configuration, and agentic capabilities
- Analyze the reference repo https://github.com/disler/pi-vs-claude-code for learnings on Pi vs Claude Code differences and extension patterns
- Catalog the extensions built in the reference repo and identify which map to existing Luca capabilities and which are net-new features

### Architecture Phase

- Design a new `/.pi` output directory structure (analogous to `/.claude` and `/.cursor`)
- Define what Pi extensions are needed to replicate Luca's existing functionality (rules, hooks, skills, memory, state)
- Identify gaps — features Pi supports that Claude Code/Cursor don't, and vice versa
- Plan the compiler/generator additions in `src/compilers/` to emit Pi-compatible output

### Implementation Phase

- Add Pi as a new output target in the Luca compiler pipeline
- Create Pi-specific extensions that integrate with the Luca framework (rules, hooks, skills, memory bridge)
- Build extensions inspired by the reference repo's patterns
- Ensure cross-platform parity: features available in Claude Code/Cursor should also work in Pi where possible

### Verification Phase

- Test Pi extensions work correctly with the Pi runtime
- Validate that existing Claude Code and Cursor outputs are unaffected
- Document the new Pi integration in project docs

## Notes

- This is a large feature set — will likely span multiple phases/plans
- Key differentiator: Pi has its own extension model that differs from Claude Code hooks and Cursor rules
- The reference repo (disler/pi-vs-claude-code) contains practical examples of Pi extensions that can serve as templates
- Must maintain the framework's platform-agnostic philosophy — Pi is an additional target, not a replacement
- Consider adding Pi-specific entries to the complexity gating matrix if Pi verification steps are needed
