# Phase 03 Context — Multi-Vault Architecture & Migration

## Phase Goal

Formalize vault roles (default = cross-cutting, repo = project-specific). Split brain tree into project brain and user brain. Migrate luca-framework memories from default vault. Implement `luca-bridge init-vault` guided setup.

## Key Research Finding: Admin API Limitations

MuninnDB does NOT expose admin APIs for vault or API key management:

| Operation           | REST API               | Web UI |
| ------------------- | ---------------------- | ------ |
| Create vault        | No                     | Yes    |
| Generate API key    | No                     | Yes    |
| List vaults         | No                     | Yes    |
| Check vault exists  | Implied (attempt read) | Yes    |
| Write/read memories | Yes                    | Yes    |
| Export vault        | Yes (JSON-LD/GraphML)  | Yes    |
| Bulk import         | Yes (batch up to 50)   | Yes    |

**Impact on init-vault:** Cannot fully automate vault creation. The CLI becomes a **guided setup wizard** that walks the user through Web UI steps, then validates and configures the project.

## Decisions

### 1. `luca-bridge init-vault` — Guided Setup Wizard

Since vault creation and API key generation require the Web UI, the CLI will:

1. Detect repo name from git remote or directory name
2. Check if `.planning/config.json` already has a `muninn.vault` field (idempotent)
3. If vault already configured: display "vault already configured" with current settings, exit
4. If not configured:
   a. Display instructions: "Open MuninnDB Web UI at http://127.0.0.1:8476"
   b. Guide: "Create a new vault named '{repo-name}'"
   c. Guide: "Generate an API key for this vault"
   d. Prompt user to paste the API key
   e. Write vault name to `.planning/config.json` (`muninn.vault` field)
   f. Write API key to `.env` (or display instructions for manual `.env` setup)
   g. Verify vault connectivity by attempting a `muninn_status` call
   h. Display success confirmation

### 2. Migration Strategy

Migration is read → recreate → soft-delete. Classification heuristic for which memories to migrate:

**Move to luca-framework vault (repo-specific):**

- Concept starts with `session:` (session history)
- Concept starts with `v3.`, `v4.`, or contains milestone version references
- Concept contains "luca-framework", "observer", "spacetimedb"
- Type is "event" with project-specific content (phase results, milestone completions)
- Project identity engram (`luca-framework project identity`)
- Architecture/implementation engrams specific to this codebase

**Keep in default vault (cross-cutting):**

- Concept starts with `pitfall:` (general tool pitfalls)
- Concept starts with `preference:` (user preferences)
- Concept starts with `procedure:` (workflow procedures)
- Concept starts with `pattern:` where content is framework-agnostic
- User profile/role information
- Workflow process decisions (e.g., complexity gating rework decision)

**Ambiguous cases:** When unclear, keep in default vault (conservative — better to have it available everywhere than missing in one repo).

### 3. Brain Tree Split

**Project brain (luca-framework vault):**

- Project identity (name, domain, purpose)
- Stack details (TypeScript, Bun, MCP)
- Architecture patterns (orchestrator/sub-agent model, domain tiers)
- Codebase conventions (generated files, build pipeline)
- Development workflow (source → build → output)

**User brain (default vault):**

- User role and expertise
- Workflow preferences (always run full pipeline, memory-driven optimization)
- Tool preferences (Bun over npm, lodash, Zod schemas)
- Communication style preferences
- General development patterns

### 4. Export Before Migration (Safety)

Before migrating any memories:

1. Export full default vault via `muninn_export_graph` (JSON-LD format)
2. Save export to `.planning/migration/default-vault-export-{date}.json`
3. This provides a recovery point if migration goes wrong

### 5. Migration Execution

Use `muninn_remember_batch` (up to 50 per call) for bulk recreation:

1. Recall all memories from default vault with deep mode
2. Classify each memory using the heuristic above
3. For repo-specific memories: recreate in luca-framework vault
4. Soft-delete originals from default vault
5. Rebuild entity relationships in new vault via `muninn_link`
6. Rebuild brain tree fresh in luca-framework vault (project brain)
7. Create user brain tree in default vault

## Scope Boundaries

- **In scope:** init-vault CLI, memory migration, brain tree split, vault export safety net
- **Out of scope:** Skill dual-vault recall/write changes (Phase 04), MuninnDB admin API development, changing MuninnDB itself
- **Out of scope:** Migrating memories for other repos (only luca-framework)

## Technical Notes

- MuninnDB Web UI runs at `http://127.0.0.1:8476`
- REST API on port 8475, MBP on 8474, gRPC on 8477
- Soft-deletes are recoverable via `muninn_restore`
- `muninn_export_graph` supports JSON-LD and GraphML formats
- Batch operations capped at 50 memories per call
