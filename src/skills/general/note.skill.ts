/**
 * note Skill - Add a new phase to the roadmap, or queue a developer note.
 */
import { createSkill } from "~/skills/__helpers/create-skill";
import type { SkillConfig } from "~/skills/__schemas/skill.schemas";

// Define the note skill configuration
const noteConfig: SkillConfig = {
  frontmatter: {
    name: "note",
    description: `Add a new phase to the roadmap (default), or queue a developer note with --next/--whenever.`,
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `# Luca Developer Note

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
   - Read \`.planning/ROADMAP.md\`
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
   mkdir -p ".planning/phases/\${phase_num}-\${slug}"
   \`\`\`

7. **Update roadmap:**
   - Insert new phase entry after last phase in current milestone
   - Include Goal, Depends on, Plans placeholders

8. **Update state (bridge primary, STATE.md fallback):**

   \\\`\\\`\\\`bash
   # Primary: Regenerate STATE.md from state machine (picks up roadmap changes)
   bun run packages/luca-framework/src/state/bridge.ts snapshot 2>/dev/null || true
   # Fallback: Manually add reference to new phase in STATE.md
   \\\`\\\`\\\`

   - Add entry under "Roadmap Evolution" in STATE.md

9. **Emit observer event:**

   \\\`\\\`\\\`bash
   curl -s --max-time 1 "\${LUCA_OBSERVER_URL:-http://localhost:3456}/api/events" -X POST \\
     -H "Content-Type: application/json" \\
     -d '{"event_type":"phase.added","timestamp":"<ISO>","payload":{"phase":"<N>","description":"<message>","directory":"<path>"}}'
   \\\`\\\`\\\`

10. **Confirm:**

    \`\`\`
    Phase {N} added to current milestone:
    - Description: {description}
    - Directory: .planning/phases/{phase-num}-{slug}/

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

Queue a note picked up within 60 seconds by the context-check hook.

### Process

1. **Parse arguments:**
   - Strip \`--next\` flag
   - Remaining text is the note body

2. **Generate filename:**
   - Priority prefix: \`0\`
   - Unix timestamp: \`$(date +%s)\`
   - Slug: first 5 words of message, kebab-cased, max 50 chars
   - Format: \`0-{timestamp}-{slug}.md\`

3. **Write note file:**
   - Location: \`.planning/notes/{filename}\`
   - Format:

     \`\`\`markdown
     ---
     priority: next
     created: 2026-03-04T00:00:00Z
     status: pending
     ---

     The note message text.
     \`\`\`

4. **Emit observer event:**

   \\\`\\\`\\\`bash
   curl -s --max-time 1 "\${LUCA_OBSERVER_URL:-http://localhost:3456}/api/events" -X POST \\
     -H "Content-Type: application/json" \\
     -d '{"event_type":"note.added","timestamp":"<ISO>","payload":{"priority":"next","file":"<filename>"}}'
   \\\`\\\`\\\`

5. **Confirm:**

   \`\`\`
   Note queued: {message preview}

   Priority: next
   File: .planning/notes/{filename}
   Pickup: within 60s
   \`\`\`

### Consumption

Automatically injected into agent context by \`context-check-throttled.sh\` every 60 seconds. Moved to \`.planning/notes/done/\` after injection.

---

## \`--whenever\` Mode — Deferred Note

Queue a note picked up at commit boundaries only.

### Process

Same as \`--next\` mode except:
- Priority prefix: \`1\`
- Frontmatter priority: \`whenever\`
- Filename format: \`1-{timestamp}-{slug}.md\`

### Consumption

Advisory reminder at pre-commit time. Not auto-consumed — agent reads and acts on them manually.

---

## Summary

| Mode | Trigger | Output | Event |
|------|---------|--------|-------|
| Default (phase) | No flag | Roadmap phase + directory | \`phase.added\` |
| \`--next\` | \`--next\` flag | Note file (prefix \`0\`) | \`note.added\` |
| \`--whenever\` | \`--whenever\` flag | Note file (prefix \`1\`) | \`note.added\` |

## Success Criteria

- [ ] Phase mode: directory created, roadmap updated, state updated
- [ ] Note modes: file created in \`.planning/notes/\` with correct prefix
- [ ] Observer event emitted (fire-and-forget)
- [ ] User sees confirmation with appropriate next steps`,
      order: 1,
    },
  ],
};

export const noteSkill = createSkill(noteConfig);
