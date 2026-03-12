# Phase 03: Multi-Vault Architecture & Migration - Research

**Researched:** 2026-03-12
**Domain:** MuninnDB memory architecture, bridge CLI extension, config schema
**Confidence:** HIGH

## Summary

This research investigates the codebase infrastructure needed for Phase 03: formalizing vault roles, splitting the brain tree, migrating memories, and adding the `init-vault` guided setup wizard to the bridge CLI.

The bridge CLI (`packages/luca-framework/src/state/bridge.ts`) has a well-established subcommand pattern with 14 existing commands. Adding `init-vault` follows the same dispatch pattern: a handler function + entry in `VALID_SUBCOMMANDS` + case in the switch statement. The config schema at `.planning/config.json` already documents a `muninn.vault` field pattern but it is not yet read by any TypeScript code -- only referenced in documentation. All MuninnDB calls in the codebase currently hardcode `vault: "default"`, making the multi-vault migration a clear, well-scoped change.

**Primary recommendation:** Add `init-vault` as a new bridge subcommand that provides guided setup (detect repo, instruct user on Web UI vault creation, collect API key, write config, verify connectivity). The migration and brain tree split are MCP-driven operations that happen in agent/skill prompts, not in TypeScript code changes.

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library   | Version | Purpose                                     | Why Standard              |
| --------- | ------- | ------------------------------------------- | ------------------------- |
| Bun       | runtime | TypeScript execution, file I/O, env loading | Project standard runtime  |
| XState v5 | ^5.x    | Workflow state machine                      | Already used by bridge    |
| Zod       | ^3.x    | Schema validation for config                | Schema-first parsing rule |
| lodash    | ^4.x    | get/set for config manipulation             | Lodash preference rule    |

### Supporting

| Library              | Version  | Purpose                  | When to Use                                         |
| -------------------- | -------- | ------------------------ | --------------------------------------------------- |
| Bun.file / Bun.write | built-in | File I/O for config.json | Reading/writing .planning/config.json               |
| process.env          | built-in | Env var access           | MUNINN_DB_URL, MUNINN_DB_API_KEY, LUCA_MUNINN_VAULT |

### Alternatives Considered

| Instead of                     | Could Use                     | Tradeoff                                                        |
| ------------------------------ | ----------------------------- | --------------------------------------------------------------- |
| Direct HTTP for vault verify   | MCP tools                     | MCP tools unavailable in bridge context; direct HTTP is correct |
| Interactive prompts (inquirer) | Console output + manual steps | No new deps needed since Web UI does the interactive work       |

**Installation:**
No new dependencies required. All needed libraries are already in the project.

## Architecture Patterns

### Bridge CLI Subcommand Registration Pattern

The bridge CLI at `packages/luca-framework/src/state/bridge.ts` follows a precise pattern for adding subcommands:

**Step 1:** Add to `VALID_SUBCOMMANDS` array (line 190-205):

```typescript
const VALID_SUBCOMMANDS = [
  // ... existing commands
  "init-vault", // NEW
] as const;
```

**Step 2:** Add to `HELP_TEXT` (line 213-240):

```
Vault commands:
  init-vault           Guided setup for project MuninnDB vault
```

**Step 3:** Add handler function following the pattern:

```typescript
async function handleInitVault(args: string[]): Promise<void> {
  // Implementation
  console.log(
    JSON.stringify({
      /* result */
    }),
  );
}
```

**Step 4:** Add case to `runBridgeCli` switch (line 1281-1329):

```typescript
case "init-vault":
  await handleInitVault(args);
  break;
```

**Step 5:** Export from bridge.ts and index.ts.

### Config.json Read/Write Pattern

The config is currently read in `persistence.ts:createFreshActor()` (line 136-150):

```typescript
const configFile = Bun.file(configPath);
if (await configFile.exists()) {
  config = await configFile.json();
}
```

For `init-vault`, the pattern for reading AND writing config.json:

```typescript
const configPath = ".planning/config.json";
const configFile = Bun.file(configPath);
let config: Record<string, unknown> = {};
if (await configFile.exists()) {
  config = await configFile.json();
}
// Modify
config.muninn = {
  ...((config.muninn as Record<string, unknown>) || {}),
  vault: vaultName,
};
// Write back
await Bun.write(configPath, JSON.stringify(config, null, 2));
```

### MuninnDB HTTP Connectivity Verification Pattern

From `packages/luca-framework/src/emitter/__helpers/muninn-http.ts` (line 63-97):

```typescript
// Factory function pattern for MuninnDB HTTP client
const client = createMuninnHttpClient({
  base_url: process.env.MUNINN_DB_URL ?? "http://127.0.0.1:8476",
  api_key: process.env.MUNINN_DB_API_KEY ?? "",
  timeout_ms: 5000,
});
```

For `init-vault` connectivity check, use a lightweight health-check fetch:

```typescript
const res = await fetch(`${baseUrl}/api/engrams?limit=1`, {
  headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
  signal: AbortSignal.timeout(5000),
});
```

### Vault Name Detection Pattern

From CONTEXT.md decisions, detect repo name from git:

```typescript
// Pattern: git remote origin URL -> extract repo name
const gitRemote = await Bun.$`git remote get-url origin 2>/dev/null`.text();
const repoName =
  gitRemote
    .trim()
    .split("/")
    .pop()
    ?.replace(/\.git$/, "") || "";
// Fallback: directory name
const dirName = process.cwd().split("/").pop() || "unknown";
const vaultName = repoName || dirName;
```

### MuninnDB MCP Call Pattern (for agents/skills)

Every MuninnDB call in the codebase follows this pattern:

```
mcp__muninn__muninn_recall(vault: "default", context: "...")
mcp__muninn__muninn_remember(vault: "default", concept: "...", content: "...")
mcp__muninn__muninn_recall_tree(vault: "default", id: "brain:project-identity")
mcp__muninn__muninn_remember_tree(vault: "default", root: {...}, children: [...])
mcp__muninn__muninn_export_graph(vault: "default")
mcp__muninn__muninn_remember_batch(vault: "default", memories: [...])
mcp__muninn__muninn_forget(vault: "default", id: "...")
mcp__muninn__muninn_link(vault: "default", source_id: "...", target_id: "...", relation: "...")
```

All currently hardcode `vault: "default"`. Phase 04 (Skill Dual-Vault Integration) will update these to use the repo vault vs default vault pattern.

### Anti-Patterns to Avoid

- **Don't try to automate vault creation via API:** MuninnDB admin APIs (vault creation, key generation) are Web UI only. The CLI must be a guided wizard, not a fully automated tool.
- **Don't read .env files manually:** Bun auto-loads `.env`. Use `process.env` directly.
- **Don't modify the XState machine for init-vault:** This is a standalone subcommand that doesn't interact with the workflow state machine at all.

## Key Code Locations

### Bridge CLI (where init-vault goes)

| File                                          | Lines     | What                                         |
| --------------------------------------------- | --------- | -------------------------------------------- |
| `packages/luca-framework/src/state/bridge.ts` | 1-1360    | Main bridge CLI with 14 subcommands          |
| `packages/luca-framework/src/state/bridge.ts` | 190-205   | `VALID_SUBCOMMANDS` array (add "init-vault") |
| `packages/luca-framework/src/state/bridge.ts` | 213-240   | `HELP_TEXT` (add vault commands section)     |
| `packages/luca-framework/src/state/bridge.ts` | 1265-1330 | `runBridgeCli()` dispatch switch (add case)  |
| `packages/luca-framework/src/state/bridge.ts` | 1342-1359 | Exports (add handleInitVault)                |
| `packages/luca-framework/src/state/index.ts`  | 114-130   | Bridge barrel exports (add handleInitVault)  |
| `packages/luca-framework/bin/luca-bridge.js`  | 1-3       | CLI entry point (`runBridgeCli()`)           |

### Config Schema

| File                                               | Lines   | What                                                    |
| -------------------------------------------------- | ------- | ------------------------------------------------------- |
| `.planning/config.json`                            | root    | Project config -- add `muninn.vault` field              |
| `packages/luca-framework/src/state/persistence.ts` | 136-150 | `createFreshActor()` reads config.json                  |
| `packages/luca-framework/src/state/types.ts`       | 163     | Config fields loaded at init (comment reference)        |
| `docs/global-installation.md`                      | 72-96   | Documents `muninn.vault` config + LUCA_MUNINN_VAULT env |

### MuninnDB HTTP Integration

| File                                                               | Lines   | What                                   |
| ------------------------------------------------------------------ | ------- | -------------------------------------- |
| `packages/luca-framework/src/emitter/__helpers/muninn-http.ts`     | 63-97   | `createMuninnHttpClient` factory       |
| `packages/luca-framework/src/emitter/__helpers/emit-functions.ts`  | 131-146 | `getEmitter()` singleton with env vars |
| `packages/luca-framework/src/emitter/__schemas/emitter.schemas.ts` | 77-99   | `emitterConfigSchema` with defaults    |

### Brain Tree (all locations that reference it)

| File                                                | Lines  | What                                                |
| --------------------------------------------------- | ------ | --------------------------------------------------- |
| `src/agents/general/lu-cognition.agent.ts`          | 154    | Recalls `brain:project-identity` from default vault |
| `src/skills/general/seed-memory.skill.ts`           | 74-110 | Stores brain tree with `muninn_remember_tree`       |
| `src/skills/luca/lu.skill.ts`                       | 92     | Pre-flight recalls brain tree                       |
| `src/skills/general/phase-plan.skill.ts`            | 58     | Recalls brain tree for planning                     |
| `src/skills/general/autopilot.skill.ts`             | 131    | Recalls brain tree for autopilot                    |
| `src/skills/general/session-plan.skill.ts`          | 29     | Recalls brain tree for session planning             |
| `src/skills/general/profile-export.skill.ts`        | 35     | Exports brain tree                                  |
| `src/skills/general/phase-discuss.skill.ts`         | 94     | Recalls brain tree for discussion                   |
| `src/agents/general/lu-discuss-researcher.agent.ts` | 79     | Recalls brain tree for research                     |
| `src/rules/general/lu-workflow.rule.ts`             | 75     | Documents brain tree concept                        |

### Vault Configuration References

| File                          | Lines | What                                                          |
| ----------------------------- | ----- | ------------------------------------------------------------- |
| `docs/global-installation.md` | 80-96 | Documents LUCA_MUNINN_VAULT env + config.json muninn.vault    |
| `.claude/CLAUDE.md` (global)  | -     | Vault determination priority: env -> config.json -> "default" |

### Env Var Pattern for MuninnDB

| Variable            | Purpose                    | Default                                             |
| ------------------- | -------------------------- | --------------------------------------------------- |
| `MUNINN_DB_URL`     | MuninnDB HTTP API base URL | `http://127.0.0.1:8476`                             |
| `MUNINN_DB_API_KEY` | Bearer token for auth      | `""` (empty)                                        |
| `LUCA_MUNINN_VAULT` | Vault name override        | (not set; falls back to config.json then "default") |

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem                 | Don't Build             | Use Instead                                                               | Why                                              |
| ----------------------- | ----------------------- | ------------------------------------------------------------------------- | ------------------------------------------------ |
| JSON config reading     | Manual fs.readFileSync  | `Bun.file().json()`                                                       | Bun API is standard in codebase                  |
| JSON config writing     | Manual fs.writeFileSync | `Bun.write(path, JSON.stringify(obj, null, 2))`                           | Bun API preserves formatting                     |
| CLI arg parsing         | Custom parser           | `getArg(args, "name")` / `hasFlag(args, "name")` from `./utils/cli-utils` | Already used by all bridge handlers              |
| MuninnDB HTTP calls     | Raw fetch               | `createMuninnHttpClient` from emitter                                     | Already implements timeout, auth, error handling |
| Git repo name detection | Complex regex           | `Bun.$\`git remote get-url origin\``                                      | Bun shell API is simpler                         |
| Vault creation/API key  | Programmatic API calls  | Guided Web UI instructions                                                | MuninnDB admin APIs don't exist via REST         |

**Key insight:** The init-vault command is primarily a **guided wizard** with console output, not a fully automated tool. The heavy lifting (vault creation, API key gen) happens in the Web UI. The CLI handles detection, configuration writing, and verification.

## Common Pitfalls

### Pitfall 1: Trying to Automate Vault Creation

**What goes wrong:** Attempting to call MuninnDB REST API to create vaults or generate API keys.
**Why it happens:** Natural assumption that admin operations have API endpoints.
**How to avoid:** Accept the Web UI constraint. The CLI guides the user through Web UI steps.
**Warning signs:** Any code trying `POST /api/vaults` or similar endpoints.

### Pitfall 2: Modifying XState Machine for init-vault

**What goes wrong:** Adding init-vault as a state machine event or guard.
**Why it happens:** It's in the bridge CLI, so it seems like it should interact with the state machine.
**How to avoid:** init-vault is a standalone utility command that reads/writes config.json only. It does not transition the workflow state machine.
**Warning signs:** Importing from `./machine` or `./types` for workflow events in the init-vault handler.

### Pitfall 3: Hardcoding Vault Names in Migration

**What goes wrong:** Hardcoding "luca-framework" as the target vault name in migration code.
**Why it happens:** Phase 03 specifically migrates luca-framework memories.
**How to avoid:** Read the vault name from config.json (muninn.vault field). The init-vault command sets this first, then migration uses it.
**Warning signs:** String literal "luca-framework" in vault parameters.

### Pitfall 4: Not Exporting Vault Before Migration

**What goes wrong:** Data loss if migration recreate fails partway through.
**Why it happens:** Rushing past the safety step.
**How to avoid:** CONTEXT.md Decision 4 mandates `muninn_export_graph` before any migration operations.
**Warning signs:** Migration code that starts without first confirming the export.

### Pitfall 5: Brain Tree Children Not Rebuilt

**What goes wrong:** Brain tree root is recreated in new vault but children (brain:stack, brain:conventions, etc.) are not linked.
**Why it happens:** `muninn_remember_tree` creates the tree structure automatically, but if you use `muninn_remember` individually, you lose the parent-child relationships.
**How to avoid:** Use `muninn_remember_tree` for the brain tree (creates root + children atomically), not individual `muninn_remember` calls.
**Warning signs:** Multiple `muninn_remember` calls for brain:\* concepts without `muninn_link` to establish hierarchy.

### Pitfall 6: Forgetting to Update Barrel Exports

**What goes wrong:** New handler function exists in bridge.ts but isn't accessible via the package barrel.
**Why it happens:** The index.ts barrel must be manually updated.
**How to avoid:** Always update `packages/luca-framework/src/state/index.ts` when adding exports to bridge.ts.
**Warning signs:** TypeScript import errors in consuming code.

## Code Examples

### init-vault Handler Skeleton

```typescript
// Source: follows bridge.ts handleSuspend pattern (line ~830)
async function handleInitVault(args: string[]): Promise<void> {
  const configPath = ".planning/config.json";

  // Step 1: Check if already configured
  const configFile = Bun.file(configPath);
  let config: Record<string, unknown> = {};
  if (await configFile.exists()) {
    try {
      config = await configFile.json();
    } catch {
      // Invalid JSON, start fresh
    }
  }

  const existingVault = get(config, "muninn.vault") as string | undefined;
  if (existingVault && !hasFlag(args, "force")) {
    console.log(
      JSON.stringify({
        already_configured: true,
        vault: existingVault,
        message: `Vault already configured: "${existingVault}". Use --force to reconfigure.`,
      }),
    );
    return;
  }

  // Step 2: Detect repo name
  let repoName = "";
  try {
    const remote = await Bun.$`git remote get-url origin 2>/dev/null`.text();
    repoName =
      remote
        .trim()
        .split("/")
        .pop()
        ?.replace(/\.git$/, "") || "";
  } catch {
    /* no git remote */
  }
  if (!repoName) {
    repoName = process.cwd().split("/").pop() || "unknown";
  }

  const vaultName = getArg(args, "vault") || repoName;

  // Step 3: Output guided setup instructions
  console.log(
    JSON.stringify({
      wizard: true,
      detected_repo: repoName,
      suggested_vault: vaultName,
      steps: [
        `Open MuninnDB Web UI: http://127.0.0.1:8476`,
        `Create a new vault named "${vaultName}"`,
        `Generate an API key for the "${vaultName}" vault`,
        `Add MUNINN_DB_API_KEY=<key> to your .env file`,
      ],
      config_path: configPath,
    }),
  );

  // Step 4: Write config
  const muninnConfig = (config.muninn as Record<string, unknown>) || {};
  config.muninn = { ...muninnConfig, vault: vaultName };
  await Bun.write(configPath, JSON.stringify(config, null, 2));

  // Step 5: Verify connectivity (best-effort)
  const baseUrl = process.env.MUNINN_DB_URL ?? "http://127.0.0.1:8476";
  const apiKey = process.env.MUNINN_DB_API_KEY ?? "";
  let connected = false;
  try {
    const headers: Record<string, string> = {};
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
    const res = await fetch(
      `${baseUrl}/api/engrams?limit=1&vault=${vaultName}`,
      {
        headers,
        signal: AbortSignal.timeout(5000),
      },
    );
    connected = res.ok;
  } catch {
    /* connectivity check failed */
  }

  console.log(
    JSON.stringify({
      configured: true,
      vault: vaultName,
      config_written: configPath,
      connectivity: connected ? "verified" : "not_verified",
    }),
  );
}
```

### Brain Tree Split: Project Brain (repo vault)

```json
{
  "vault": "<repo-vault>",
  "root": {
    "concept": "brain:project-identity",
    "content": "Luca Framework -- agentic development tooling monorepo...",
    "type": "project_identity",
    "summary": "Project identity and conventions for luca-framework"
  },
  "children": [
    {
      "concept": "brain:stack",
      "content": "TypeScript, Bun, Zod, functional patterns...",
      "type": "project_stack"
    },
    {
      "concept": "brain:architecture",
      "content": "Domain tiers, barrel-only index, entity isolation...",
      "type": "project_architecture"
    },
    {
      "concept": "brain:conventions",
      "content": "Kebab-case files, schema-first parsing...",
      "type": "project_conventions"
    },
    {
      "concept": "brain:workflow",
      "content": "Source edit -> build:all -> generated output...",
      "type": "project_workflow"
    }
  ]
}
```

### Brain Tree Split: User Brain (default vault)

```json
{
  "vault": "default",
  "root": {
    "concept": "brain:user-identity",
    "content": "Solo developer + AI workflow. Bun preference, lodash, Zod schemas.",
    "type": "user_identity",
    "summary": "User preferences and development style"
  },
  "children": [
    {
      "concept": "brain:user-role",
      "content": "Visionary/product owner, AI is builder...",
      "type": "user_role"
    },
    {
      "concept": "brain:user-preferences",
      "content": "Bun over npm, lodash, functional patterns, no classes...",
      "type": "user_preferences"
    },
    {
      "concept": "brain:user-tools",
      "content": "MuninnDB for memory, Claude Code, Cursor IDE...",
      "type": "user_tools"
    },
    {
      "concept": "brain:user-communication",
      "content": "No emojis in code, mandatory documentation...",
      "type": "user_communication"
    }
  ]
}
```

## State of the Art

| Old Approach                               | Current Approach                                               | When Changed                                     | Impact                                                 |
| ------------------------------------------ | -------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------ |
| Single "default" vault for everything      | Multi-vault (default + repo-specific)                          | Phase 03 (now)                                   | Clean separation of cross-cutting vs project-specific  |
| Single brain tree (brain:project-identity) | Split: project brain (repo vault) + user brain (default vault) | Phase 03 (now)                                   | Brain tree travels with project, user prefs are global |
| Hardcoded `vault: "default"` everywhere    | Vault from config.json/env var                                 | Phase 03 (init-vault) + Phase 04 (skill updates) | Per-project vault isolation                            |

**Not yet changed (Phase 04):**

- All MuninnDB MCP calls in skills/agents still hardcode `vault: "default"`
- Phase 04 (Skill Dual-Vault Integration) will update recall/write routing

## Open Questions

1. **Interactive prompting in bridge CLI**
   - What we know: Bridge CLI outputs JSON to stdout. Current commands don't prompt for input.
   - What's unclear: Should init-vault prompt for the API key interactively (stdin), or just output instructions and let the user manually add it to .env?
   - Recommendation: Output instructions only. Keep the bridge CLI non-interactive (JSON in, JSON out). Users add the API key to `.env` manually or via a separate step. This matches the existing bridge pattern and avoids stdin complexity.

2. **Vault connectivity verification endpoint**
   - What we know: `POST /api/engrams` is the confirmed write endpoint. `GET /api/engrams?limit=1` should work for a read check.
   - What's unclear: Whether querying a vault that exists but is empty returns 200 or 404.
   - Recommendation: Use a lenient check -- any non-error response (200 or empty result) means connectivity is working. A 401/403 means auth issue. Connection refused means MuninnDB not running.

3. **Migration batch size for luca-framework memories**
   - What we know: `muninn_remember_batch` supports up to 50 per call. CONTEXT.md mentions this.
   - What's unclear: How many total memories need migrating from default vault.
   - Recommendation: The migration is an MCP-driven operation (recall -> classify -> recreate). Count memories first via `muninn_recall` before planning batch sizes.

## Sources

### Primary (HIGH confidence)

- `packages/luca-framework/src/state/bridge.ts` -- Full bridge CLI source, subcommand pattern
- `packages/luca-framework/src/state/persistence.ts` -- Config.json reading pattern
- `packages/luca-framework/src/emitter/__helpers/muninn-http.ts` -- MuninnDB HTTP client pattern
- `packages/luca-framework/src/emitter/__helpers/emit-functions.ts` -- Env var pattern (MUNINN_DB_URL, MUNINN_DB_API_KEY)
- `.planning/config.json` -- Current config schema
- `docs/global-installation.md` -- Documents vault configuration options
- `.planning/phases/03-multi-vault-migration/03-CONTEXT.md` -- Phase decisions and constraints

### Secondary (MEDIUM confidence)

- `src/agents/general/lu-cognition.agent.ts` -- Brain tree recall pattern
- `src/skills/general/seed-memory.skill.ts` -- Brain tree creation pattern

### Tertiary (LOW confidence)

- MuninnDB API endpoint behavior (`GET /api/engrams?limit=1` for connectivity check) -- inferred from write endpoint pattern, not verified

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH -- all libraries already in project, no new deps needed
- Architecture: HIGH -- bridge CLI pattern is clear with 14 existing examples
- Config schema: HIGH -- config.json and env var patterns are well-documented
- Brain tree structure: HIGH -- seed-memory.skill.ts has exact tree structure examples
- MuninnDB HTTP verification: MEDIUM -- write endpoint is confirmed, read endpoint for connectivity check is inferred
- Pitfalls: HIGH -- CONTEXT.md explicitly documents admin API limitations

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (stable domain, internal codebase)
