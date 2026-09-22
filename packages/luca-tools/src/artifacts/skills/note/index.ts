/**
 * note skill — Add a new phase to the roadmap (default), or queue a developer note with --next/--whenever.
 *
 * Ported from fd0b169be:packages/luca-framework/.cursor/skills/note/SKILL.md (pre-D-4) (E-5).
 * Body path-retargeting: .planning/ → .luca/; uppercase artifacts
 * (PLAN.md, RESEARCH.md, CONTEXT.md, POSTMORTEM.md) → LUCA_DIR_CONTRACT
 * canonicals (plan.md, research.md, context.md, learn.md).
 *
 * Collapsed onto the CLI verbs: `note` is now the SINGLE thin LLM surface for
 * phase capture. Its default mode used to be a verbatim duplicate of the
 * `phase-add` skill (deleted with this change, see RETIRED_ARTIFACTS) — both
 * computed the next NN, kebab-slugified the description, `mkdir -p`-ed the
 * phase directory, and hand-edited the GENERATED `.luca/roadmap.md`. All four
 * steps now belong to `luca roadmap add-phase`, which validates the slug
 * against PHASE_SLUG_RE and prints `{ nn, slug, dir }` back, so the body never
 * picks a path. The `--next` / `--whenever` modes were already one
 * `luca todo add --priority` call and are unchanged.
 *
 * Guarded by `../../roadmap-phase-verb-callers.test.ts`, which asserts against
 * the bytes the compiler emits.
 */
import { defineSkill } from '../../../define/skill.ts'

const BODY = `<main>
# Luca Developer Note

Capture ideas as roadmap phases (default) or queue notes for agent pickup.

**Arguments:** \`[--next|--whenever] <message>\`

- **Default (phase):** Registers a new phase on the roadmap for the message
- \`--next\` flag: Queue an urgent note (high-priority todo, surfaced into agent context)
- \`--whenever\` flag: Queue a deferred note (low-priority todo, picked up at boundaries)

---

## Default Mode — Add Phase

When no flag is provided, the message becomes a new phase at the end of the roadmap.

### Process

1. **Parse arguments:**
   - If the first argument is \`--next\` or \`--whenever\`, use note mode (see below)
   - Otherwise, all arguments become the phase description
   - Error if no arguments provided

2. **Register the phase:**

   \\\`\\\`\\\`bash
   luca roadmap add-phase --name "<description>"
   \\\`\\\`\\\`

   The verb owns everything that used to be prose here: it computes the next
   phase number from roadmap order, slugifies the name, validates the slug,
   creates the directory, and regenerates \`.luca/roadmap.md\`. It is callable
   in every \`pipelineStep\`, so a phase can be captured mid-run.

   Optional flags:
   - \`--deps "<name>,<name>"\` — names of phases this one depends on
   - \`--complexity TRIVIAL|SIMPLE|MODERATE|COMPLEX|CRITICAL\` — recorded on the entry
   - \`--after <N>\` — insert after phase N instead of appending. **This
     RENUMBERS every later phase and renames its directory.** Omit it unless
     the user explicitly asked for the work to jump the queue.

3. **Read the verb's output — never assemble a path yourself:**

   \\\`\\\`\\\`json
   { "nn": "07", "slug": "07-add-authentication", "dir": ".luca/phases/07-add-authentication" }
   \\\`\\\`\\\`

   Use \`.dir\` verbatim wherever the phase directory is needed, and \`.nn\` for
   the next-step suggestion.

4. **Confirm:**

   \`\`\`
   Phase {nn} added:
   - Description: {description}
   - Directory: {dir}

   Next: /phase-plan {nn}
   \`\`\`

### Anti-Patterns

- Don't compute the phase number or build the slug yourself — \`luca roadmap
  add-phase\` owns both, and a hand-built one fails the contract validator
- Don't \`mkdir\` a phase directory. A raw \`mkdir\` bypasses the \`<NN>-<slug>\`
  validator; decimal numbering (\`7.1-slug\`) is rejected outright
- Don't write \`.luca/roadmap.md\`. It is GENERATED output — the verb
  regenerates it, and a direct write is a contract violation the stage gate
  blocks
- Don't renumber existing phases by hand (use \`--after\`, which renumbers
  atomically, or don't reorder at all)
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

3. **Confirm:**

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

| Mode | Trigger | Output |
|------|---------|--------|
| Default (phase) | No flag | \`luca roadmap add-phase\` → roadmap entry + phase directory |
| \`--next\` | \`--next\` flag | \`luca todo add\` (priority high) |
| \`--whenever\` | \`--whenever\` flag | \`luca todo add\` (priority low) |

## Success Criteria

- [ ] Phase mode: exactly one \`luca roadmap add-phase\` call, its \`dir\` taken from the verb's output
- [ ] Phase mode: no \`mkdir\`, no slugification, and \`.luca/roadmap.md\` left untouched by this skill (the verb regenerates it)
- [ ] Note modes: MuninnDB todo created via \`luca todo add\` with the right \`--priority\`
- [ ] User sees confirmation with appropriate next steps
</main>
`

export const noteSkill = defineSkill({
    name: 'note',
    description:
        'Add a new phase to the roadmap (default), or queue a developer note with --next/--whenever.',
    body: BODY,
})
