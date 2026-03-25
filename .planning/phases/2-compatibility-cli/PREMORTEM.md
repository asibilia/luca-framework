---
phase: 2
type: premortem
tier: 1
complexity: SIMPLE
---

# Pre-Mortem Risk Brief — Phase 2: Compatibility Report CLI

## Failure Scenarios

### 1. Empty EmitResult (LOW likelihood, HIGH impact)

Validators depend on EmitResult.filesPaths being populated. If validate() is called before emit(), results are meaningless.
**Mitigation:** Ensure validation runs AFTER emit() returns. Check filesPaths.length > 0 before validating.

### 2. Missing dist/ directory (MEDIUM likelihood, LOW impact)

Report JSON targets dist/compatibility-report.json but dist/ may not exist.
**Mitigation:** Create dist/ with mkdir({ recursive: true }) before writing.

### 3. File read race condition (LOW likelihood, LOW impact)

Validators read emitted files. If files are deleted between emit and validate, validators fail.
**Mitigation:** Run validation synchronously after emit in same function scope.
