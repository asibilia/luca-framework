# 86-A: Agent Effectiveness Scorecard & Compiler Plugin Registry

## Metadata

- **Phase:** 86
- **Wave:** 1
- **Requirements:** R12, R13
- **TDD:** false

## Objective

Ship the agent effectiveness scorecard (R12) and compiler plugin registry (R13), laying the data and extensibility foundations for v2.6.0 learning features.

## Tasks

### T1: Scorecard Schemas (R12.1)

Create `src/observability/__schemas/observability.schemas.ts` with:

- `scorecardEntrySchema`: Per-agent telemetry record (agent_name, invocation_count, success_count, failure_count, total_duration_ms, avg_duration_ms, last_invoked)
- `scorecardSchema`: Collection of entries keyed by agent name
- `scorecardQuerySchema`: Query interface (agent_name?, min_invocations?, sort_by?)
- `scorecardReportSchema`: Formatted report output

### T2: Scorecard Engine (R12.1–R12.4)

Create `src/observability/__helpers/scorecard.ts` with:

- `createScorecardEntry(agentName)`: Initialize a new entry
- `recordInvocation(scorecard, agentName, success, durationMs)`: Record an invocation
- `queryScorecard(scorecard, query)`: Filter and sort entries for routing decisions (R12.3)
- `formatScorecardReport(scorecard)`: Generate human-readable report (R12.4)
- `loadScorecard(path)` / `saveScorecard(scorecard, path)`: JSON persistence (R12.2)

### T3: Observability Barrel & Domain Setup

Create `src/observability/index.ts` barrel with all schema + helper exports. T1 Core domain.

### T4: Compiler Plugin Interface (R13.1–R13.2)

Add to `src/compilers/__schemas/compilers.schemas.ts`:

- `CompilerPlugin` interface: `{ name, format, compileAgent, compileSkill, compileRule? }`
- Plugin registration types

### T5: Plugin Registry & Refactor (R13.1, R13.3, R13.4)

Create `src/compilers/__helpers/plugin-registry.ts`:

- `compilerPluginRegistry`: Map<SupportedFormat, CompilerPlugin>
- `registerCompilerPlugin(plugin)`: Registration API (R13.4)
- `getCompilerPlugin(format)`: Lookup
- Refactor: Extract existing Claude/Cursor/Pi/Plugin compilers as plugin objects
- Update `compileAgent/Skill/Rule` dispatch functions to use registry

### T6: Barrel Updates

Update `src/compilers/index.ts` with plugin registry exports.

### T7: Tests

- Scorecard: entry creation, invocation recording, query filtering, report format, persistence
- Plugin registry: registration, lookup, dispatch, existing format parity

## Verification

- `bunx --bun tsc --noEmit` passes
- All new tests pass
- Existing compilation tests still pass (backward compatibility)
- All 4 formats produce identical output before and after refactor
