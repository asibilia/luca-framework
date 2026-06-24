/**
 * seed-memory skill — Seed MuninnDB with project knowledge from existing BRAIN.md, MEMORY.md, WORKING.md, and procedure files. Run once per project to populate MuninnDB with existing knowledge. Idempotent -- safe to run multiple times.
 *
 * Ported from fd0b169be:packages/luca-framework/.cursor/skills/seed-memory/SKILL.md (pre-D-4) (E-5).
 * Body path-retargeting: .planning/ → .luca/; uppercase artifacts
 * (PLAN.md, RESEARCH.md, CONTEXT.md, POSTMORTEM.md) → LUCA_DIR_CONTRACT
 * canonicals (plan.md, research.md, context.md, learn.md).
 */
import { defineSkill } from '../../../define/skill.ts'

const BODY = `<main>
# Seed Memory

Migrate file-based project knowledge into MuninnDB as structured, queryable entities. This skill reads existing planning files and stores their content as engrams with proper entity naming, hierarchy, and deduplication.

## When to Use

- First time adopting MuninnDB on an existing project
- After significant manual edits to BRAIN.md, MEMORY.md, or procedures
- To refresh MuninnDB after a reset or data loss
- Safe to re-run -- idempotent via entity existence checks

## Vault

Always use vault \`"default"\` for all MuninnDB operations.

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

### Existence checks (used by Steps 2–5)

**CRITICAL — MuninnDB has no concept lookup.** \`muninn_find_by_entity\` matches auto-extracted CONTENT entities (noun phrases), NOT the concept string, and \`muninn_recall\` of a bare concept slug (e.g. \`"pattern:bun-runtime-requirement"\`) matches content embeddings, not the slug — both return nothing for a slug. So you CANNOT reliably check whether a concept already exists. Do NOT call \`find_by_entity\` (or recall) on a concept slug to gate creation — it silently never matches and you get duplicates.

When a step below says "check for an existing engram," do this best-effort check instead:

- \`muninn_recall({ vault, context: ["<the entity's natural-language description, NOT its slug>"], mode: "balanced", limit: 5 })\` and inspect whether any returned engram's \`concept\` exactly equals the target concept.
- If a returned engram's concept matches AND it is a **FLAT** engram (a MEMORY.md / WORKING.md entry — pattern/pitfall/session/etc.): capture its \`id\` (ULID) and \`muninn_evolve(id, new_content)\` it. Evolve is safe for flat engrams only.
- If the match is a **TREE ROOT** (\`brain:project-identity\`, a \`procedure:*\` root, or any node with children): do NOT evolve it — evolve mints a new root ULID (staling the \`muninn.brainRoots\` cache) and orphans its children from the new root. Either **skip** (leave the existing tree as-is) or **clean-replace**: \`muninn_forget\` the old root (and its children), \`muninn_remember_tree\` a fresh tree, then re-register the new root id with \`luca brain set-root --concept <concept> --id <new_root_id>\`.
- Otherwise (no match): create it.

This is **best-effort, not guaranteed** (see Idempotency below). For a clean re-seed, clear the prior seeded engrams first (recall them, then \`muninn_forget\` each by ULID).

### Step 1: Detect existing files

Check for the following files and directories in the project root. Report which exist and which are missing:

\`\`\`
.luca/BRAIN.md
.luca/MEMORY.md
.luca/WORKING.md
.luca/procedures/
\`\`\`

Read each file that exists. If none exist, report "No planning files found -- nothing to seed" and stop.

### Step 2: Seed BRAIN.md

If \`.luca/BRAIN.md\` exists:

1. Read the file content
2. Parse the major sections (look for ## headings: Project Identity, Stack, Architecture, Conventions, Preferences, etc.)
3. **Check for an existing engram** per **Existence checks** above (do NOT use \`find_by_entity\` on the \`brain:project-identity\` slug — it never matches). Use a best-effort recall on the project-identity description.
4. **If the brain:project-identity tree already exists**: do NOT evolve the root — it is a TREE and evolve would orphan its children and stale the cached root id (see Existence checks). Either skip (leave it), or clean-replace: \`muninn_forget\` the old root + children, \`muninn_remember_tree\` fresh, then \`luca brain set-root --concept brain:project-identity --id <new_root_id>\`.
5. **If not found**: Use \`mcp__muninn__muninn_remember_tree\` to store as a hierarchical tree:
   - vault: the **repo vault** (\`.luca/config.json\` → \`muninn.vault\`, fallback \`"default"\`) — \`brain:project-*\` is project-scoped per the vault-routing rule, NOT the \`default\` vault.
   - Root concept: "brain:project-identity"
   - Root content: The full BRAIN.md content or a summary of the project identity
   - Children: One child per major section, each with:
     - concept: \`brain:<section-slug>\` (e.g., "brain:stack", "brain:conventions", "brain:architecture")
     - content: The section content as natural language
   - **Then register the root id** (so readers can re-open it — \`muninn_recall_tree\` needs the ULID, not the concept): take the \`root_id\` returned by \`muninn_remember_tree\` and run \`luca brain set-root --concept brain:project-identity --id <root_id>\`.

**Example tree structure** (illustrative — set \`vault\` to the resolved repo vault, NOT \`default\`; and note \`muninn_remember_tree\` does NOT accept per-node \`entities\` — it auto-extracts entities from \`content\`, so do not inject an \`entities\` field on tree nodes):

\`\`\`json
{
  "vault": "<repo vault>",
  "root": {
    "concept": "brain:project-identity",
    "content": "Luca Framework -- agentic development tooling monorepo. Builds agents, skills, rules, hooks for AI-assisted development.",
    "type": "project_identity",
    "summary": "Project identity and conventions for luca-framework"
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

If \`.luca/MEMORY.md\` exists:

1. Read the file content
2. Parse each entry by identifying sections and sub-sections. Look for patterns like:
   - **Patterns** section entries (## or ### headings under a Patterns section)
   - **Decisions** section entries
   - **Pitfalls** section entries
   - **Preferences** section entries
   - Any other categorized knowledge sections
3. For each entry found:
   - **Check for an existing engram** per **Existence checks** above (best-effort recall on the entry's description; do NOT \`find_by_entity\` the concept slug)
   - **If a matching engram is found**: Use \`mcp__muninn__muninn_evolve\` (by its ULID) to update with latest content
   - **If not found**: Add to the batch for creation
4. Store all new entries using \`mcp__muninn__muninn_remember_batch\`, **routing each entry's \`vault\` by its concept type** (vault-routing rule): \`pattern:\`/\`pitfall:\`/\`preference:\` → \`default\` (cross-cutting); \`decision:\`/\`convention:\` → the **repo vault** (\`.luca/config.json\` → \`muninn.vault\`, fallback \`default\`; project-scoped). Do NOT put them all in \`default\`.
   - Each memory includes:
     - vault: per the routing above (NOT a blanket \`default\`)
     - concept: \`<type>:<slug>\` (e.g., "pattern:bun-runtime-requirement", "pitfall:generated-files-direct-edit", "decision:...")
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

If \`.luca/WORKING.md\` exists and is not empty:

1. Read the file content
2. Parse the major sections (Findings, Progress, Blockers, Decisions, etc.)
3. For each non-empty section:
   - **Check for an existing engram** per **Existence checks** above (best-effort recall on the section's content; do NOT \`find_by_entity\` the \`session:<section-slug>\` slug)
   - **If a matching engram is found**: Use \`mcp__muninn__muninn_evolve\` (by its ULID) to update
   - **If not found**: Use \`mcp__muninn__muninn_remember\` to store:
     - vault: the **repo vault** (\`.luca/config.json\` → \`muninn.vault\`, fallback \`default\`) — \`session:*\` is project-scoped per the routing rule, NOT the shared \`default\` vault
     - concept: \`session:<section-slug>\` (e.g., "session:findings", "session:progress")
     - content: The section content
     - type: "session_context"
     - summary: One-line description of the section
     - entities: Include session ID if available, project name

**Note:** WORKING.md content is session-scoped and may be stale. Include a note in the content about when it was seeded.

### Step 5: Seed Procedures

If \`.luca/procedures/\` directory exists:

1. List all \`.md\` files in the directory
2. For each procedure file:
   - Read the file content
   - Extract the procedure name from the filename (strip .md, use as slug)
   - **Check for an existing engram** per **Existence checks** above (best-effort recall on the procedure's description; do NOT \`find_by_entity\` the \`procedure:<procedure-slug>\` slug)
   - **If the procedure tree already exists**: do NOT evolve the root — it is a TREE and evolve orphans its children (see Existence checks). Skip, or clean-replace via \`muninn_forget\` (old root + children) + \`muninn_remember_tree\` fresh.
   - **If not found**: Use \`mcp__muninn__muninn_remember_tree\`:
     - vault: "default"
     - Root concept: \`procedure:<procedure-slug>\`
     - Root content: Procedure overview or full content
     - Children: One child per major step or section (if the procedure has clear steps)
     - type: "procedure"
     - summary: One-line description of the procedure

### Step 6: Verify seeding

After all seeding is complete:

1. Use \`mcp__muninn__muninn_recall\` to verify key entities were stored:
   - \`muninn_recall(vault="default", context="brain project identity")\`
   - \`muninn_recall(vault="default", context="patterns and pitfalls")\`
   - \`muninn_recall(vault="default", context="procedures")\` (if procedures were seeded)

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

## Idempotency (best-effort, NOT guaranteed)

MuninnDB has **no concept lookup** (see **Existence checks** above), so this skill cannot deterministically detect whether a concept already exists. It does a **best-effort** existence check via content recall before each write:

1. **Before creating any engram**, it recalls on the engram's natural-language description and checks whether a returned engram's \`concept\` matches.
2. **If a match is found**: \`mcp__muninn__muninn_evolve\` (by ULID) updates the content in place.
3. **If not found**: Creates it fresh.

**Caveat:** the recall is semantic/FTS and depends on an embedder being configured (embedders are optional in MuninnDB). On a vault with no/weak embedder the recall can miss an existing engram, in which case re-running **will create a duplicate**. For a guaranteed-clean re-seed, first clear the prior seeded engrams (recall them, then \`muninn_forget\` each by ULID) — do NOT rely on a concept-based existence check, which is impossible here.

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
| \`mcp__muninn__muninn_recall\` | Best-effort existence check (by description, NOT concept slug — no concept lookup exists) | Before create (see Existence checks) |
| \`mcp__muninn__muninn_evolve\` | Update an existing **FLAT** engram by ULID (never a tree root) | Flat entry already exists |
| \`mcp__muninn__muninn_recall\` | Verify stored content | Final verification step |
</main>
`

export const seedMemorySkill = defineSkill({
    name: 'seed-memory',
    description:
        'Seed MuninnDB with project knowledge from existing BRAIN.md, MEMORY.md, WORKING.md, and procedure files. Run once per project to populate MuninnDB with existing knowledge. Idempotent -- safe to run multiple times.',
    body: BODY,
})
