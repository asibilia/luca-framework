# Code Review — Phase 208

**Timestamp:** 2026-03-27T14:15:00Z
**Files reviewed:** 12
**Reviewers:** dx-advocate, code-simplifier, code-architect, security-auditor

## Severity Summary

| Severity | Count |
| -------- | ----- |
| CRITICAL | 0     |
| HIGH     | 8     |
| MEDIUM   | 10    |
| LOW      | 8     |

## HIGH Findings (Deduplicated)

### Pre-existing (not introduced by Phase 208)

1. **node:fs usage in entity-route-helpers.ts** — Uses `node:fs/promises` instead of Bun APIs. Pre-existing; Phase 208 only added `current_content` to 409 response. [dx-advocate]
2. **Host header spoofing** — localhost guard relies on Host header, easily spoofed. Pre-existing pattern across 4+ routes. [security-auditor]
3. **metadata.prefix/suffix code injection** — EntityPutBodySchema uses `.passthrough()` allowing arbitrary TS injection. Pre-existing. [security-auditor]

### Introduced by Phase 208

4. **Import grouping in compile/route.ts** — zod and next/server should be in same external group. [dx-advocate]
5. **ShikiCodeBlock not barrel-exported** — diff-preview.tsx and entity-tab-container.tsx import directly instead of via barrel. [code-architect, dx-advocate]
6. **entityType-to-domainPlural ternary duplicated** — Same mapping computed 3x in entity-tab-container.tsx. [code-architect, code-simplifier]
7. **new Date().toISOString() repeated 5x** — Each publishCompileEvent call creates fresh timestamp inline. [code-simplifier]
8. **localhost guard duplicated across 4 routes** — 6-line block copy-pasted, should be extracted. [code-simplifier]

## MEDIUM Findings (Summary)

- Singleton globalThis pattern could be extracted to shared helper [code-architect]
- SIDECAR_URL hardcoded, should be in constants [code-architect]
- ConfigHistory has 8 useState calls — fat component, extract hooks [code-architect]
- useSSE tightly coupled to specific atoms [code-architect]
- Mixed Bun/node:fs in same package [dx-advocate]
- lodash uniq not used for dedup [dx-advocate]
- unused \_payload variable in SSE handler [dx-advocate]
- err instanceof Error pattern repeated 6x [code-simplifier]
- safeResponseJson helper missing [code-simplifier]
- fetchedRef manual reset pattern — use refreshKey state [code-simplifier]
- No max length on compile name field [security-auditor]
- non_studio_files info disclosure in 409 [security-auditor]
- .passthrough() on metadata schema [security-auditor]

## Disposition

No CRITICAL issues. Phase proceeds. HIGH items noted for future cleanup phase.
