/**
 * note skill — Add a new phase to the roadmap (default), or queue a developer note with --next/--whenever.
 *
 * Ported from fd0b169be:packages/luca-framework/.cursor/skills/note/SKILL.md (pre-D-4) (E-5).
 * Body path-retargeting: .planning/ → .luca/; uppercase artifacts
 * (PLAN.md, RESEARCH.md, CONTEXT.md, POSTMORTEM.md) → LUCA_DIR_CONTRACT
 * canonicals (plan.md, research.md, context.md, learn.md).
 */
import { defineSkill } from '../../../define/skill.ts'

const BODY = `<main>
# Luca Developer Note

Capture ideas as roadmap phases (default) or queue notes for agent pickup.

**Arguments:** \`[--next|--whenever] <message>\`

- **Default (phase):** Creates a new phase in the roadmap for the message
- \`--next\` flag: Queue an urgent note (picked up within 60 seconds via context-check hook)
- \`--whenever\` flag: Queue a deferred note (picked up at commit boundaries only)

---

## Default Mode — Add Phase

When no flag is provided, the message becomes a new phase in the current milestone.

### Process

1. **Parse arguments:**
   - If first argument is \`--next\` or \`--whenever\`, use note mode (see below)
   - Otherwise, all arguments become the phase description
   - Error if no arguments provided

2. **Load roadmap:**
   - Read \`.luca/roadmap.md\` (or call \`luca roadmap read\` for a typed view)
   - Error if not found

3. **Find current milestone:**
   - Locate "## Current Milestone:" heading
   - Extract milestone name and version
   - Identify all phases under this milestone

4. **Calculate next phase:**
   - Find highest integer phase number (ignore decimals)
   - Add 1 to get next phase number
   - Format as two-digit

5. **Generate slug:**
   - Convert description to kebab-case
   - Example: "Add authentication" → \`07-add-authentication\`

6. **Create phase directory:**

   \`\`\`bash
   mkdir -p ".luca/phases/\${phase_num}-\${slug}"
   \`\`\`

7. **Update roadmap:**
   - Insert new phase entry after last phase in current milestone
   - Include Goal, Depends on, Plans placeholders

8. **Update roadmap:**

   \\\`\\\`\\\`bash
   # The roadmap is the durable view; the workflow state machine in .luca/state.json
   # is updated separately by the pipeline when a phase becomes active.
   luca roadmap create --file <payload.json>   # if creating a fresh roadmap
   # or edit .luca/roadmap.md directly for incremental additions, then read it back via
   luca roadmap read 2>/dev/null || true
   \\\`\\\`\\\`

9. **Emit observer event:**

   \\\`\\\`\\\`bash
   luca telemetry emit --kind=phase.added --data='{"phase":"<N>","description":"<message>","directory":"<path>"}' 2>/dev/null || true
   \\\`\\\`\\\`

10. **Confirm:**

    \`\`\`
    Phase {N} added to current milestone:
    - Description: {description}
    - Directory: .luca/phases/{phase-num}-{slug}/

    Next: /phase-plan {N}
    \`\`\`

### Anti-Patterns

See \`/phase-add\` for detailed anti-patterns. Key rules:
- Don't modify phases outside current milestone
- Don't renumber existing phases
- Don't use decimal numbering (that's \`/phase-insert\`)
- Don't create plans yet (that's \`/phase-plan\`)
- Don't commit changes (user decides when to commit)

---

## \`--next\` Mode — Urgent Note

Queue a note as a high-priority MuninnDB-backed todo. The context-check hook surfaces high-priority todos into the agent context.

### Process

1. **Parse arguments:**
   - Strip \`--next\` flag
   - Remaining text is the note body

2. **Persist to the MuninnDB-backed backlog:**

   \\\`\\\`\\\`bash
   luca todo add --title "<first-line>" --area "note" --priority high --source note --body "<full message>"
   \\\`\\\`\\\`

3. **Emit observer event:**

   \\\`\\\`\\\`bash
   luca telemetry emit --kind=note.added --data='{"priority":"next","title":"<first-line>"}' 2>/dev/null || true
   \\\`\\\`\\\`

4. **Confirm:**

   \`\`\`
   Note queued: {message preview}

   Priority: high (next)
   Backlog: MuninnDB todo backlog (see \`luca todo list\`)
   \`\`\`

### Consumption

High-priority todos surface in the agent context via the context-refresher / context-check hooks and via \`luca todo list\`. There is no separate \`.luca/notes/\` filesystem layer — the canonical backlog is the MuninnDB todo store.

---

## \`--whenever\` Mode — Deferred Note

Queue a low-priority MuninnDB-backed todo picked up at commit / phase boundaries only.

### Process

Same as \`--next\` mode except:
- \`--priority low\` (instead of \`high\`)
- The todo surfaces in \`luca todo list\` but is not pushed into the active agent context.

### Consumption

Advisory backlog entry. Not auto-consumed — agent reads via \`luca todo list\` and acts on them manually.

---

## Summary

| Mode | Trigger | Output | Event |
|------|---------|--------|-------|
| Default (phase) | No flag | Roadmap phase + directory | \`phase.added\` |
| \`--next\` | \`--next\` flag | MuninnDB todo (priority high) | \`note.added\` |
| \`--whenever\` | \`--whenever\` flag | MuninnDB todo (priority low) | \`note.added\` |

## Success Criteria

- [ ] Phase mode: directory created, roadmap updated, state updated
- [ ] Note modes: MuninnDB todo created via \`luca todo add\`
- [ ] Observer event emitted (fire-and-forget)
- [ ] User sees confirmation with appropriate next steps
</main>
`

export const noteSkill = defineSkill({
    name: 'note',
    description:
        'Add a new phase to the roadmap (default), or queue a developer note with --next/--whenever.',
    body: BODY,
})
