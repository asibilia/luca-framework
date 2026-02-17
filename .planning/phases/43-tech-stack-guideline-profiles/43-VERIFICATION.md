STATUS: passed

## Must-Haves

- [x] STACK-01: Tech stack profile structure (typescript, python, go, rust directories)
- [x] STACK-02: Migrate existing TS-specific rules under `typescript` profile
- [x] STACK-03: Config toggle (`workflow.opinionated_guidelines: true/false`)
- [x] STACK-04: Integration with `lu-map-codebase` stack detection for auto-selection
- [x] STACK-05: Build system conditionally includes/excludes guidelines per selected profile

## Verification Details

### STACK-01: Tech Stack Profile Structure

**EXISTS**: All four profile directories exist with `index.ts` files:

- `src/rules/profiles/typescript/index.ts` - 8 rule factories
- `src/rules/profiles/python/index.ts` - placeholder (0 rules)
- `src/rules/profiles/go/index.ts` - placeholder (0 rules)
- `src/rules/profiles/rust/index.ts` - placeholder (0 rules)

**SUBSTANTIVE**: Each profile implements `TechStackProfile` interface (`profile.types.ts`) with `name`, `description`, and `rules` fields. Python/Go/Rust are documented placeholders with `.gitkeep` files and instructional JSDoc comments for adding rules.

**WIRED**: Master registry (`src/rules/profiles/index.ts`) imports all four profiles and exports them as `profileRegistry`. Profile config schema (`profile.schemas.ts`) validates config with Zod.

### STACK-02: TS Rule Migration

**EXISTS**: All 8 TypeScript-specific rules are now in `src/rules/profiles/typescript/`:

1. `api-snake-case.rule.ts`
2. `bun-preference.rule.ts`
3. `functional-api-reuse.rule.ts`
4. `import-standards.rule.ts`
5. `lodash-preference.rule.ts`
6. `no-classes.rule.ts`
7. `schema-first-parsing.rule.ts`
8. `use-bun-instead-of-node-vite-npm-pnpm.rule.ts`

**SUBSTANTIVE**: Grep confirms NONE of these 8 rule names exist as files in `src/rules/general/`. The general directory retains exactly 10 framework-level rules (atlassian-mcp, complexity-gating, cursor_rules, file-naming, harness-verification, hook-skill-boundary, mandatory-documentation, posthog-integration, self_improve, state-machine-bridge).

**WIRED**: The typescript profile's `index.ts` imports all 8 rules and registers them as lazy factories in the `rules` map.

### STACK-03: Config Toggle

**EXISTS**: `.planning/config.json` contains:

```json
"workflow": {
  "opinionated_guidelines": true,
  "tech_stack_profiles": ["typescript"]
}
```

**SUBSTANTIVE**: `profileConfigSchema` (Zod) validates both fields with defaults (`opinionated_guidelines` defaults to `true`, `tech_stack_profiles` defaults to `["typescript"]`). Schema correctly rejects invalid types (non-boolean, non-array, non-string array items).

**WIRED**: `src/rules/index.ts` reads these fields via `loadProfileConfig()` which reads `.planning/config.json`, parses the `workflow` section through the schema, and falls back to defaults on error.

### STACK-04: Integration with lu-map-codebase

**EXISTS**: `src/agents/general/lu-codebase-mapper.agent.ts` contains:

- A "Profile detection" instruction block (line ~120) with manifest-to-profile mapping table
- A `## Detected Profiles` section in the STACK.md template (line 273) with a profile detection table and fill-in format

`src/skills/general/codebase-map.skill.ts` contains:

- Step 3 in the process: "Profile suggestion check" (line 223)
- A full `## Post-Mapping: Profile Suggestions` section (line 227) that reads detected profiles from STACK.md, compares with current config, and reports suggestions to the user with instructions to update `tech_stack_profiles` and rebuild

**SUBSTANTIVE**: The detection table covers all 4 profiles (typescript, python, go, rust) with HIGH/MEDIUM/LOW confidence indicators based on manifest files, secondary indicators, and file extensions.

**WIRED**: The skill's post-mapping step reads both `config.json` (current profiles) and `STACK.md` (detected profiles), and only surfaces suggestions when new profiles are detected that are not in the current config.

### STACK-05: Conditional Loading in Build System

**EXISTS**: `src/rules/index.ts` has a `loadProfileRules()` function that:

1. Calls `loadProfileConfig()` to read the config
2. If `opinionated_guidelines` is `false`, returns empty object (no profile rules loaded)
3. Otherwise, iterates `tech_stack_profiles` array and merges rules from matching profiles

**SUBSTANTIVE**: The assembled `ruleRegistry` is `{ ...generalRules, ...loadProfileRules() }`, meaning general rules are always present and profile rules are conditionally added. With default config, this produces exactly 19 rules (11 general + 8 typescript).

**WIRED**: The `ruleRegistry` is the single source of truth consumed by the build pipeline (`build-shared.ts`). The drift check (`check:drift`) validates built output matches source, and it passes with "Active profiles: typescript" reported.

## Automated Checks

### Profile Tests (26/26 pass)

```
src/rules/profiles/__tests__/profile-config.test.ts    - 11 pass
src/rules/profiles/__tests__/profile-registry.test.ts   - 9 pass
src/rules/__tests__/rule-registry-profiles.test.ts      - 6 pass
```

Key assertions verified:

- Profile registry contains exactly 4 profiles
- TypeScript profile has exactly 8 rules
- Python/Go/Rust profiles have 0 rules (placeholders)
- Total registry count is 19 with default config
- No name collisions between general and profile rules
- All rule factories produce valid `BaseRule` instances with `toCursorFormat()`/`toClaudeFormat()` methods
- Config schema defaults, validation, and edge cases all covered

### Build / Drift Check

```
$ bun run check:drift
No drift detected. All outputs match source.
Active profiles: typescript
```

19 rule files exist in `.claude/rules/` matching the expected 11 general + 8 typescript profile rules.

### Harness Results

Build passed. 3 pre-existing test failures (unrelated planner tests). 0 new failures introduced by Phase 43.

## Summary

All five requirements (STACK-01 through STACK-05) are fully implemented, tested, and integrated. The profile architecture is clean and extensible -- adding a new profile requires only creating rule files and registering them in the profile's `index.ts`. The config toggle works correctly: setting `opinionated_guidelines: false` disables all profile rules, and modifying `tech_stack_profiles` selects which profiles contribute rules. The codebase mapper integration provides automatic detection and user-facing suggestions for profile updates.
