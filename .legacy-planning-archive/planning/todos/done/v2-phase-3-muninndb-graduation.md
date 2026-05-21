---
title: "v2 Phase 3: MuninnDB Graduation — research files to semantic memory"
area: agents
created: 2026-03-23
source: docs/workflow-system/v2/06-implementation-plan/phased-rollout.md
---

## Context

Graduation bridges ephemeral research files and MuninnDB engrams. Verified findings become `research:*` engrams that executors recall per-task. This is the hinge between the research world (files) and execution world (MuninnDB).

## Task

Create the graduator agent + skill + vault routing updates:

### New Files (2)

- `src/agents/general/lu-research-graduator.agent.ts` — distill research to MuninnDB engrams
- `src/skills/general/phase-graduate.skill.ts` — graduation orchestration

### Modified Files (4)

- `src/agents/__helpers/build-agent-registry.ts` — register graduator
- `src/skills/__helpers/build-skill-registry.ts` — register `phase-graduate` skill
- `src/complexity/__helpers/model-routing.ts` — add ORCHESTRATOR preset for graduator
- `.claude/rules/vault-routing.md` — add `research:*` to write routing table
- `~/.claude/rules/vault-guard.md` — mirror `research:*` routing in global guard

### Key Decisions

- Decision 4: `research:*` namespace with deferred promotion (research:approach-_, research:api-_, research:pitfall-_, research:constraint-_, research:decision-_, research:pattern-_)
- Decision 5: Weighted sum scoring: `score = confidence * 0.40 + actionability * 0.35 + uniqueness * 0.25`, threshold 0.55
- Decision 6: Actionability scoring criteria (1.0=specific code, 0.8=tech choice, 0.3=general strategy, 0.1=informational)
- Decision 10: ORCHESTRATOR preset
- Decision 21: Clean up `research:*` after phase completion (lu-learner promotes, then muninn_forget)
- Decision 24: Archive research files after graduation (move to research/archive/)

### Graduation Rules

- HIGH confidence: always graduate
- MEDIUM confidence: graduate with annotation
- LOW/UNVERIFIED: do NOT graduate, document in GRADUATION-REPORT.md
- Deduplicate across files (keep highest confidence, most specific)
- Link related engrams (approach->pattern, pitfall->approach, api->approach)
- All `research:*` engrams go to REPO vault (not default)

### Verification

- Graduator + skill pass `bunx --bun tsc --noEmit`
- GRADUATION-REPORT.md maps files to engrams
- Engrams use `research:*` concept prefix
- Only HIGH/MEDIUM confidence findings graduate

## Notes

- Depends on Phase 2 (needs REVIEW-LOG.md status = APPROVED)
- Medium risk — MuninnDB write patterns need careful vault routing
- Full specs in `docs/workflow-system/v2/03-muninndb-integration/`
