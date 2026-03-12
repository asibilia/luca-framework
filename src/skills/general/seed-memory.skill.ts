/**
 * seed-memory Skill - Seed MuninnDB with project knowledge from existing planning files.
 *
 * Reads BRAIN.md, MEMORY.md, WORKING.md, and procedure files, then stores
 * their content as structured entities in MuninnDB. Idempotent and reusable
 * across projects adopting MuninnDB.
 */
import { createSkill } from "~/skills/__helpers/create-skill";
import type { SkillConfig } from "~/skills/__schemas/skill.schemas";

const seedMemoryConfig: SkillConfig = {
  frontmatter: {
    name: "seed-memory",
    description: `Seed MuninnDB with project knowledge from existing BRAIN.md, MEMORY.md, WORKING.md, and procedure files. Run once per project to populate MuninnDB with existing knowledge. Idempotent -- safe to run multiple times.`,
  },
  sections: [
    {
      title: "main",
      content: `<main>
# Seed Memory

Migrate file-based project knowledge into MuninnDB as structured, queryable entities. This skill reads existing planning files and stores their content as engrams with proper entity naming, hierarchy, and deduplication.

## When to Use

- First time adopting MuninnDB on an existing project
- After significant manual edits to BRAIN.md, MEMORY.md, or procedures
- To refresh MuninnDB after a reset or data loss
- Safe to re-run -- idempotent via entity existence checks

## Vault Resolution

Read \`.planning/config.json\` and extract \`muninn.vault\` as REPO_VAULT. Set DEFAULT_VAULT = "default". Use REPO_VAULT for project-scoped operations (brain:project-*, session:*, procedure:*) and DEFAULT_VAULT for cross-cutting operations (brain:user-*, pattern:*, pitfall:*, preference:*, decision:*).

Route each memory operation by concept prefix:
- \`brain:project-*\` -> REPO_VAULT
- \`brain:user-*\` -> DEFAULT_VAULT
- \`brain:stack\`, \`brain:conventions\`, \`brain:architecture\` -> REPO_VAULT (project-scoped)
- \`pattern:*\`, \`pitfall:*\`, \`decision:*\`, \`preference:*\` -> DEFAULT_VAULT (cross-cutting learnings)
- \`session:*\` -> REPO_VAULT
- \`procedure:*\` -> REPO_VAULT

## Entity Naming Conventions

All entities use type-prefixed names for consistent recall and traversal:

| Source | Concept Prefix | Examples |
|--------|---------------|----------|
| BRAIN.md sections | \`brain:\` | \`brain:project-identity\`, \`brain:stack\`, \`brain:conventions\` |
| MEMORY.md patterns | \`pattern:\` | \`pattern:bun-runtime-requirement\` |
| MEMORY.md decisions | \`decision:\` | \`decision:no-classes-architecture\` |
| MEMORY.md pitfalls | \`pitfall:\` | \`pitfall:generated-files-direct-edit\` |
| MEMORY.md preferences | \`preference:\` | \`preference:lodash-over-builtin\` |
| WORKING.md sections | \`session:\` | \`session:findings\`, \`session:progress\` |
| Procedure files | \`procedure:\` | \`procedure:deploy-checklist\` |

---

## Procedure

### Step 1: Detect existing files

Check for the following files and directories in the project root. Report which exist and which are missing:

\`\`\`
.planning/BRAIN.md
.planning/MEMORY.md
.planning/WORKING.md
.planning/procedures/
\`\`\`

Read each file that exists. If none exist, report "No planning files found -- nothing to seed" and stop.

### Step 2: Seed BRAIN.md

If \`.planning/BRAIN.md\` exists:

1. Read the file content
2. Parse the major sections (look for ## headings: Project Identity, Stack, Architecture, Conventions, Preferences, etc.)
3. **Check for existing entity** using \`mcp__muninn__muninn_find_by_entity\`:
   - vault: REPO_VAULT
   - entity_name: "brain:project-identity"
4. **If entity exists**: Use \`mcp__muninn__muninn_evolve\` to update the root engram with the latest content
5. **If entity does not exist**: Use \`mcp__muninn__muninn_remember_tree\` to store as a hierarchical tree:
   - vault: REPO_VAULT
   - Root concept: "brain:project-identity"
   - Root content: The full BRAIN.md content or a summary of the project identity
   - Children: One child per major section, each with:
     - concept: \`brain:<section-slug>\` (e.g., "brain:stack", "brain:conventions", "brain:architecture")
     - content: The section content as natural language

**Example tree structure:**

\`\`\`json
{
  "vault": "REPO_VAULT (resolved from .planning/config.json muninn.vault)",
  "root": {
    "concept": "brain:project-identity",
    "content": "Luca Framework -- agentic development tooling monorepo. Builds agents, skills, rules, hooks for AI-assisted development.",
    "type": "project_identity",
    "summary": "Project identity and conventions for luca-framework",
    "entities": [{"name": "luca-framework", "type": "project"}]
  },
  "children": [
    {
      "concept": "brain:stack",
      "content": "TypeScript, Bun runtime, Zod schemas, functional patterns. No classes.",
      "type": "project_stack",
      "summary": "Technology stack for luca-framework"
    },
    {
      "concept": "brain:conventions",
      "content": "Kebab-case files, barrel-only index.ts, schema-first parsing...",
      "type": "project_conventions",
      "summary": "Code conventions for luca-framework"
    }
  ]
}
\`\`\`

### Step 3: Seed MEMORY.md

If \`.planning/MEMORY.md\` exists:

1. Read the file content
2. Parse each entry by identifying sections and sub-sections. Look for patterns like:
   - **Patterns** section entries (## or ### headings under a Patterns section)
   - **Decisions** section entries
   - **Pitfalls** section entries
   - **Preferences** section entries
   - Any other categorized knowledge sections
3. For each entry found:
   - **Check for existing entity** using \`mcp__muninn__muninn_find_by_entity\`:
     - entity_name: The concept name (e.g., "pattern:bun-runtime-requirement")
   - **If entity exists**: Use \`mcp__muninn__muninn_evolve\` to update with latest content
   - **If entity does not exist**: Add to the batch for creation
4. Store all new entries using \`mcp__muninn__muninn_remember_batch\`:
   - vault: Route by concept prefix per Vault Resolution above (pattern:*, pitfall:*, decision:*, preference:* -> DEFAULT_VAULT)
   - Each memory includes:
     - concept: \`<type>:<slug>\` (e.g., "pattern:bun-runtime-requirement", "pitfall:generated-files-direct-edit")
     - content: The full entry text as natural language
     - type: One of "pattern", "decision", "pitfall", "preference"
     - summary: A one-line summary of the entry
     - entities: Include \`{"name": "luca-framework", "type": "project"}\` and any other relevant entities

**Concept naming rules:**

- Slugify the entry title: lowercase, replace spaces with hyphens, remove special characters
- Prefix with the section type: \`pattern:\`, \`decision:\`, \`pitfall:\`, \`preference:\`
- Example: "Bun Runtime Requirement" under Pitfalls becomes \`pitfall:bun-runtime-requirement\`
- Example: "Generated Files -- Never Edit Directly" under Patterns becomes \`pattern:generated-files-never-edit-directly\`

### Step 4: Seed WORKING.md

If \`.planning/WORKING.md\` exists and is not empty:

1. Read the file content
2. Parse the major sections (Findings, Progress, Blockers, Decisions, etc.)
3. For each non-empty section:
   - **Check for existing entity** using \`mcp__muninn__muninn_find_by_entity\`:
     - entity_name: \`session:<section-slug>\`
   - **If entity exists**: Use \`mcp__muninn__muninn_evolve\` to update
   - **If entity does not exist**: Use \`mcp__muninn__muninn_remember\` to store:
     - vault: REPO_VAULT
     - concept: \`session:<section-slug>\` (e.g., "session:findings", "session:progress")
     - content: The section content
     - type: "session_context"
     - summary: One-line description of the section
     - entities: Include session ID if available, project name

**Note:** WORKING.md content is session-scoped and may be stale. Include a note in the content about when it was seeded.

### Step 5: Seed Procedures

If \`.planning/procedures/\` directory exists:

1. List all \`.md\` files in the directory
2. For each procedure file:
   - Read the file content
   - Extract the procedure name from the filename (strip .md, use as slug)
   - **Check for existing entity** using \`mcp__muninn__muninn_find_by_entity\`:
     - entity_name: \`procedure:<procedure-slug>\`
   - **If entity exists**: Use \`mcp__muninn__muninn_evolve\` to update the root
   - **If entity does not exist**: Use \`mcp__muninn__muninn_remember_tree\`:
     - vault: REPO_VAULT
     - Root concept: \`procedure:<procedure-slug>\`
     - Root content: Procedure overview or full content
     - Children: One child per major step or section (if the procedure has clear steps)
     - type: "procedure"
     - summary: One-line description of the procedure

### Step 6: Verify seeding

After all seeding is complete:

1. Use \`mcp__muninn__muninn_recall\` to verify key entities were stored:
   - \`muninn_recall(vault=REPO_VAULT, context="brain project identity")\`
   - \`muninn_recall(vault=DEFAULT_VAULT, context="patterns and pitfalls")\`
   - \`muninn_recall(vault=REPO_VAULT, context="procedures")\` (if procedures were seeded)

2. Report a summary:

\`\`\`
Seed Memory Complete
====================
Files processed:
  - BRAIN.md: {created|updated|skipped}
  - MEMORY.md: {N} entries ({created} new, {updated} updated)
  - WORKING.md: {created|updated|skipped|empty}
  - Procedures: {N} files processed

Entities created: {total_new}
Entities updated: {total_updated}
Entities skipped: {total_skipped}

Verification:
  - Brain recall: {pass|fail}
  - Memory recall: {pass|fail}
  - Procedure recall: {pass|fail|n/a}
\`\`\`

---

## Idempotency Guarantee

This skill is safe to run multiple times because:

1. **Before creating any entity**, it checks \`mcp__muninn__muninn_find_by_entity\` for an existing entity with the same name
2. **If found**: Uses \`mcp__muninn__muninn_evolve\` to update the content (preserves entity ID, updates content)
3. **If not found**: Creates the entity fresh
4. **Entity names are deterministic**: Derived from file names and section headings, so the same input always produces the same entity names

This means running the skill twice on the same files will update existing entities rather than creating duplicates.

---

## Error Handling

- **MuninnDB unavailable**: Report the error clearly and stop. Do not fall back to file writes.
- **File read failure**: Skip the file, report which file failed, continue with others.
- **Batch too large**: If MEMORY.md has more than 50 entries, split into multiple \`muninn_remember_batch\` calls (max 50 per batch).
- **Malformed content**: If a file cannot be parsed into sections, store the entire file as a single entity with concept \`<type>:raw-content\`.

---

## MuninnDB Tools Reference

| Tool | Purpose | When to Use |
|------|---------|-------------|
| \`mcp__muninn__muninn_remember_tree\` | Store hierarchical content | BRAIN.md, Procedures |
| \`mcp__muninn__muninn_remember_batch\` | Store multiple flat entries | MEMORY.md entries |
| \`mcp__muninn__muninn_remember\` | Store single entry | WORKING.md sections |
| \`mcp__muninn__muninn_find_by_entity\` | Check if entity exists | Idempotency check before every create |
| \`mcp__muninn__muninn_evolve\` | Update existing entity | When entity already exists |
| \`mcp__muninn__muninn_recall\` | Verify stored content | Final verification step |
</main>`,
      order: 1,
    },
  ],
};

export const seedMemorySkill = createSkill(seedMemoryConfig);
