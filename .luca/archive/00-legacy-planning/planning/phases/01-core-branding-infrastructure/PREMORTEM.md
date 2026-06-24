# Pre-Mortem Risk Brief — Phase 1: Core Branding Infrastructure

**Complexity:** SIMPLE | **Appetite:** Small | **Scenarios:** 3

## Risks

### 1. Async file read race in readProjectBranding()

- **Likelihood:** LOW
- **Impact:** MEDIUM (unhandled rejection crashes caller)
- **Scenario:** Config file deleted between exists() check and .text() read
- **Mitigation:** Wrap entire read sequence in try/catch, return defaultBranding on any error

### 2. Directory write permission failure in createAliasSkill()

- **Likelihood:** LOW
- **Impact:** MEDIUM (alias not created, no user feedback)
- **Scenario:** .claude/skills/{prefix}/ creation fails silently on permission denied
- **Mitigation:** Use mkdir recursive, wrap in try/catch with actionable error message

### 3. Marker comment fragility in cleanupStaleAlias()

- **Likelihood:** LOW-MEDIUM
- **Impact:** LOW (stale aliases accumulate but don't break functionality)
- **Scenario:** Marker detection fails if file content shifts marker from expected position
- **Mitigation:** Use includes() or regex search (not line-position-dependent), validate marker after write

## Plan Constraints

- readProjectBranding() must never throw — always return BrandingConfig (defaultBranding fallback)
- createAliasSkill() must use mkdir recursive and report errors clearly
- cleanupStaleAlias() marker detection must be position-independent (use string.includes())
