# Procedures

> Executable learned procedures extracted from successful executions.
> Recalled during planning to suggest proven step sequences.

## Active Procedures

### Add API Endpoint

- **Trigger**: When adding a new REST API endpoint
- **Source**: lu-executor (Phase 10)
- **Tags**: [api, coding]
- **Success Rate**: 0.80 (4/5)
- **Last Executed**: 2026-02-14
- **Status**: Active

**Steps:**

1. Define route handler
2. Add input validation [tool: zod]
3. Implement business logic
4. Write integration test -> output: test file

---

### Run Test Suite

- **Trigger**: When verifying code changes
- **Source**: general
- **Tags**: [testing, verification]
- **Success Rate**: 0.90 (9/10)
- **Last Executed**: 2026-02-15
- **Status**: Active

**Steps:**

1. Run bun test
2. Check coverage report -> output: coverage summary
3. Fix any failures

---

## Retired Procedures

### Legacy Deploy Script

- **Trigger**: When deploying to production
- **Source**: general
- **Tags**: [deployment]
- **Success Rate**: 0.20 (1/5)
- **Last Executed**: 2025-06-01
- **Status**: Retired
- **Retirement Reason**: Low success rate

**Steps:**

1. Build the project
2. Deploy to server

---

_Procedure Statistics_

- Total active: 2
- Total retired: 1
- Average success rate: 0.85
- Last updated: 2026-02-15
