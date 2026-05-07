# Research Capture — Risk Assessment

**Subagent**: researcher
**Perspective**: risk
**Timestamp**: 2026-05-07T18:56Z

## Severity Matrix

| Risk | Impact | Likelihood | Severity | Confidence |
|---|---|---|---|---|
| RISK-1: Schema/memory field-name mismatch | HIGH | HIGH | 🔴 CRITICAL | HIGH |
| RISK-3: consult-section reads file, file may be absent on fresh clone | HIGH | HIGH | 🔴 CRITICAL | HIGH |
| RISK-4: gh-prepare `bumpMapping` vs schema `versionBump` silent no-op | HIGH | HIGH | 🔴 CRITICAL | HIGH |
| RISK-2: alwaysApply blast — `plan` mode lacks tool | HIGH | MEDIUM | 🔴 HIGH | HIGH |
| RISK-5: Pre-commit recall info narrowing, `commits.scopes` empty | MED | MED | 🟠 MED | HIGH |
| RISK-6: Auto-init in non-triage modes stalls | MED | MED | 🟠 MED | HIGH |
| RISK-7: Zero prose tests, silent regressions | MED | HIGH | 🟠 MED | HIGH |
| RISK-8: Vault boilerplate over-stripping | MED | LOW | 🟡 LOW-MED | MED |
| RISK-9: Security / injection surface | LOW | LOW | 🟢 LOW | HIGH |

## RISK-1: Schema vs Memory Drift (CRITICAL)
The seeded memory `01KR1BMR4M1M6MR496C80KC6WS` uses old field names. When `consult-section('pr')` parses the file via Zod, unknown fields drop (`titleTemplate`, `forbidden`, `titleExamples` → silently lost), invalid enums coerce to defaults (`"conventional-commits"` → `"conventional"`, `"github-issues"` → `"github"`).
**Mitigation**: Re-seed memory with Zod-valid field names BEFORE Phase C merges. Or extend schema to accept both.

## RISK-3: consult-section reads file not memory (CRITICAL)
`loadProjectPreferences()` reads `.planning/preferences.json`. If file absent → defaults. The MuninnDB memory is NEVER read by the tool.
**Mitigation**: Commit `.planning/preferences.json` to repo. Add acceptance criterion.

## RISK-4: gh-prepare field-name no-op (CRITICAL)
Todo says read `release.bumpMapping`. Schema exposes `release.versionBump`. Reading wrong field returns undefined → falls through to hardcoded fallback. Migration silently has no effect.
**Mitigation**: Use `versionBump` in Phase C prose. Audit todo text.

## RISK-2: alwaysApply blast radius (HIGH)
`pr-title-format.md` ships to every mode. `plan` mode lacks `projectPreferences` registration. Rule will hit runtime errors.
**Mitigation**: Either add `plan` mode to manifest OR write rule body defensively (`if tool available → consult; else fall back`).

## RISK-5: Pre-commit recall narrowing (MED)
Free-form recall returns `commits.trailers`, `subjectMaxLength`, historical pitfalls — none of which the schema exposes. Replacing recall with `consult-section('commits')` loses information.
**Mitigation**: Extend schema OR keep recall AND add consult.

## RISK-6: Auto-init in non-triage stalls (MED)
New rule body says "if missing, invoke luca-init". But luca-init `seed` action is NOT in finalize/execute scope. Non-triage modes that hit unseeded prefs will stall.
**Mitigation**: Rule body says "consult with `fallback:true`; preferences will be seeded by triage's Step 1.6 sentinel". No invoke-skill instruction.

## RISK-7: Zero tests (MED)
Phase C is prose-only. No snapshot/integration tests catch regressions.
**Mitigation**: Add grep-based test asserting `framework|mastracode|studio|config|docs|repo` does NOT appear in `rules/`, `skills/`, `src/instructions/` (excluding fixtures).

## RISK-8: Vault boilerplate (LOW-MED)
Don't strip vault prose from sites that still use raw `muninn_*` calls. Per-location audit needed.

## RISK-9: Security (LOW)
SAFE_FREEFORM allowlist + JSON-blob seed handoff already mitigate. `consult-section` returns parsed object. No new injection surface.

## Open Questions

1. Is `.planning/preferences.json` committed in luca-framework repo? (CRITICAL — answer determines RISK-3 severity)
2. Is `plan` mode a live consumer? (determines RISK-2 severity)
3. Schema extension: add `pr.titleTemplate`, `pr.forbidden`, `pr.titleExamples`, `commits.trailers`, `commits.subjectMaxLength`?
4. Memory re-seed strategy: evolve in place or `seed` action with overwrite?
5. Should `commits.convention` enum accept `"conventional-commits"` as alias?
