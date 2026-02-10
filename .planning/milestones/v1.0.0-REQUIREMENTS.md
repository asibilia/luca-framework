# Requirements

## Overview

Requirements for packaging the Luca framework as a distributable, CLI-installable agent development framework for Cursor IDE.

**Audience:** Enterprise development teams
**Distribution:** CLI installer (`npx luca init`)
**Platform:** Cursor IDE (Node.js 18+)

---

## v1 Requirements

### REQ-001: CLI Installation & Setup

**Description:** Zero-friction installation via npx with interactive setup wizard.

**Acceptance Criteria:**

- `npx luca init` starts interactive setup wizard
- Setup completes in under 5 minutes
- Wizard prompts for: project name, branding, work tracker, stack template
- Creates `.cursor/luca/` with framework files
- Creates `.planning/` with initialized state
- Generates `manifest.json` for update tracking
- No postinstall scripts (explicit user invocation only)

**Technical Notes:**

- Use UnJS ecosystem: citty, @clack/prompts, consola
- Dual package: `create-luca` (scaffolding) + `luca-framework` (CLI)
- Node.js 18+ requirement

---

### REQ-002: Configurable Branding

**Description:** Teams can customize command prefixes, ticket patterns, and output headers.

**Acceptance Criteria:**

- `config.json` contains branding section:
  - `commandPrefix`: default "lu", configurable (e.g., "acme")
  - `ticketPattern`: regex for ticket IDs (default: `[A-Z]+-\\d+`)
  - `placeholderTicket`: default placeholder (default: "PROJ-0000")
  - `headerTemplate`: output header format
- All framework output uses branding config
- Skills reference config values, not hardcoded strings
- README generation uses configured branding

**Technical Notes:**

- Replace all hardcoded PT-, ENG- references with config lookups
- Use template syntax: `${config.branding.commandPrefix}`

---

### REQ-003: Pluggable Work Tracking

**Description:** Adapter interface for work tracking systems (Jira, Linear, GitHub Issues).

**Acceptance Criteria:**

- TypeScript interface `WorkTrackerContract` defined in `.cursor/luca/contracts/`
- Contract includes: `getTicket`, `createBranch` (optional), `linkPR` (optional)
- Built-in adapters:
  - `jira-adapter.ts` — Jira via Atlassian MCP
  - `github-adapter.ts` — GitHub Issues via `gh` CLI
  - `placeholder-adapter.ts` — PT-0000 style (no external system)
- Setup wizard prompts for work tracker selection
- Config stores selected adapter and adapter-specific settings

**Technical Notes:**

- Adapters in `.planning/integrations/`
- Interface segregation: minimal required methods, optional extensions

---

### REQ-004: Configurable Approvals

**Description:** Config-driven approval triggers for plans, destructive actions, and external actions.

**Acceptance Criteria:**

- Config schema for approvals:

  ```json
  {
    "approvals": {
      "plans": true,
      "destructive": true,
      "external": true,
      "custom_triggers": []
    }
  }
  ```

- Default: all three enabled (secure defaults)
- Framework checks approval config before executing actions
- Clear prompts when approval required
- Approval decisions logged to audit trail

**Technical Notes:**

- Hook into existing interactive/yolo mode system
- Extend existing gate system in config.json

---

### REQ-005: Update Mechanism

**Description:** Manifest-driven updates with conflict detection and user control.

**Acceptance Criteria:**

- `npx luca update` command available
- Version notification on any luca command (non-blocking)
- `manifest.json` tracks:
  - Framework version
  - File hashes (SHA-256)
  - Last known framework hash (for conflict detection)
- Update algorithm:
  - New files → Add
  - Unchanged files → Update
  - User-modified files → Flag conflict, preserve user version
- Conflicts written to `.cursor/luca/conflicts/` for manual review
- Backup created before update

**Technical Notes:**

- Use crypto module for SHA-256 hashing
- Semantic versioning (strict semver)
- Migration scripts for breaking changes

---

### REQ-006: Stack Templates

**Description:** React + TypeScript BRAIN.md template with conventions and patterns.

**Acceptance Criteria:**

- Setup wizard includes stack selection (React+TS for v1)
- Template generates:
  - BRAIN.md with stack-specific conventions
  - Recommended .cursor/rules/ files for the stack
  - Stack-appropriate gitignore additions
- React+TS template includes:
  - Functional components (no classes)
  - Zod schemas for validation
  - Lodash preference
  - kebab-case file naming
  - Component patterns

**Technical Notes:**

- Templates stored in `luca-framework` package under `/templates/`
- Use giget for template extraction

---

### REQ-007: Diagnostic Tooling

**Description:** Health checks and troubleshooting for common issues.

**Acceptance Criteria:**

- `npx luca doctor` command available
- Checks include:
  - Node.js version (18+ required)
  - Cursor IDE detected
  - MCP server status
  - Config file validation
  - Required files exist
  - Framework version vs latest
- Clear pass/fail output with remediation suggestions
- Exit code reflects health status (0 = healthy)

**Technical Notes:**

- MCP health check via `.cursor/mcp.json` validation
- Config validation via Zod schema

---

### REQ-008: Enterprise Security Documentation

**Description:** Security posture documentation for enterprise adoption.

**Acceptance Criteria:**

- SECURITY.md document covering:
  - Supply chain security posture
  - Data handling (what leaves the machine)
  - Audit trail capabilities
  - Access control mechanisms
  - Minimum privilege principles
- No auto-running scripts documented
- Version pinning guidance
- SOC 2-relevant documentation
- Security questionnaire template

**Technical Notes:**

- Target security practitioners, not just leadership
- Reference research findings (Wiz, Koi Security incidents)

---

## v2 (Deferred)

- Additional stack templates (Python, Node.js, Next.js)
- Multi-project in same repo support
- Cross-IDE support (VS Code, others)
- Agent marketplace/registry
- Team sync/collaboration features
- SSO/SAML integration

## Out of Scope

- Building another IDE (use Cursor)
- Training custom models (use existing LLM APIs)
- Replacing MCP (build on MCP)
- Real-time collaboration (use Git)
- SaaS-only model (CLI-first)

---

## Traceability

| REQ | Phase | Priority | Complexity | Status |
|-----|-------|----------|------------|--------|
| REQ-001 | 1 | High | High | ✅ Complete |
| REQ-002 | 1 | High | Medium | ✅ Complete |
| REQ-003 | 2 | High | High | ✅ Complete |
| REQ-004 | 2 | Medium | Medium | ✅ Complete |
| REQ-005 | 2 | High | High | ✅ Complete |
| REQ-006 | 1 | Medium | Medium | ✅ Complete |
| REQ-007 | 3 | Medium | Medium | ✅ Complete |
| REQ-008 | 3 | High | Low | ✅ Complete |

---

*Requirements last updated: 2026-02-04*
