# Phase 199: Pre-Mortem Risk Brief

**Complexity:** SIMPLE | **Appetite:** Small

## Risks

1. **Import loop via shims** (LOW) — Shims must be re-export only, no new logic.
2. **File-count async/sync mismatch** (LOW) — Verify all call sites match async signatures.
3. **Branding validation only in deploy** (MEDIUM) — Consider validating in both compile and deploy paths.

## Plan Constraints

- Shims are re-export-only files
- Vault-guard prompt extracted as const string, not function
- Do NOT run `bun run build:all` during session
- Run `bunx --bun tsc --noEmit` to verify after changes
