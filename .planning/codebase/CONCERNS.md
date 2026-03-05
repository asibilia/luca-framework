# Codebase Concerns

**Analysis Date:** 2026-02-04

## Tech Debt

**Hardcoded Ticket Prefixes:**

- Issue: PT- prefix hardcoded throughout skills and workflows (should be configurable)
- Files: `.cursor/skills/lu/SKILL.md`, `.cursor/skills/git-feature/SKILL.md`, `.cursor/skills/qa-consolidate/SKILL.md`, `.cursor/rules/lu-workflow.mdc`, `.cursor/luca/templates/state.md`, `docs/agent-framework/luca/README.md`
- Impact: Framework cannot be used by teams with different ticket prefixes (e.g., DEV-, PROJ-, TASK-)
- Fix approach: Create `.planning/config.json` with `ticket_prefix` field, replace all PT- references with `${TICKET_PREFIX}-` or `$TICKET_PREFIX` variable

**Hardcoded Release Branch Pattern:**

- Issue: ENG-####--release branch pattern hardcoded in workflows
- Files: `.cursor/skills/lu/SKILL.md`, `.cursor/skills/qa-consolidate/SKILL.md`, `.cursor/luca/workflows/resume-project.md`
- Impact: Assumes specific release branch naming convention (ENG-####--release), breaks for teams using main/master or different patterns
- Fix approach: Add `release_branch_pattern` config option, support multiple patterns (main, master, release/*, ENG-*)

**Company-Specific References:**

- Files: `.cursor/plans/luca_framework_cleanup_6ab900eb.plan.md`, `docs/agent-framework/README.md`, `.cursor/agents/product.md`, `.cursor/rules/atlassian-mcp.mdc`
- Impact: Documentation confusing for non-Percent users, examples don't match their environment
- Fix approach: Replace with generic placeholders (YOUR_COMPANY, YOUR_PROJECT, $JIRA_BASE_URL), add configuration examples

**GitHub Repository Hardcoding:**

- Files: `.cursor/skills/qa-consolidate/SKILL.md` (line 150 mentions replacing this)
- Impact: QA consolidation workflow breaks for other repositories
- Fix approach: Use `$GITHUB_REPO` environment variable or `gh repo view --json nameWithOwner`

**Absolute Path Dependencies:**

- Issue: `.cursor/luca/` path hardcoded in many references
- Files: Multiple skills reference `@./.cursor/luca/workflows/`, `.cursor/luca/templates/`, `.cursor/luca/references/`
- Impact: Framework assumes specific directory structure, breaks if installed differently
- Fix approach: Use relative paths from project root, or detect framework location dynamically

## Known Bugs

**Placeholder Ticket Pattern Inconsistency:**

- Symptoms: PT-0000 used as placeholder in some files, PROJ-0000 in others
- Files: `.cursor/skills/lu/SKILL.md` uses PT-0000, `.cursor/rules/atlassian-mcp.mdc` uses PROJ-0000, `.cursor/skills/git-feature/SKILL.md` uses PROJ-0000
- Trigger: Different skills/rules use different placeholder patterns
- Workaround: Manually standardize to one pattern, but should use `${TICKET_PREFIX}-0000` from config

**AGENTS.md Placeholder Content:**

- Symptoms: AGENTS.md contains `[placeholder]` sections that were never filled
- Files: `AGENTS.md` lines 7, 25
- Trigger: Template content not completed during framework setup
- Workaround: Fill placeholders with actual content or remove sections

## Security Considerations

**API Key Configuration Scattered:**

- Risk: API key requirements documented in multiple places without central reference
- Files: `.cursor/rules/taskmaster.mdc`, `.cursor/rules/atlassian-mcp.mdc`, `.cursor/skills/jira-issue/SKILL.md`, `.cursor/luca/templates/user-setup.md`
- Current mitigation: Each integration documents its own env vars
- Recommendations: Create `.planning/config.json` schema documenting all required API keys, validate on startup

**MCP Server Configuration Complexity:**

- Risk: MCP server setup requires manual `.cursor/mcp.json` editing, no validation
- Files: `.cursor/rules/taskmaster.mdc`, `.cursor/rules/atlassian-mcp.mdc`
- Current mitigation: Documentation explains where to add keys
- Recommendations: Provide setup script or validation tool to check MCP configuration completeness

**Environment Variable Naming Conflicts:**

- Risk: Different integrations may use same env var names (e.g., `API_KEY` vs `OPENAI_API_KEY`)
- Files: `.cursor/luca/templates/user-setup.md`, `.cursor/luca/references/verification-patterns.md`
- Current mitigation: Documentation uses specific names
- Recommendations: Document all env vars in central config schema, warn on conflicts

## Performance Bottlenecks

**No Caching for Jira Ticket Lookups:**

- Problem: Each `/lu` invocation fetches Jira ticket details via API
- Files: `.cursor/skills/lu/SKILL.md`, `.cursor/skills/jira-issue/SKILL.md`
- Cause: No local cache of ticket metadata
- Improvement path: Cache ticket details in `.planning/cache/jira/` with TTL, refresh on demand

**Large File Scanning in Verification:**

- Problem: Verification workflows scan entire codebase for TODOs/placeholders
- Files: `.cursor/luca/workflows/verify-phase.md`, `.cursor/agents/lu-verifier.md`
- Cause: No incremental verification, always full scan
- Improvement path: Track file modification times, only verify changed files since last check

## Fragile Areas

**Branch Name Parsing Logic:**

- Files: `.cursor/skills/lu/SKILL.md` (lines 243-252, 285, 322)
- Why fragile: Regex patterns for PT-#### and ENG-#### branches break if ticket prefix changes
- Safe modification: Extract branch parsing to utility function, use config-driven patterns
- Test coverage: No tests for branch name parsing logic

**Workflow File References:**

- Files: Multiple skills use `@./.cursor/luca/workflows/{name}.md` references
- Why fragile: Hardcoded paths break if framework installed to different location
- Safe modification: Use relative paths from skill location, or detect framework root
- Test coverage: No validation that referenced files exist

**Template Variable Substitution:**

- Files: `.cursor/luca/templates/*.md` contain `{{PLACEHOLDERS}}` and `[Placeholder text]`
- Why fragile: No validation that all placeholders are filled before use
- Safe modification: Add template validation step, list unfilled placeholders
- Test coverage: No tests for template completeness

## Scaling Limits

**Single Project Assumption:**

- Current capacity: Framework assumes one `.planning/` directory per repository
- Limit: Cannot manage multiple projects in same repo, or monorepo with multiple Luca projects
- Scaling path: Add project identifier to config, support `.planning/{project-id}/` structure

**No Multi-User Coordination:**

- Current capacity: Framework designed for single developer workflow
- Limit: Multiple developers using `/lu` simultaneously may create conflicting branches or state
- Scaling path: Add locking mechanism for STATE.md updates, or use distributed state (git-based)

## Dependencies at Risk

**GitHub CLI Dependency:**

- Risk: Many workflows require `gh` CLI, no fallback if unavailable
- Impact: `/lu`, `/lu-address-pr`, `/lu-verify-work` fail without gh
- Migration plan: Add detection and graceful degradation, or document as hard requirement

**Jira MCP Server Dependency:**

- Risk: Atlassian MCP server required for Jira integration, may not be available for all users
- Impact: Jira ticket workflows fail if MCP server not configured
- Migration plan: Make Jira integration optional, fall back to manual ticket entry

## Missing Critical Features

**No Configuration Validation:**

- Problem: Framework starts without validating required config values
- Blocks: Users discover missing config only when workflows fail mid-execution
- Priority: High - should validate on first use

**No Migration Path for Existing Projects:**

- Problem: No tool to migrate existing projects to use Luca framework
- Blocks: Teams with established workflows cannot adopt framework easily
- Priority: Medium - affects adoption

**No Abstraction Layer for Customization:**

- Problem: Hardcoded values throughout, no plugin/extension system
- Blocks: Teams need to fork framework to customize for their workflow
- Priority: High - critical for packageability

## Test Coverage Gaps

**No Integration Tests:**

- What's not tested: End-to-end workflow execution (git setup → planning → execution → PR)
- Files: All workflow files in `.cursor/luca/workflows/`
- Risk: Workflow changes may break without detection
- Priority: High - framework is workflow-heavy

**No Configuration Tests:**

- What's not tested: Config file parsing, validation, default values
- Files: `.planning/config.json` (when created), config parsing logic
- Risk: Invalid config causes cryptic failures
- Priority: Medium

**No Skill Execution Tests:**

- What's not tested: Skills execute correctly with various inputs
- Files: All `.cursor/skills/lu-*/SKILL.md` files
- Risk: Skills may fail silently or produce incorrect output
- Priority: Medium

## Packageability Risks

**Hardcoded Directory Structure:**

- Issue: Framework assumes `.cursor/luca/`, `.planning/`, `.cursor/skills/` structure
- Files: All skills and workflows reference these paths
- Impact: Cannot package as npm package or install to different locations
- Fix approach: Detect framework root dynamically, support installation to `node_modules` or custom path

**No Installation Script:**

- Issue: Framework must be manually copied/cloned, no `npm install` or setup script
- Files: No `bin/install.js` or setup script exists
- Impact: High barrier to adoption, no version management
- Fix approach: Create npm package with postinstall script, or standalone installer

**Tight Coupling to Cursor IDE:**

- Issue: Framework designed specifically for Cursor IDE with MCP integration
- Files: All MCP references, `.cursor/` directory structure
- Impact: Cannot be used in other IDEs or CLI-only environments
- Fix approach: Abstract IDE-specific parts, support CLI mode

**No Version Management:**

- Issue: No versioning system, users cannot update framework independently
- Files: No `package.json` version, no changelog
- Impact: Breaking changes affect all users, no migration path
- Fix approach: Add semantic versioning, changelog, migration guides

**Documentation Assumes Percent Context:**

- Issue: Examples and documentation reference Percent-specific workflows
- Files: `docs/agent-framework/luca/README.md`, `docs/agent-framework/README.md`
- Impact: New users confused by company-specific examples
- Fix approach: Replace with generic examples, add company-specific customization guide

---

*Concerns audit: 2026-02-04*
