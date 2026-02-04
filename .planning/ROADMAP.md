# Roadmap

## Overview

3-phase roadmap to package Luca framework as distributable CLI-installable agent framework for Cursor IDE.

**Goal:** Zero-friction adoption with `npx luca init`, working in 5 minutes.

---

## Phase 1: Core CLI & Foundation

**Goal:** Working CLI installer that scaffolds a functional Luca project.

**Success Criteria:**

- `npx luca init` creates working Luca installation
- Time-to-first-value under 5 minutes
- Branding customizable via config
- React+TS stack template available

### Requirements Delivered

| REQ | Description | Priority |
|-----|-------------|----------|
| REQ-001 | CLI Installation & Setup | High |
| REQ-002 | Configurable Branding | High |
| REQ-006 | Stack Templates (React+TS) | Medium |

### Key Tasks

1. **Package Setup**
   - Create `create-luca` npm package (scaffolding)
   - Create `luca-framework` npm package (core CLI)
   - Configure unbuild for bundling
   - Set up package.json bin fields

2. **CLI Framework**
   - Implement citty command structure
   - Add @clack/prompts for interactive wizard
   - Configure consola for logging/output

3. **Init Command**
   - Interactive setup wizard
   - Project name, branding, stack selection
   - File generation from templates
   - manifest.json creation

4. **Origin/User Separation**
   - Restructure existing files into `.cursor/origin/`
   - Define user override directories
   - Update all file references

5. **Branding System**
   - Config schema with branding section
   - Replace hardcoded PT-/ENG- with config lookups
   - Template variable substitution in outputs

6. **Stack Templates**
   - React+TypeScript template
   - BRAIN.md with conventions
   - Recommended rules files

### Dependencies

- None (foundation phase)

### Risks

- File restructuring may break existing installations
- Branding replacement scope larger than expected

---

## Phase 2: Integrations & Updates

**Goal:** Pluggable work tracking and intelligent framework updates.

**Success Criteria:**

- Work tracker adapter interface defined
- Jira and GitHub Issues adapters functional
- `npx luca update` safely updates framework
- Approval workflows configurable

### Requirements Delivered

| REQ | Description | Priority |
|-----|-------------|----------|
| REQ-003 | Pluggable Work Tracking | High |
| REQ-004 | Configurable Approvals | Medium |
| REQ-005 | Update Mechanism | High |

### Key Tasks

1. **Work Tracker Interface**
   - Define `WorkTrackerContract` TypeScript interface
   - Create adapter base class/factory
   - Integration point in workflows

2. **Built-in Adapters**
   - Jira adapter (Atlassian MCP)
   - GitHub Issues adapter (gh CLI)
   - Placeholder adapter (no external system)

3. **Update Command**
   - `npx luca update` implementation
   - manifest.json hash comparison
   - Conflict detection algorithm
   - Backup before update
   - Conflict resolution directory

4. **Version Notification**
   - Check npm registry on init
   - Non-blocking notification
   - Link to changelog

5. **Approval Configuration**
   - Extend config.json schema
   - Hook into existing gate system
   - Audit trail for approval decisions

### Dependencies

- Phase 1 (config system, CLI framework)

### Risks

- MCP fragility for Jira integration
- Update conflicts harder to resolve than expected

---

## Phase 3: Enterprise Readiness

**Goal:** Enterprise adoption requirements met with security documentation and diagnostics.

**Success Criteria:**

- `npx luca doctor` provides clear health status
- Security posture documented
- Enterprise teams can evaluate and adopt

### Requirements Delivered

| REQ | Description | Priority |
|-----|-------------|----------|
| REQ-007 | Diagnostic Tooling | Medium |
| REQ-008 | Enterprise Security Docs | High |

### Key Tasks

1. **Doctor Command**
   - Node.js version check
   - Cursor IDE detection
   - MCP server status
   - Config validation
   - Framework version check
   - Clear remediation suggestions

2. **Security Documentation**
   - SECURITY.md with posture details
   - Data handling documentation
   - Supply chain security
   - Audit trail capabilities
   - Version pinning guidance

3. **Enterprise Support**
   - Security questionnaire template
   - SOC 2 alignment documentation
   - Offline/air-gapped considerations

4. **Polish & Documentation**
   - README.md for npm packages
   - Getting Started guide
   - Troubleshooting guide
   - Migration guide from existing Luca

### Dependencies

- Phase 1 & 2 complete

### Risks

- Security documentation review may surface issues
- Enterprise requirements may expand scope

---

## Timeline (Relative)

| Phase | Scope | Sequence |
|-------|-------|----------|
| Phase 1 | Core CLI & Foundation | First |
| Phase 2 | Integrations & Updates | After Phase 1 |
| Phase 3 | Enterprise Readiness | After Phase 2 |

---

## Success Metrics

### Phase 1

- [ ] `npx luca init` works end-to-end
- [ ] Time-to-first-value < 5 minutes
- [ ] Zero hardcoded company references
- [ ] React+TS template generates valid BRAIN.md

### Phase 2

- [ ] Jira adapter fetches tickets successfully
- [ ] `npx luca update` preserves user modifications
- [ ] Approval config respected by workflows

### Phase 3

- [ ] `npx luca doctor` detects common issues
- [ ] SECURITY.md passes enterprise security review
- [ ] Migration from existing Luca documented

---

*Roadmap created: 2026-02-04*
