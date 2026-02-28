---
id: 69-B
title: "Teams integration and session management"
phase: 69
wave: 2
depends_on: ["69-A"]
---

# Plan 69-B: Teams Integration and Session Management

## Objective

Add documentation connecting luca-subagents with luca-teams for team-based dispatch,
and verify the full integration works. Update the roadmap and create summaries.

## Tasks

### Task 1: Verify integration surface
- luca-teams.ts dispatches tasks with agent info
- luca-subagents.ts can create subagents using those same agent names
- The workflow: dispatch_team → read agent info → create subagents per team member

### Task 2: Final verification and documentation
- Full test suite passes
- TypeScript clean
- Build + drift check clean
- E2E tests cover new extension

## Verification
- All tests pass
- Build clean
