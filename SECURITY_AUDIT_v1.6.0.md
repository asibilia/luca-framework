# Security Audit Report: v1.6.0 Milestone

**Date:** 2026-02-16
**Scope:** 96 changed TypeScript files
**Threat Model:** Developer tool (local execution, not a web service)

## Executive Summary

The codebase demonstrates **strong security posture** for a developer tool. Key findings:

- **3 MEDIUM-severity issues** identified (all low-risk for typical developer usage)
- **0 CRITICAL or HIGH issues** detected
- Proper input validation across CLI bridges
- Safe JSON parsing with schema validation
- No command injection vectors in shell scripts

---

## Issues

### Issue 1: Lodash `get`/`set` with Untrusted Path Argument

**Severity:** MEDIUM
**File:** `/Users/alecsibilia/Github/luca-framework/packages/luca-state/src/bridge.ts`
**Lines:** 275 (read-field), 369 (set-field)

**Description:**
The `read-field` and `set-field` commands accept arbitrary lodash paths from CLI arguments without path validation:

```typescript
// Line 275: handleReadField
const fieldPath = getArg(args, "field");
const value = get(snapshot.context, fieldPath); // Line 288

// Line 369: handleSetField
set(updatedContext, fieldPath, value); // Lodash path without validation
```

While the `set-field` command implements an allowlist (lines 300-311), the **`read-field` command has no allowlist** and accepts any lodash path. This could expose sensitive fields like `gates`, `session_id`, or internal state.

**Impact:**

- Information disclosure: An attacker (or typo) could read any context field
- Since this is a local tool, the attacker must have shell access already
- Sensitive data is not leaked beyond the local machine

**Suggestion:**
Add a `READABLE_FIELDS` allowlist similar to `SETTABLE_FIELDS`, or require explicit permission to read arbitrary fields:

```typescript
// Add at module level
const READABLE_FIELDS = [...SETTABLE_FIELDS, "state", "current_state"] as const;

// In handleReadField, add validation
if (!READABLE_FIELDS.includes(fieldPath as any)) {
  console.error(
    `Field "${fieldPath}" is not readable. Allowed: ${READABLE_FIELDS.join(", ")}`,
  );
  process.exit(2);
}
```

---

### Issue 2: Unsafe Checkpoint Path Construction with Untrusted Phase ID

**Severity:** MEDIUM
**File:** `/Users/alecsibilia/Github/luca-framework/packages/luca-state/src/bridge.ts`
**Lines:** 732, 818

**Description:**
The checkpoint path is constructed using untrusted phase ID from CLI arguments without bounds checking:

```typescript
// Line 676: handleSuspend - phaseId parsed from user input
const phaseStr = getArg(args, "phase");
const phaseId = parseInt(phaseStr, 10);
if (!Number.isFinite(phaseId) || phaseId < 0) {
  /* exits */
}

// Line 732: Path construction - no upper bound
const checkpointPath = `${CHECKPOINTS_DIR}/suspend-${phaseId}.json`;
```

While the code validates that `phaseId >= 0` and is finite, it does **not validate an upper bound**. This allows:

- Creating millions of checkpoint files if attackers can invoke the command multiple times
- Potential filesystem bloat (DoS on storage)
- No path traversal risk (phaseId is numeric), but resource exhaustion possible

Similarly in `handleResumePhase` (line 818):

```typescript
const checkpointPath = `${CHECKPOINTS_DIR}/suspend-${phaseId}.json`;
```

**Impact:**

- Denial of Service via filesystem exhaustion
- Requires attacker to have CLI access (local tool assumption)
- Moderate risk for shared development environments

**Suggestion:**
Add an upper bound to phase IDs:

```typescript
const phaseId = parseInt(phaseStr, 10);
const MAX_PHASE_ID = 999999; // Reasonable upper limit
if (!Number.isFinite(phaseId) || phaseId < 0 || phaseId > MAX_PHASE_ID) {
  console.error(`Invalid phase number: ${phaseStr}`);
  process.exit(2);
}
```

Or validate phase ID against the actual machine state:

```typescript
const loadResult = await loadPersistedActor();
const snapshot = loadResult.data.getSnapshot();
const validPhases = snapshot.context.phase_results.map((p) => p.phase_id);
if (!validPhases.includes(phaseId)) {
  console.error(`Phase ${phaseId} not found in workflow`);
  process.exit(2);
}
```

---

### Issue 3: Unsafe JSON Parsing in `set-field` Value Parameter

**Severity:** MEDIUM
**File:** `/Users/alecsibilia/Github/luca-framework/packages/luca-state/src/bridge.ts`
**Lines:** 343-349

**Description:**
The `set-field` command attempts to parse user-supplied value as JSON without validation:

```typescript
// Line 346
const rawValue = getArg(args, "value");
let value: any;
try {
  value = JSON.parse(rawValue); // Accepts ANY valid JSON
} catch {
  value = rawValue; // Falls back to string
}

// Line 372: Validated only against schema
const validation = workflowContextSchema.safeParse(updatedContext);
```

While the code eventually validates against `workflowContextSchema`, it allows intermediate parsing of arbitrary JSON structures that might not match the schema's intent. The schema validation will catch invalid types, but:

1. Complex JSON payloads could cause memory exhaustion on very large inputs
2. No limit on JSON depth/nesting
3. The fallback behavior (treating unparseable strings as literals) creates ambiguous behavior

**Impact:**

- Low risk: Zod schema validation provides defense-in-depth
- Potential DoS via deeply nested JSON (malicious complexity)
- Not a code injection risk (JSON.parse is safe for untrusted input)

**Suggestion:**
Add JSON size/depth limits:

```typescript
const MAX_JSON_SIZE = 10000; // 10KB
const MAX_JSON_DEPTH = 20;

if (rawValue.length > MAX_JSON_SIZE) {
  console.error("Value exceeds maximum size");
  process.exit(2);
}

let value: any;
try {
  // Validate depth during parsing
  const depthTracker = { depth: 0, maxDepth: MAX_JSON_DEPTH };
  value = JSON.parse(rawValue, (key, val) => {
    if (typeof val === "object" && val !== null) {
      depthTracker.depth++;
      if (depthTracker.depth > depthTracker.maxDepth) {
        throw new Error("JSON nesting too deep");
      }
    }
    return val;
  });
} catch (e) {
  if (e instanceof Error && e.message.includes("nesting")) {
    console.error("JSON too deeply nested");
    process.exit(2);
  }
  value = rawValue;
}
```

---

## Non-Issues (Verified Safe)

### ✅ Command Injection in Hook Scripts

**Assessment:** SAFE

The `pre-commit-gate.sh` script safely extracts the command:

```bash
COMMAND=$(printf '%s' "$INPUT" | bun -e "
  const data = JSON.parse(await Bun.stdin.text());
  const cmd = data.tool_input?.command ?? data.command ?? '';
  process.stdout.write(cmd);
")
```

The command is **never executed or interpolated**—only pattern-matched via bash `case` statement (glob matching, not regex). Lines 29-54 provide clear documentation of the security invariants.

### ✅ Path Traversal in State File Operations

**Assessment:** SAFE

The state file path is hardcoded:

```typescript
export const STATE_FILE_PATH = ".planning/state.json";
```

File operations use `Bun.file()` and `Bun.write()` with constant paths. No user-supplied paths are concatenated.

### ✅ Shell Injection in Hook Script Config Reading

**Assessment:** SAFE

The hook scripts use environment variables to pass paths, not shell substitution:

```bash
HOOK_CONFIG="$PLANNING_DIR/config.json" bun -e "..."
```

Config file parsing via `Bun.file()` and `JSON.parse()` is safe for untrusted input.

### ✅ Memory Bridge File Operations

**Assessment:** SAFE

The memory bridge accepts section names validated against an allowlist:

```typescript
if (!WORKING_MEMORY_SECTIONS.includes(sectionName as any)) {
  console.error(`Invalid section...`);
  process.exit(2);
}
```

File paths use constant `.planning/` directory with validated names.

### ✅ JSON Deserialization Safety

**Assessment:** SAFE

All JSON parsing includes proper error handling:

- `snapshot = JSON.parse(text)` followed by XState actor instantiation validates the shape
- Config file parsing gracefully degrades to defaults on parse errors
- Checkpoint files validated with Zod schemas

### ✅ Session Lock and Manifest Files

**Assessment:** SAFE

Session lock creation uses constants:

```bash
lockPath = path.join(projectDir, '.claude', '.session-lock');
```

No path traversal possible.

---

## Recommendations Summary

| Priority | Action                                    | Effort |
| -------- | ----------------------------------------- | ------ |
| MEDIUM   | Add allowlist to `read-field` command     | 10 min |
| MEDIUM   | Add upper bound validation to phase IDs   | 5 min  |
| MEDIUM   | Add JSON size/depth limits to `set-field` | 15 min |

---

## Threat Model Notes

**This is a developer tool, not a web service:**

- Threat actors must have local shell access
- Assumes .planning/ directory is in source control or gitignore (user responsibility)
- Main concern is "confused deputy" scenarios where tool is used in unexpected ways
- No authentication/authorization checks needed (local execution context)

---

## Testing Recommendations

```bash
# Test phase ID bounds
bun run src/state-machine/bridge.ts suspend --phase=999999999
bun run src/state-machine/bridge.ts suspend --phase=-1

# Test large JSON values
bun run src/state-machine/bridge.ts set-field --field=complexity --value='{"deep":{"nested":...}}'

# Test field enumeration
bun run src/state-machine/bridge.ts read-field --field=gates.confirm_plan
bun run src/state-machine/bridge.ts read-field --field=_internal_state
```

---

## Conclusion

**Security Grade: B+ (Strong for developer tool)**

The codebase demonstrates:

- ✅ Proper input validation framework
- ✅ Schema-based validation consistency
- ✅ Safe JSON parsing practices
- ✅ No shell injection vectors
- ⚠️ Opportunity to tighten field access controls
- ⚠️ Opportunity to add resource limits to CLI operations

Recommend fixing the MEDIUM issues before v1.6.0 release for hardened developer experience.
