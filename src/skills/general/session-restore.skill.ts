/**
 * context-restore Skill - On-demand deep context recovery after compaction.
 *
 * Layer 2 restore: reads checkpoint from filesystem/MuninnDB, performs
 * hub-and-spoke semantic recall, and presents structured context.
 */
import { createSkill } from "~/skills/__helpers/create-skill";
import type { SkillConfig } from "~/skills/__schemas/skill.schemas";

const sessionRestoreConfig: SkillConfig = {
  frontmatter: {
    name: "session-restore",
    description: `On-demand deep context recovery after compaction or /clear. Reads checkpoint from MuninnDB + filesystem, performs semantic recall, and presents structured context with source attribution.`,
  },
  sections: [
    {
      title: "main",
      content: `<main>
# Context Restore

Recover deep context after compaction or session interruption. This is Layer 2 of the restore architecture — deeper than the automatic SessionStart hook injection.

**Vault Resolution:** Read \`.planning/config.json\` and extract \`muninn.vault\` as REPO_VAULT. Set DEFAULT_VAULT = "default".

## Process

### 1. Read Checkpoint

Check for checkpoint data in order of preference:

1. **Filesystem**: Read \`.planning/.context-checkpoint.json\` if it exists
2. **MuninnDB**: \`mcp__muninn__muninn_recall(vault: REPO_VAULT, context: ["session:checkpoint", "context checkpoint"])\`
3. **Fallback**: If no checkpoint found, read state via bridge (\`luca-bridge read-status\`) and \`git log --oneline -10\`

If no checkpoint or state found:

\`\`\`
No checkpoint found. This session appears to be fresh.
Use /session-resume for full session recovery, or /progress for status.
\`\`\`

### 2. Hub-and-Spoke Expansion

Extract keywords from checkpoint (phase name, goal, milestone, complexity) and perform semantic recall:

\`\`\`
mcp__muninn__muninn_recall(vault: REPO_VAULT, context: ["{phase goal keywords}", "patterns decisions pitfalls"])
mcp__muninn__muninn_recall(vault: "default", context: ["{phase goal keywords}", "cross-cutting patterns"])
\`\`\`

- Merge results from both vaults
- Sort by relevance score descending
- Cap at 5-7 total engrams
- Deduplicate by concept prefix

### 3. Present Restored Context

\`\`\`markdown
---
 Context Restored
---

## Checkpoint

- **Position:** Phase {phase}, Complexity: {complexity}
- **Milestone:** {milestone}
- **Branch:** {branch} (GitHub {github_issue})
- **Status:** {status}
- **Trigger:** {trigger} compaction
- **Context at compaction:** {usage_percent}% ({zone})
- **Saved at:** {timestamp}

## Recent Files

{comma-separated list of recently modified files from checkpoint}

## Recent Work

{completed_summary from checkpoint or git log}

## Related Memory (semantic recall)

| Score | Concept | Summary |
|-------|---------|---------|
| {score} | {concept} | {content summary} |
...

## Recommended Next Steps

Based on the checkpoint position and recalled context:
1. {suggestion based on phase/task position}
2. Re-read recent files listed above for context
3. Review any recalled pitfalls before continuing
\`\`\`

### 4. Clean Up

After presenting, remove the checkpoint file:
- Delete \`.planning/.context-checkpoint.json\` if it exists

## Notes

- Total output should be under 3KB to preserve fresh context
- Each recalled engram shows concept ID and relevance score for attribution
- This skill complements the automatic SessionStart restore hook (Layer 1)
- For fresh sessions (no compaction), use /session-resume instead
</main>`,
      order: 1,
    },
  ],
};

export const sessionRestoreSkill = createSkill(sessionRestoreConfig);
