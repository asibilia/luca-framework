# Phase 5 Pre-Mortem Risk Brief

## Risks

1. **LlmAdapter Serialization Boundary** — LlmAdapter interface type in grader factories could cause JSON serialization issues when reporter writes EvalReport to disk. GraderResult metadata must contain only JSON-serializable primitives.

2. **Sequential Runner Timeout Cascade** — Composite grader timeouts could propagate from inner LLM-judge calls, leaving dangling fetch requests and incomplete results. Runner must isolate timeouts at case boundary, not within grader invocations.

3. **Domain Boundary Registration Drift** — If eval domain (T1) is imported before registration in check-domain-boundaries.ts, boundary violations go undetected until harness runs at phase boundary.

## Plan Constraints

- Register `eval: 1` in DOMAIN_TIER during C01 (not C10) to catch boundary violations early
- Runner timeouts apply at case boundary; per-grader calls get abort controllers
- Verify JSON round-trip of GraderResult metadata before reporter integration
- CLI integration (C09) deferred until all helpers and suites validate grader+runner contract
