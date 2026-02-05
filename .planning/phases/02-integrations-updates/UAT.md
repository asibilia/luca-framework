# Phase 2 User Acceptance Testing (UAT)

**Goal:** Verify that the Integrations & Updates features work as expected in a real environment.

## 1. Work Tracker Adapters

### 1.1 Placeholder Adapter (Default)

- [ ] **Action:** Configure `luca.config.json` with `"workTracker": { "type": "none" }`.
- [ ] **Action:** Run a command that requires a ticket (e.g., `luca start PROJ-123`).
- [ ] **Expectation:** Should succeed with a generic/synthetic ticket.

### 1.2 GitHub Issues Adapter

- [ ] **Prerequisite:** `gh` CLI installed and authenticated (`gh auth status`).
- [ ] **Action:** Configure `luca.config.json` with `"workTracker": { "type": "github" }`.
- [ ] **Action:** Run `luca start <issue-number>` (ensure issue exists in current repo).
- [ ] **Expectation:** Should fetch issue title, type (from labels), and priority (from labels).

### 1.3 Jira Adapter

- [ ] **Prerequisite:** `JIRA_HOST`, `JIRA_EMAIL`, `JIRA_API_TOKEN` set in environment.
- [ ] **Action:** Configure `luca.config.json` with `"workTracker": { "type": "jira" }`.
- [ ] **Action:** Run `luca start <ticket-id>`.
- [ ] **Expectation:** Should fetch ticket summary, type, and priority from Jira.

## 2. Update Mechanism

### 2.1 Update Command

- [ ] **Action:** Run `npx luca update --help`.
- [ ] **Expectation:** Should show help text with options (`--dry-run`, `--force`).

### 2.2 Conflict Detection (Simulation)

- [ ] **Action:** Modify a file that is managed by the framework (e.g., a config file).
- [ ] **Action:** Run `npx luca update` (mocking a new version if possible, or just verifying it scans).
- [ ] **Expectation:** Should detect the user modification and prompt/warn (or show in dry-run).

## 3. Approvals & Notifications

### 3.1 Version Check

- [ ] **Action:** Run `npx luca init` (or any command).
- [ ] **Expectation:** Should check for updates in the background (silent unless update available).

### 3.2 Approval Config

- [ ] **Action:** Check `.planning/config.json` for `approvals` section.
- [ ] **Expectation:** Should contain `plans`, `destructive`, `external` booleans.
