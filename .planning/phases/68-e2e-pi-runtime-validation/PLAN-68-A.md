---
id: 68-A
title: "Extension loading smoke tests and tool response validation"
phase: 68
wave: 1
depends_on: ["67-B", "67-C"]
---

# Plan 68-A: Extension Loading Smoke Tests and Tool Response Validation

## Objective

Validate all 12 Pi extensions load correctly, register expected tools/events, and return valid Pi-compatible responses. Also fix the __helpers/index.ts auto-discovery issue.

## Tasks

### Task 1: Fix __helpers auto-discovery issue
- Remove index.ts from PI_HELPER_FILES (Pi discovers .pi/extensions/*/index.ts as extensions)
- Extensions import directly from individual helper files, not barrel

### Task 2: Extension loading smoke test
- Load all 12 extensions via Bun import
- Verify each exports a default function
- Mock Pi API and verify tool/event registration counts match expected

### Task 3: Tool response validation
- Call 18+ tools with representative parameters
- Verify all return `{ content: [{ type: "text", text: string }] }` shape
- Verify JSON responses parse correctly

### Task 4: Cross-extension integration
- Load all 12 extensions into single mock Pi
- Test 6 cross-extension workflows (complexity→gates, chain lifecycle, safety rules, research sessions, purpose gating, role management)

## Verification

- All 12 extensions load without errors
- All 39 tools registered
- All tool responses have valid Pi response shape
- Cross-extension state sharing works
