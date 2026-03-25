# Pre-Mortem Risk Brief — Phase 4

**Complexity:** MODERATE | **Risks:** 3

1. **A07 executor complexity** — Wave execution with adapter delegation, guard evaluation, retry logic, and checkpoint integration. Highest-risk single file in Phase A. Mitigation: exact implementation in todo; typecheck catches structural issues.
2. **A10 pipeline uses builder from A04** — If builder API changed during Phase 3 execution (Zod v4 adaptation), pipeline definition must match. Mitigation: read actual builder exports before implementing.
3. **A11 tsconfig paths** — Adding `~/workflow/*` path alias requires matching existing patterns exactly. Mitigation: read tsconfig.json before editing.
