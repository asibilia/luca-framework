# Requirements — v5.2.0 Distribution & Install Quality

## Init Flow Critical Fixes

- **REQ-01**: MuninnDB download URL must use correct GitHub release URL pattern (resolve tag via API or use `latest/download/` path)
- **REQ-02**: MuninnDB binary must be verified (exists, executable) after download before proceeding to next init step
- **REQ-03**: MuninnDB health endpoint must respond before prompting user for API key; skip vault setup and advise `luca vault:init` later if unreachable
- **REQ-04**: `vault:init` must detect global install vs dev mode; in global mode, skip harness file generation and only create `.planning/` config files (config.json, BRAIN.md, WORKING.md, MEMORY.md)

## Platform Selection Cleanup

- **REQ-05**: Wizard multiselect must only show Claude as platform option (remove Cursor and Pi choices)
- **REQ-06**: Preset defaults (`standard`, `full`, `minimal`) must only include `claude` in platforms array
- **REQ-07**: Non-Claude directory creation (`.cursor/`, `.pi/`) must be removed from `generateFiles()`

## Custom Prefix Templating

- **REQ-08**: Agent template filenames must use configurable branding prefix (e.g., `lu-router.md` becomes `{prefix}-router.md`)
- **REQ-09**: Skill directory and SKILL.md filenames must use configurable branding prefix (e.g., `skills/lu/` becomes `skills/{prefix}/`)
- **REQ-10**: All SKILL.md content must template-process `/lu` command references to use `/<%= branding.commandPrefix %>`
- **REQ-11**: Cross-skill `Skill(skill: "lu")` references in SKILL.md files must use dynamic prefix
- **REQ-12**: Post-init tour output must display correct prefix-based commands (e.g., `/pt` instead of hardcoded `/lu`)

## CI/CD Automation

- **REQ-13**: GitHub Actions workflow must auto-publish `@alecsibilia/luca-framework` to npm when a GitHub release is created (type: `published`)
- **REQ-14**: Publish workflow must run typecheck (`bunx --bun tsc --noEmit`) before publishing
- **REQ-15**: Publish workflow must use `NPM_TOKEN` repository secret for authentication
- **REQ-16**: Publish workflow must publish with `--access restricted` flag

## Gate Enforcement

- **REQ-17**: Gate decisions (premortem, process_data) must be resolved by the lu orchestrator and passed as explicit flags (`--run-*` / `--skip-*`) to sub-skills
- **REQ-18**: Sub-skills must NOT make ad-hoc skip decisions based on oversight level, phase type, or contextual reasoning; absent flag = skip (fail-closed)
- **REQ-19**: A rule (`.claude/rules/gate-enforcement.md`) must enforce that gate checks are orchestrator-resolved, not sub-skill-evaluated

## Config Rename

- **REQ-20**: `config.autopilot` must be renamed to `config.lu` in `.planning/config.json` with a `LuConfigSchema` Zod schema
- **REQ-21**: `lu.skill.ts` must read from `c.lu` with one-version fallback to `c.autopilot`; `skip_uat_in_autopilot` renamed to `skip_uat`
- **REQ-22**: All state machine types, guards, persistence, and observer topology references to `autopilot` must be updated to `lu`

## Out of Scope

- Test suite reintroduction (tracked separately as todo #37)
- Observer app changes
- New CLI commands beyond bugfixes

---

_Requirements created: 2026-03-17 — v5.2.0 milestone_
