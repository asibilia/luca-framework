# 86-A Summary: Agent Effectiveness Scorecard & Compiler Plugin Registry

## Status: COMPLETE

## Deliverables

### R12: Agent Effectiveness Scorecard

- **R12.1**: `createScorecardEntry()`, `recordInvocation()` — per-agent telemetry aggregation (invocations, success rate, avg duration)
- **R12.2**: `loadScorecard()`, `saveScorecard()` — JSON persistence via Bun.file/Bun.write
- **R12.3**: `queryScorecard()` — filterable/sortable query API for routing decisions (agent_name, min_invocations, sort_by success_rate/invocation_count/avg_duration_ms)
- **R12.4**: `formatScorecardReport()` — structured report with computed success rates, sorted by invocation count

### R13: Compiler Plugin Registry

- **R13.1**: `compilerPluginRegistry` — Map-based registry replaces hardcoded switch in compile.ts dispatch functions
- **R13.2**: `CompilerPlugin` interface — `{ name, format, compileAgent, compileSkill, compileRule? }` with optional rule compilation
- **R13.3**: 4 built-in plugins (Claude Code, Cursor IDE, Pi Terminal, Claude Code Plugin) pre-registered, refactored from existing per-format functions
- **R13.4**: `registerCompilerPlugin()` — public registration API for community-contributed targets

### New Domain

- `src/observability/` — T1 Core domain with `__schemas/`, `__helpers/`, and barrel `index.ts`

### Schemas

- `scorecardEntrySchema`, `scorecardSchema`, `scorecardQuerySchema`, `scorecardReportSchema`, `scorecardReportEntrySchema`
- `CompilerPlugin` interface added to `compilers.schemas.ts`

### Barrel Exports

- `src/observability/index.ts` — all scorecard schemas, types, and engine functions
- `src/compilers/index.ts` — CompilerPlugin type + registry functions added

### Tests

- 21 scorecard tests (entry creation, invocation recording, query filtering/sorting, report generation, persistence roundtrip, schema validation)
- 17 plugin registry tests (built-in registration, lookup, custom registration, dispatch errors, parity verification, interface conformance)
- **38 tests total, all passing**
- 111 total compiler tests passing (backward compatibility verified)

## Files Changed

| File                                                   | Action                                    |
| ------------------------------------------------------ | ----------------------------------------- |
| `src/observability/__schemas/observability.schemas.ts` | Created — R12 schemas                     |
| `src/observability/__helpers/scorecard.ts`             | Created — R12 scorecard engine            |
| `src/observability/index.ts`                           | Created — observability barrel            |
| `src/compilers/__schemas/compilers.schemas.ts`         | Modified — added CompilerPlugin interface |
| `src/compilers/__helpers/plugin-registry.ts`           | Created — R13 plugin registry             |
| `src/compilers/index.ts`                               | Modified — added plugin registry exports  |
| `__tests__/src/observability/scorecard.test.ts`        | Created — 21 R12 tests                    |
| `__tests__/src/compilers/plugin-registry.test.ts`      | Created — 17 R13 tests                    |

## Design Decisions

- **New T1 Core domain**: `src/observability/` follows domain architecture (entity-free core module)
- **Immutable scorecard updates**: `recordInvocation()` returns new scorecard, never mutates
- **Lodash orderBy**: Used for sorting consistency per project conventions
- **Optional compileRule**: Plugin interface makes rule compilation optional since not all formats support individual rules
- **Registry coexists with switch**: Existing `compileAgent/Skill/Rule` switch functions preserved for backward compatibility; `compileAgent/Skill/RuleViaRegistry` provides the new dispatch path
- **Bun.file for persistence**: Uses Bun APIs per project conventions (not node:fs)
- **resetCompilerPluginRegistry()**: Test helper to restore built-in state between tests
