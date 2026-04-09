# Plan: System Reminder TUI Notifications for Pipeline Mode Transitions

## Objective

Wrap the `buildContinuationMessage()` output in `<system-reminder>` XML tags so that every Luca pipeline mode transition renders as an amber-bordered `SystemReminderComponent` in MastraTUI, with a pipeline progress indicator showing the current step and intent summary.

## Context

**Mechanism (confirmed from MastraTUI source):**
- `harness.sendMessage({ content })` sends a user-role message
- `addUserMessage()` in MastraTUI checks the content with the regex `/<system-reminder(?<attrs>\s+[^>]*)?>(?<body>[\s\S]*?)<\/system-reminder>/`
- If matched, content is rendered as `SystemReminderComponent` (amber-bordered box) instead of a plain user bubble
- The `reminderType` attribute controls the title: any value other than `"dynamic-agents-md"` shows "System Reminder"
- The harness itself uses this same pattern for error recovery: `"<system-reminder>There was an API error, please continue.</system-reminder>"`

**Current state:**
- `buildContinuationMessage()` (lines 228–332 of `index.ts`) returns plain text
- `harness.sendMessage({ content: kickoff })` at line 745 fires it as a plain user message bubble

**Goal state:**
- Each pipeline kickoff message renders as an amber-bordered system reminder box
- Box contains: mode name + step position, visual pipeline progress bar, intent summary, then the agent instructions

## Phases

### Phase 1: System Reminder TUI Notifications

#### Wave 1: Add progress helper and wrap kickoff message

- [ ] **Task 1.1.1**: Add `buildPipelineProgressHeader()` helper function above `buildContinuationMessage()`
  - Files: `packages/luca-mastracode/src/index.ts`
  - What: New pure function that takes `modeId` and `state` and returns a two-line header string:
    - Line 1: Mode name + step indicator (e.g. `ARCHITECT MODE  ·  Step 3 of 6`)
    - Line 2: Visual pipeline progress (e.g. `✓ Triage  ✓ Research  → Architect  ○ Execute  ○ Review  ○ Finalize`)
  - Pipeline step order and display names:
    ```
    luca:1-triage    → Triage     (step 1)
    luca:2-research  → Research   (step 2)
    luca:3-architect → Architect  (step 3)
    luca:4-execute   → Execute    (step 4)
    luca:5-review    → Review     (step 5)
    luca:6-finalize  → Finalize   (step 6)
    ```
  - Symbols: `✓` = completed (steps before current), `→` = current, `○` = upcoming
  - Verification: Function exists, pure, returns correct strings for each modeId input

- [ ] **Task 1.1.2**: Add `wrapInSystemReminder()` helper and update the `mode_changed` subscriber
  - Files: `packages/luca-mastracode/src/index.ts`
  - What: 
    1. Small inline helper `wrapInSystemReminder(body: string): string` that wraps content in `<system-reminder>` tags
    2. In the `mode_changed` subscriber (line ~740), replace:
       ```ts
       const kickoff = buildContinuationMessage(event.modeId, state);
       ```
       with:
       ```ts
       const agentInstructions = buildContinuationMessage(event.modeId, state);
       const progressHeader = buildPipelineProgressHeader(event.modeId, state);
       const kickoff = wrapInSystemReminder(`${progressHeader}\n\n${agentInstructions}`);
       ```
  - Verification: The full kickoff string starts with `<system-reminder>` and ends with `</system-reminder>`; agent instructions are preserved inside

## Verification Criteria

1. `bun run typecheck` (or `tsc --noEmit`) passes with zero errors in `packages/luca-mastracode`
2. `buildPipelineProgressHeader("luca:3-architect", mockState)` returns a string containing `→ Architect` and `✓ Research` and `○ Execute`
3. The final `kickoff` string passed to `harness.sendMessage()` matches `/<system-reminder>[\s\S]+<\/system-reminder>/`
4. `buildContinuationMessage()` itself is unchanged — agent instructions remain identical

## Risks & Mitigations

- **Risk**: MastraTUI regex requires the `<system-reminder>` tag to be the *entire* message content (no leading text). **Mitigation**: `wrapInSystemReminder()` produces the tag at position 0 with no prefix.
- **Risk**: Nested `<system-reminder>` tags if `buildContinuationMessage()` ever returns one. **Mitigation**: `buildContinuationMessage()` never returns XML tags — confirmed by reading its output.
