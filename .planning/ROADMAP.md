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

**Plans:** 5 plans

Plans:
- [ ] 01-01-PLAN.md — Monorepo package structure (Wave 1)
- [ ] 01-02-PLAN.md — CLI framework & command structure (Wave 2)
- [ ] 01-03-PLAN.md — Template infrastructure & branding (Wave 2, parallel)
- [ ] 01-04-PLAN.md — Init wizard & file generation (Wave 3)
- [ ] 01-05-PLAN.md — React+TS stack & integration verification (Wave 4)

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

**Plans:** 5 plans

Plans:
- [ ] 02-01-PLAN.md — Work tracker foundation: contract, factory, placeholder (Wave 1)
- [ ] 02-02-PLAN.md — GitHub Issues adapter via gh CLI (Wave 2)
- [ ] 02-03-PLAN.md — Jira REST API adapter (Wave 2, parallel)
- [ ] 02-04-PLAN.md — Update mechanism: manifest comparison & command (Wave 2, parallel)
- [ ] 02-05-PLAN.md — Version notifications & approval configuration (Wave 3)

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
