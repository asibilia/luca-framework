# Phase 226 — Security Hardening: Context

## Decisions

### 1. Exact Skill Matching (SEC-001) [researched]

**Decision:** Replace `skillArg.includes(name)` with exact match logic in `enforcement-hook-factory.ts`. The skill name is extracted from `tool_input.skill` (exact name) or parsed from `tool_input.args` (first token before space).

**Pattern:**
```typescript
const skillName = (toolInput?.skill as string) || 
  ((toolInput?.args as string) || "").split(/\s+/)[0];
// Then exact set lookup: subSkills.has(skillName)
```

**Rationale:** Code review (Security + DX) flagged substring matching as a false-positive risk. Exact match is safer and simpler.

### 2. Context File Validation (SEC-002, SEC-006) [researched]

**Decision:** Add Zod safeParse for `current_state` validation in the enforcement hook factory. Also migrate from `readFileSync` to `Bun.file` (flagged by DX reviewer as critical).

**Additionally:** Migrate `pre-step-pr-address.ts` to use the factory (flagged by simplifier as remaining duplication).

**Rationale:** Code review flagged JSON.parse without schema validation and node:fs usage.

### 3. File Permissions (SEC-003, SEC-004, SEC-005) [researched]

**Decision:** Set `0o600` permissions on context files when writing via `Bun.write`. Add to `createContextHelpers` write function. Validate bridge CLI arguments with allowlisted patterns.

**Rationale:** Context files in /tmp contain workflow state — restrict to owner-only access.

## Scope Boundary

- Fix exact skill matching in factory (SEC-001)
- Add Zod validation + migrate to Bun.file in factory (SEC-002, SEC-006) 
- Migrate pre-step-pr-address.ts to factory (review finding)
- Set file permissions on context files (SEC-003, SEC-004, SEC-005)
- Do NOT change state machine definitions or orchestrator logic
