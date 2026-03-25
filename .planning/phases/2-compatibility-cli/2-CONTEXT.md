---
phase: 2
type: context
autonomous: true
provenance: auto-discussed
---

# Phase 2 Context: Compatibility Report CLI

## Decisions

### 1. Validation Flow [researched]

Validators are standalone functions (NOT on the Adapter interface): `validateCursorOutput()`, `validateWindsurfOutput()`, `validateVscodeOutput()` in `compatibility-validator.ts`. They accept `EmitResult` and inspect emitted files.

**Flow:** adapter.emit(outputDir) → validateXOutput(emitResult) → aggregateReports([...reports]) → write + print

### 2. CLI Integration Point [researched]

The build pipeline does not currently have a single orchestrator file that runs all adapters. The integration should:

- Add a helper function in `src/adapters/__helpers/` that iterates registered adapters, runs emit + validate, and aggregates results
- This keeps the logic in T3 (adapters domain) without touching compilers

### 3. Output Locations [researched]

- **Aggregated report JSON**: `dist/compatibility-report.json` (standard dist/ output)
- **Stdout summary**: Print after compilation with per-adapter status line

### 4. Stdout Format [researched]

```
Adapter Compatibility Report:
  cursor: COMPATIBLE (0 warnings)
  windsurf: DEGRADED (5 warnings — 3 rules truncated, 2 hooks unsupported)
  vscode: COMPATIBLE (1 warning — hooks in Preview)
Full report: dist/compatibility-report.json
```

## Scope Boundary

- Wire existing validators into emit results
- Add CLI summary output
- Write aggregated JSON to dist/
- Do NOT modify the Adapter interface
- Do NOT modify individual adapter compile/emit methods (Phase 1 handled that)
