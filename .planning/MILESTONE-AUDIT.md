# Milestone v8.5.1 Audit — Audit Gap Closure

**Audited:** 2026-03-29
**Phases:** 225-232 (8 phases)
**Files changed:** 52 TypeScript files
**Reviewers:** Integration checker, DX advocate, Code architect, Security auditor

## Requirements Status

| Phase | Goal                         | Todos | Status   |
| ----- | ---------------------------- | ----- | -------- |
| 225   | DRY Consolidation            | 3/3   | COMPLETE |
| 226   | Security Hardening           | 3/3   | COMPLETE |
| 227   | Orchestrator State Tracking  | 3/3   | COMPLETE |
| 228   | Post-Execution Gap Detection | 3/3   | COMPLETE |
| 229   | Agent Behavioral Contracts   | 5/5   | COMPLETE |
| 230   | v2 Enhanced Existing Agents  | 4/4   | COMPLETE |
| 231   | v2 Orchestrator Integration  | 5/5   | COMPLETE |
| 232   | Skill-to-Agent Migration     | 8/8   | COMPLETE |

**Requirements:** 34/34 complete

## Integration Status

**Status:** CONNECTED (2 gaps found)

| Integration Point                 | Status       | Notes                                                      |
| --------------------------------- | ------------ | ---------------------------------------------------------- |
| Hook infra -> Orchestrators       | CONNECTED    | All 5 pre-step hooks import from enforcement-hook-factory  |
| Contract system -> Hook adapter   | ORPHANED     | checkContractPreconditions exported but no hook imports it |
| v2 pipeline -> agent-prompts      | CONNECTED    | All 6 v2 templates reference correct agent names           |
| Config extensions -> lu.skill.ts  | CONNECTED    | workflow.version read correctly, --v2 override works       |
| Gap detection -> Session end hook | UNREGISTERED | session-end-audit.ts implemented but not in hook registry  |
| State machines -> Context helpers | CONNECTED    | All 5 context paths aligned across schemas, hooks, audit   |

## Code Quality Findings

### CRITICAL (1)

**DRY-001: Duplicated violation-to-gap conversion with behavioral divergence**

- Files: `src/workflow/__helpers/gap-detector.ts` (297-332), `src/workflow/__helpers/contract-evaluator.ts` (293-341)
- Issue: Nearly identical ContractViolation[] -> ExecutionGap[] conversion in both files, but `optional` field diverges: gap-detector uses `violation.kind !== "hard"`, contract-evaluator hardcodes `false`
- Fix: Extract shared `violationToGap()` helper, decide on correct `optional` logic

### HIGH (7)

| ID       | File                                                         | Issue                                                                                                                                |
| -------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| SEC-001  | agent-prompts.ts:462                                         | Prompt injection via tsc error output in HARNESS_FIX_PROMPT — compiler errors containing crafted source comments can break XML fence |
| INT-001  | session-end-audit.ts                                         | Hook fully implemented but not registered in hook-registry.ts — will never fire                                                      |
| DX-001   | session-end-audit.ts:79                                      | Manual JSON.parse with type assertion instead of schema safeParse                                                                    |
| DX-002   | enforcement-hook-factory.ts:199-225                          | Multiple `as string` / `as Record` casts on stdin data instead of schema validation                                                  |
| DX-003   | contract-evaluator.ts:38-68                                  | LedgerEntry/MergedAuditResult as plain interfaces, not Zod schemas (inconsistent with gap-detector.ts)                               |
| ARCH-001 | enforcement-hook-factory.ts:51 + contract-hook-adapter.ts:30 | Two near-identical Zod schemas for context file parsing across domains                                                               |
| ARCH-002 | contract-evaluator.ts:163-170                                | Unreachable `recoverySucceeded = true` path — check ordering makes success case impossible                                           |

### MEDIUM (12)

| ID       | Category  | File                         | Issue                                                                       |
| -------- | --------- | ---------------------------- | --------------------------------------------------------------------------- |
| SEC-002  | Security  | context-helpers.ts:187       | Write merges patch without schema validation — arbitrary fields persist     |
| SEC-003  | Security  | hook-io.ts:164               | hookName unsanitized in /tmp path — potential path traversal                |
| SEC-004  | Security  | agent-prompts.ts:43          | vault/recallContext interpolated without quote escaping                     |
| SEC-005  | Security  | agent-prompts.ts:515         | reviewer/route params interpolated into role blocks without allowlist       |
| SEC-006  | Security  | contract-hook-adapter.ts:122 | contextPath not validated — exported function could read arbitrary files    |
| SEC-007  | Security  | context-helpers.ts:211       | Predictable /tmp paths — symlink attack on Linux (macOS uses per-user dirs) |
| ARCH-003 | DRY       | gap-detector.ts:338          | Dead branch: hasFails and hasGaps both resolve to "gaps_found"              |
| ARCH-004 | Structure | gap-detector.ts              | Zod schemas defined in **helpers/ instead of **schemas/                     |
| ARCH-005 | DRY       | agent-prompts.ts             | MCP tool names as scattered string literals (8+ occurrences)                |
| ARCH-006 | Simplify  | contract-hook-adapter.ts:120 | Double-parse (file.text + JSON.parse) when Bun.file.json() available        |
| DX-004   | Schema    | agent-prompts.ts:24-29       | AgentPromptParams is plain interface, not Zod schema                        |
| DX-005   | Schema    | contract-evaluator.ts:68     | status field is bare `string` instead of constrained enum                   |

### LOW (10)

Dead code in contract-evaluator (2 instances), deprecated hook registry exports still present, missing .docs.md for 4 new modules, chmod race windows (acceptable), error message truncation, minor naming/formatting issues.

## Tech Debt

| Item                                 | Source       | Impact                                                        |
| ------------------------------------ | ------------ | ------------------------------------------------------------- |
| session-end-audit unregistered       | Integration  | Gap detection on session end is completely disabled           |
| contract-hook-adapter orphaned       | Integration  | Contract precondition checks never run from hooks             |
| violation-to-gap DRY + divergence    | Architecture | Same violation produces different gap semantics per code path |
| Context write without validation     | Security     | Enforcement hooks trust context file contents blindly         |
| HARNESS_FIX_PROMPT injection surface | Security     | Crafted source files could inject via tsc error output        |
| Build drift (5 compiled files)       | Build        | .claude/ outputs modified but uncommitted                     |

## Cross-Phase Issues

| File                                                   | Issue                                                     | Phases Affected |
| ------------------------------------------------------ | --------------------------------------------------------- | --------------- |
| gap-detector.ts + contract-evaluator.ts                | Duplicated conversion logic with divergent behavior       | 228, 229        |
| enforcement-hook-factory.ts + contract-hook-adapter.ts | Duplicated context schema                                 | 225, 229        |
| session-end-audit.ts + hook-registry.ts                | Hook implemented but unregistered                         | 228             |
| agent-prompts.ts                                       | Prompt injection surfaces in error/reviewer interpolation | 232, 231        |

## Audit Summary

```
Requirements:  34/34 complete
Integration:   4/6 connected, 1 orphaned, 1 unregistered
CRITICAL:      1 (DRY violation with behavioral divergence)
HIGH:          7 (1 security, 1 integration, 3 schema, 2 architecture)
MEDIUM:        12 (6 security, 4 architecture, 2 schema)
LOW:           10
Typecheck:     PASS (0 errors)
Tier compliance: PASS (no violations)
Barrel purity: PASS
```

## Next Steps

| Condition        | Action                              | Command               |
| ---------------- | ----------------------------------- | --------------------- |
| Close gaps first | Plan gap closure phases             | `/milestone-gaps`     |
| Proceed anyway   | Archive milestone (tech debt noted) | `/milestone-complete` |
