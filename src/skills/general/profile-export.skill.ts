/**
 * profile-export Skill - Export portable learnings to the global memory profile.
 */
import { createSkill } from "~/skills/__helpers/create-skill";
import type { SkillConfig } from "~/skills/__schemas/skill.schemas";

// Define the profile-export skill configuration
const profileExportConfig: SkillConfig = {
  frontmatter: {
    name: "profile-export",
    description: `Export portable learnings from this project to the global memory profile (~/.luca/global-memory.json).`,
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `# Profile Export

Export portable learnings from this project to the global memory profile for cross-project knowledge transfer.

**Arguments:** \`[--include-decisions] [--min-confidence=medium]\`

- **Default:** Exports patterns, preferences, and pitfalls with medium+ confidence
- \`--include-decisions\`: Also include decision entries (project-specific by default)
- \`--min-confidence=low|medium|high\`: Minimum confidence threshold (default: medium)

---

## Process

1. **Read project identity and memory from MuninnDB:**

   \`\`\`
   # Recall project brain (identity, conventions)
   mcp__muninn__muninn_recall_tree(vault: "default", id: "brain:project-identity")

   # Recall all project memory entries
   mcp__muninn__muninn_recall(vault: "default", context: "all project patterns, decisions, pitfalls, and preferences")
   \`\`\`

2. **Parse arguments:**
   - Check for \`--include-decisions\` flag
   - Check for \`--min-confidence=\` value
   - Build export options accordingly

3. **Export to MuninnDB global graph:**

   \`\`\`
   mcp__muninn__muninn_export_graph(vault: "default")
   \`\`\`

   - Exports the full memory graph for cross-project transfer
   - Deduplicates by entity and concept

4. **Report results:**

   \`\`\`
   Profile exported to ~/.luca/global-memory.json

   Categories: patterns, preferences, pitfalls
   Entries exported: {N}
   Entries skipped (duplicates): {N}
   Min confidence: {level}

   The global profile can be imported into other projects with /profile-import.
   \`\`\`

---

## Anti-Patterns

- Do NOT export without reading BRAIN.md first (source_project comes from brain)
- Do NOT overwrite existing global memory -- always merge and deduplicate
- Do NOT include decisions unless explicitly requested (they are project-specific)

---

## Success Criteria

- [ ] BRAIN.md and MEMORY.md loaded successfully
- [ ] Export options applied from arguments
- [ ] Global memory file created or updated at ~/.luca/global-memory.json
- [ ] Entries tagged with source_project for provenance tracking
- [ ] Duplicate entries skipped correctly
- [ ] User sees summary of what was exported`,
      order: 1,
    },
  ],
};

export const profileExportSkill = createSkill(profileExportConfig);
