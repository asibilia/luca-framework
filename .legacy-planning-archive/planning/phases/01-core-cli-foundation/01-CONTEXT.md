# Phase 1: Core CLI & Foundation - Context

**Gathered:** 2026-02-04
**Status:** Ready for planning

<domain>
## Phase Boundary

CLI installer (`npx luca init`) that scaffolds functional Luca projects with interactive setup wizard, branding configuration, and React+TS stack template. Working installation in under 5 minutes.

</domain>

<decisions>
## Implementation Decisions

### Setup Wizard Flow

- Start by detecting context — check for existing package.json, git repo, adapt questions accordingly
- Ask branding configuration early in wizard (full name + command abbreviation)
- Detect stack from package.json, suggest appropriate template, allow override
- Show summary + next steps on completion ("Created X files. Run /lu to start.")
- If Luca already installed, abort with message directing to `luca update`
- Support non-interactive mode via config file (`--config luca.init.json`)
- On error mid-setup: cleanup partial files, show error, exit
- Validate inputs inline as user types, show errors immediately

### Output & Feedback

- Default verbosity: Informative — show key steps ("Creating config...", "Installing files...")
- Visual style: Colorful + emoji — colors, checkmarks (✓), spinners, visual hierarchy
- Progress indicators: Mix of spinners, progress bars, and step lists where contextually appropriate
- Error messages: Detailed + context — what failed, why, what was attempted, how to fix

### Defaults & Friction

- Default branding: "Luca" with `/lu` command (if user skips customization)
- Quick mode: `--quick` flag accepts all defaults, skips interactive prompts
- Work tracking: Ask during init ("Which work tracker?") — Phase 2 implements the actual integration
- Stack templates: Moderately opinionated on general patterns, room for team customization, allows user to specify key library preferences (lodash, jotai, tailwind, nextjs, etc.)

### File Structure

- Config location: `.planning/config.json` (with other planning files)
- Framework origin files: `.cursor/luca/` (named after framework, separate from user files)
- User customizations: `.cursor/agents/` and `.cursor/rules/` (current pattern preserved)
- Framework manifest: `.planning/manifest.json` (for tracking framework state and updates)

### Claude's Discretion

- Exact spinner/progress bar implementation details
- File generation order within setup
- Specific validation rules for branding inputs
- Template file organization within `.cursor/luca/`

</decisions>

<specifics>
## Specific Ideas

- Detect existing project context like `create-next-app` does — smart defaults based on what's already there
- Progress should feel like modern CLIs (create-next-app, create-vite) — not too verbose, not too quiet
- Branding asked early because it's the key customization point — makes the framework feel like "theirs"
- Config file non-interactive mode enables CI/automation use cases

</specifics>

<deferred>
## Deferred Ideas

- Work tracker adapter implementation — Phase 2
- Update command and manifest diffing — Phase 2
- Doctor command for diagnostics — Phase 3
- Multiple stack templates beyond React+TS — future phase

</deferred>

---

*Phase: 01-core-cli-foundation*
*Context gathered: 2026-02-04*
