# Phase 3: Enterprise Readiness - Context

**Gathered:** 2026-02-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Enterprise adoption requirements met with security documentation and diagnostics. Deliverables include `npx luca doctor` command, `SECURITY.md`, and enterprise support documentation.

</domain>

<decisions>
## Implementation Decisions

### Doctor Command Experience
- **Output:** Interactive TUI (Terminal UI) for better user experience.
- **Auto-fix:** Report only — user fixes manually to avoid accidental destructive changes.
- **Scope:** Comprehensive checks including Basic environment, Deep diagnostics, and Network latency/Connectivity.
- **Privacy:** Redact ALL secrets/keys in output to ensure safety for enterprise sharing.

### Security Documentation
- **Compliance:** Align with General Best Practices (OWASP, etc.) rather than specific certifications like SOC2 for now.
- **Depth:** High-level overview focusing on Policy & Governance.
- **Location:** `SECURITY.md` in the repository (Standard practice).
- **Reporting:** Direct users to a Security Email for vulnerability reporting.

### Enterprise Support
- **Channels:** Email Support Only to manage volume.
- **SLAs:** No specific SLAs defined (Best effort) to set realistic expectations.
- **Questionnaire:** Provide a Markdown template in the repo for self-service.
- **Onboarding:** Documentation-driven (Self-serve) to minimize high-touch requirements.

### Claude's Discretion
- Specific TUI library selection (e.g., Ink, Pastel, or simple chalk/inquirer).
- Exact structure of the security questionnaire template.
- Specific network endpoints to test in the doctor command.

</decisions>

<specifics>
## Specific Ideas

- The doctor command should feel like a professional diagnostic tool, similar to `flutter doctor` or `brew doctor`, but with an interactive TUI element.
- Security docs should be concise and reassuring for enterprise buyers/security teams.

</specifics>

<deferred>
## Deferred Ideas

- Automated remediation (Auto-fix) for doctor command — future phase.
- SOC 2 / ISO compliance specific documentation — future phase.
- Dedicated enterprise support portal — future phase.

</deferred>

---

*Phase: 03-enterprise-readiness*
*Context gathered: 2026-02-04*
