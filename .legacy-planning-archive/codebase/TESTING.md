# Testing Patterns

**Analysis Date:** 2026-02-04

## Test Framework

**Runner:**
- Bun test framework (mentioned in AGENTS.md)
- Config: Not explicitly configured in framework codebase
- Framework focuses on verification patterns, not unit testing

**Assertion Library:**
- Bun's built-in `expect` from `bun:test`
- Pattern: `describe`, `test`, `expect` from `bun:test`

**Run Commands:**
```bash
bun test              # Run all tests
bun test --watch      # Watch mode
bun test --coverage   # Coverage report
```

**Note:** Framework codebase itself doesn't contain test files - this framework provides verification patterns for projects using Luca.

## Verification Approach

**Goal-Backward Verification:**
The framework uses goal-backward verification methodology:

1. **State the goal** - What outcome should be achieved?
2. **Derive observable truths** - What must be TRUE for goal achievement?
3. **Derive required artifacts** - What files must EXIST?
4. **Derive required wiring** - What must be CONNECTED?
5. **Verify each level** - Check existence, substantive content, wiring

**Core Principle:** Task completion ≠ Goal achievement

A task can be marked complete when a file exists, but the goal may not be achieved if the file is a stub or unwired.

## Three-Level Verification

**Level 1: Existence**
```bash
check_exists() {
  local path="$1"
  [ -f "$path" ] && echo "EXISTS" || echo "MISSING"
}
```

**Level 2: Substantive**
Check that file has real implementation, not stub:

```bash
# Line count check
check_length() {
  local path="$1"
  local min_lines="$2"
  local lines=$(wc -l < "$path" 2>/dev/null || echo 0)
  [ "$lines" -ge "$min_lines" ] && echo "SUBSTANTIVE" || echo "THIN"
}

# Stub pattern check
check_stubs() {
  local path="$1"
  grep -E "TODO|FIXME|placeholder|not implemented" "$path" && echo "STUB_PATTERNS" || echo "NO_STUBS"
}
```

Minimum lines by type:
- Component: 15+ lines
- API route: 10+ lines
- Hook/util: 10+ lines
- Schema model: 5+ lines

**Level 3: Wired**
Check that artifact is connected to system:

```bash
# Import check
check_imported() {
  local artifact_name="$1"
  local search_path="${2:-src/}"
  grep -r "import.*$artifact_name" "$search_path" && echo "IMPORTED" || echo "NOT_IMPORTED"
}

# Usage check
check_used() {
  local artifact_name="$1"
  local search_path="${2:-src/}"
  grep -r "$artifact_name" "$search_path" | grep -v "import" && echo "USED" || echo "NOT_USED"
}
```

## Stub Detection Patterns

**Universal Stub Patterns:**
```bash
# Comment-based stubs
grep -E "(TODO|FIXME|XXX|HACK|PLACEHOLDER)" "$file"
grep -E "implement|add later|coming soon|will be" "$file" -i

# Placeholder text
grep -E "placeholder|lorem ipsum|coming soon|under construction" "$file" -i

# Empty implementations
grep -E "return null|return undefined|return \{\}|return \[\]" "$file"

# Console.log only
grep -E "console\.(log|warn|error).*only" "$file"
```

**React Component Stubs:**
```javascript
// RED FLAGS:
return <div>Component</div>
return <div>Placeholder</div>
return <div>{/* TODO */}</div>
return null
return <></>

// Empty handlers:
onClick={() => {}}
onChange={() => console.log('clicked')}
onSubmit={(e) => e.preventDefault()}  // Only prevents default
```

**API Route Stubs:**
```typescript
// RED FLAGS:
export async function POST() {
  return Response.json({ message: "Not implemented" })
}

export async function GET() {
  return Response.json([])  // Empty array with no DB query
}

// Console log only:
export async function POST(req) {
  console.log(await req.json())
  return Response.json({ ok: true })
}
```

**Wiring Red Flags:**
```typescript
// Fetch exists but response ignored:
fetch('/api/messages')  // No await, no .then, no assignment

// Query exists but result not returned:
await prisma.message.findMany()
return Response.json({ ok: true })  // Returns static, not query result

// Handler only prevents default:
onSubmit={(e) => e.preventDefault()}

// State exists but not rendered:
const [messages, setMessages] = useState([])
return <div>No messages</div>  // Always shows "no messages"
```

## Verification Patterns by Artifact Type

**React/Next.js Components:**
- Check file exists and exports component
- Check returns actual JSX, not placeholder
- Check uses props or state (not static)
- Check event handlers have real implementations
- Check imports resolve correctly
- Check component is used somewhere

**API Routes:**
- Check route file exists
- Check exports HTTP method handlers
- Check has actual logic (more than 5 lines)
- Check interacts with data source
- Check has error handling
- Check returns meaningful response
- Check validates input
- Check called from frontend

**Database Schema:**
- Check model/table defined
- Check has all expected fields
- Check fields have appropriate types
- Check relationships defined if needed
- Check migrations exist and applied
- Check client generated

**Custom Hooks/Utilities:**
- Check file exists and exports function
- Check has meaningful implementation
- Check used somewhere in app
- Check return values consumed

## Wiring Verification Patterns

**Component → API:**
```bash
verify_component_api_link() {
  local component="$1"
  local api_path="$2"
  
  # Check for fetch/axios call
  grep -E "fetch\(['\"].*$api_path|axios\.(get|post).*$api_path" "$component"
  
  # Check if response is used
  grep -A 5 "fetch\|axios" "$component" | grep -E "await|\.then|setData|setState"
}
```

**API → Database:**
```bash
verify_api_db_link() {
  local route="$1"
  local model="$2"
  
  # Check for Prisma/DB call
  grep -E "prisma\.$model|db\.$model|$model\.(find|create|update|delete)" "$route"
  
  # Check if result is returned
  grep -E "return.*json.*\w+|res\.json\(\w+" "$route"
}
```

**Form → Handler:**
```bash
verify_form_handler_link() {
  local component="$1"
  
  # Find onSubmit handler
  grep -E "onSubmit=\{|handleSubmit" "$component"
  
  # Check if handler has real implementation
  grep -A 10 "onSubmit.*=" "$component" | grep -E "fetch|axios|mutate|dispatch"
}
```

**State → Render:**
```bash
verify_state_render_link() {
  local component="$1"
  local state_var="$2"
  
  # Check if state variable exists
  grep -E "useState.*$state_var|\[$state_var," "$component"
  
  # Check if state is used in JSX
  grep -E "\{.*$state_var.*\}|\{$state_var\." "$component"
}
```

## User Acceptance Testing (UAT)

**UAT Workflow:**
The framework provides `/lu-verify-work` command for conversational UAT:

1. **Extract tests** from SUMMARY.md deliverables
2. **Present tests** one at a time with expected behavior
3. **User responds** with pass confirmation or issue description
4. **Update results** (pass/issue/skipped)
5. **Infer severity** from user's natural language
6. **Track gaps** in YAML format for gap closure planning

**UAT File Format:**
```yaml
---
status: testing | complete | diagnosed
phase: XX-name
source: [SUMMARY.md files]
started: [ISO timestamp]
updated: [ISO timestamp]
---

## Tests
### 1. [Test Name]
expected: [observable behavior]
result: pass | issue | skipped | pending

## Gaps
- truth: "[expected behavior]"
  status: failed
  reason: "User reported: [response]"
  severity: blocker | major | minor | cosmetic
```

**Severity Inference:**
- Crash, error, exception, fails completely → blocker
- Doesn't work, nothing happens, wrong behavior → major
- Works but..., slow, weird, minor issue → minor
- Color, font, spacing, alignment → cosmetic
- Default: major (if unclear)

## Human vs Automated Verification

**Always Human:**
- Visual appearance (does it look right?)
- User flow completion (can you do the full task?)
- Real-time behavior (WebSocket, SSE updates)
- External service integration (payments, email)
- Performance feel (does it feel fast?)
- Error message clarity

**Human if Uncertain:**
- Complex wiring that grep can't trace
- Dynamic behavior depending on state
- Edge cases and error states
- Mobile responsiveness
- Accessibility

**Automated Checks:**
- File existence
- Stub pattern detection
- Wiring verification (grep-based)
- Export/import checks
- Line count validation
- Basic structure validation

## Verification Status Values

**Truth Status:**
- `✓ VERIFIED` - All supporting artifacts pass all checks
- `✗ FAILED` - One or more supporting artifacts missing, stub, or unwired
- `? UNCERTAIN` - Can't verify programmatically (needs human)

**Artifact Status:**
- `✓ VERIFIED` - Exists + Substantive + Wired
- `⚠️ ORPHANED` - Exists + Substantive but not Wired
- `✗ STUB` - Exists but not Substantive
- `✗ MISSING` - File doesn't exist

**Overall Status:**
- `passed` - All truths verified, all artifacts pass, all links wired
- `gaps_found` - One or more truths failed or artifacts missing/stub/unwired
- `human_needed` - Automated checks pass but items flagged for human verification

## Verification Checklist

**Component Checklist:**
- [ ] File exists at expected path
- [ ] Exports a function/const component
- [ ] Returns JSX (not null/empty)
- [ ] No placeholder text in render
- [ ] Uses props or state (not static)
- [ ] Event handlers have real implementations
- [ ] Imports resolve correctly
- [ ] Used somewhere in the app

**API Route Checklist:**
- [ ] File exists at expected path
- [ ] Exports HTTP method handlers
- [ ] Handlers have more than 5 lines
- [ ] Queries database or service
- [ ] Returns meaningful response (not empty/placeholder)
- [ ] Has error handling
- [ ] Validates input
- [ ] Called from frontend

**Schema Checklist:**
- [ ] Model/table defined
- [ ] Has all expected fields
- [ ] Fields have appropriate types
- [ ] Relationships defined if needed
- [ ] Migrations exist and applied
- [ ] Client generated

**Wiring Checklist:**
- [ ] Component → API: fetch/axios call exists and uses response
- [ ] API → Database: query exists and result returned
- [ ] Form → Handler: onSubmit calls API/mutation
- [ ] State → Render: state variables appear in JSX

## Verification Report Format

**VERIFICATION.md Structure:**
```markdown
---
phase: XX-name
verified: YYYY-MM-DDTHH:MM:SSZ
status: passed | gaps_found | human_needed
score: N/M must-haves verified
gaps:  # Only if gaps_found
  - truth: "[observable truth]"
    status: failed
    reason: "[why it failed]"
    artifacts: []
    missing: []
---

# Phase {X}: {Name} Verification Report

## Goal Achievement

### Observable Truths
| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | {truth} | ✓ VERIFIED | {evidence} |

### Required Artifacts
| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|

### Key Link Verification
| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
```

## Re-Verification Mode

**When Previous Verification Exists:**
1. Load previous VERIFICATION.md frontmatter
2. Extract `must_haves` and `gaps`
3. **Failed items:** Full 3-level verification (exists, substantive, wired)
4. **Passed items:** Quick regression check (existence + basic sanity only)
5. Track gaps closed and regressions

**Re-verification Metadata:**
```yaml
re_verification:
  previous_status: gaps_found
  previous_score: 2/5
  gaps_closed:
    - "Truth that was fixed"
  gaps_remaining: []
  regressions: []  # Items that passed before but now fail
```

## Gap Closure Integration

**Gap Structure for Planning:**
Gaps are structured in YAML format for consumption by `/lu-plan-phase --gaps`:

```yaml
gaps:
  - truth: "User can see existing messages"
    status: failed
    reason: "Chat.tsx exists but doesn't fetch from API"
    artifacts:
      - path: "src/components/Chat.tsx"
        issue: "No useEffect with fetch call"
    missing:
      - "API call in useEffect to /api/chat"
      - "State for storing fetched messages"
      - "Render messages array in JSX"
```

**Gap Closure Flow:**
1. Verification identifies gaps
2. UAT captures user-reported issues
3. Diagnosis workflow investigates root causes
4. Planner creates fix plans (`/lu-plan-phase --gaps`)
5. Executor implements fixes (`/lu-execute-phase --gaps-only`)
6. Re-verification confirms gaps closed

## Anti-Pattern Detection

**Scan Modified Files:**
```bash
# Extract files from SUMMARY.md
grep -E "^\- \`" "$PHASE_DIR"/*-SUMMARY.md | sed 's/.*`\([^`]*\)`.*/\1/' | sort -u
```

**Anti-Pattern Categories:**
- 🛑 Blocker: Prevents goal achievement (placeholder renders, empty handlers)
- ⚠️ Warning: Indicates incomplete (TODO comments, console.log)
- ℹ️ Info: Notable but not problematic

**Common Anti-Patterns:**
- TODO/FIXME comments in committed code
- Placeholder content in UI
- Empty implementations (`return null`, `return {}`)
- Console.log-only functions
- Hardcoded values where dynamic expected

## Verification Performance

**Fast Verification:**
- Use grep/file checks, not running the app
- Goal is structural verification, not functional testing
- Check existence, patterns, wiring - not runtime behavior

**Verification Scope:**
- Focus on must-haves from phase goal
- Verify artifacts that support observable truths
- Check key links (critical connections)
- Don't verify everything - verify what matters for goal

**Verification Timing:**
- Runs after phase execution completes
- Can run in re-verification mode after gap fixes
- Integrated into `/lu-execute-phase` workflow
- Always runs regardless of task complexity

---

*Testing analysis: 2026-02-04*
*Update when verification patterns change*
