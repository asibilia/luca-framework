# Phase 194: Remove Branding Transform

## Objective

Delete the reverse-engineering branding transform in `scripts/copy-harness-templates.ts` since compilers now output templates directly via `build:compile` (Phase 192). The transform functions were already extracted to `src/compilers/__helpers/template-transform.ts` (Phase 191).

## Changes

### Deleted

- `scripts/copy-harness-templates.ts` -- Entire file removed. The branding transform logic (`transformBrandingContent`, `transformBrandingFilename`, `transformBrandingDirname`, `copyWithBrandingTransforms`) is no longer needed in the build pipeline. The canonical copies live in `src/compilers/__helpers/template-transform.ts`.

### Modified

- `package.json` -- Removed the `"build:templates"` script entry that pointed to the deleted file.
- `src/agents/general/qa-plan-generator.agent.ts` -- Removed the `bun run build:templates` reference from the QA plan generator's documentation section. (Generated outputs in `.claude/agents/` and `packages/luca-framework/templates/` will be updated on next `bun run build:all`.)
- `.planning/ROADMAP.md` -- Marked all Phase 194 checklist items as complete.
- `.planning/REQUIREMENTS.md` -- Marked REQ-4 acceptance criteria as complete.

## Verification

- `bunx --bun tsc --noEmit` passes (pre-existing `dist/plugin/` errors are unrelated build artifacts).
- `build:all` script (`bun run ./scripts/build-all.ts`) does not reference `copy-harness-templates.ts` or `build:templates`.
- No runtime code imports from `scripts/copy-harness-templates.ts`.
- `dogfood.build_command` in `.planning/config.json` still points to `bun run build:all` (valid).

## Deviations

None.

## Not Modified (per plan constraints)

- `src/compilers/__helpers/template-transform.ts` -- Contains JSDoc comments referencing the deleted script as provenance. These are historical documentation and do not create runtime dependencies. Left unchanged per plan constraints.
- `packages/luca-framework/src/utils/resolve-templates.ts` -- Not relevant to this phase's scope. Left unchanged per plan constraints.
- `.planning/` historical phase docs (191, 192, 193) -- References to the deleted script serve as historical records and were not updated.
