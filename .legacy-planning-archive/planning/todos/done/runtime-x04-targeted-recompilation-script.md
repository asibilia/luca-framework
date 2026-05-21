---
title: "Runtime X04: Targeted recompilation script — compile single domain without build:all"
area: runtime-architecture
created: 2026-03-24
source: docs/runtime-architecture/research/risk-analysis.md
depends_on: []
phase: runtime-x
estimated_files: 1
---

## Context

MEMORY.md documents: "Never run `bun run build:all` during a Claude Code session — it crashes the process." The risk analysis (Risk 3) recommends building a targeted recompilation script early to reduce the edit-build-restart friction. This is estimated at ~50 lines and can save hundreds of session restarts over the 8-12 week runtime architecture initiative.

## Task

### 1. Create targeted recompile script

**File:** `scripts/targeted-recompile.ts`

```typescript
#!/usr/bin/env bun

/**
 * Targeted domain recompilation.
 *
 * Compiles a single domain's artifacts without running the full build:all
 * pipeline. This avoids the known build:all crash in Claude Code sessions.
 *
 * Usage:
 *   bun run scripts/targeted-recompile.ts --domain=agents
 *   bun run scripts/targeted-recompile.ts --domain=skills
 *   bun run scripts/targeted-recompile.ts --domain=rules
 *   bun run scripts/targeted-recompile.ts --domain=hooks
 *   bun run scripts/targeted-recompile.ts --domain=all  (same as build:all but domain-by-domain)
 *
 * @module scripts/targeted-recompile
 */

import { parseArgs } from "util";

const VALID_DOMAINS = ["agents", "skills", "rules", "hooks"] as const;
type Domain = (typeof VALID_DOMAINS)[number];

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    domain: { type: "string" },
  },
});

const domain = values.domain;

if (!domain) {
  console.error("Usage: bun run scripts/targeted-recompile.ts --domain=<agents|skills|rules|hooks|all>");
  process.exit(1);
}

if (domain !== "all" && !VALID_DOMAINS.includes(domain as Domain)) {
  console.error(`Invalid domain: ${domain}. Valid: ${VALID_DOMAINS.join(", ")}, all`);
  process.exit(1);
}

const domainsToCompile: Domain[] =
  domain === "all" ? [...VALID_DOMAINS] : [domain as Domain];

for (const d of domainsToCompile) {
  console.log(`Compiling ${d}...`);
  const startMs = performance.now();

  // Import the compiler for this domain dynamically to avoid loading
  // the full build pipeline. Each compiler function is a standalone
  // export from src/compilers/.
  try {
    const compilers = await import("../src/compilers/index");

    switch (d) {
      case "agents":
        await compilers.compileAgents();
        break;
      case "skills":
        await compilers.compileSkills();
        break;
      case "rules":
        await compilers.compileRules();
        break;
      case "hooks":
        await compilers.compileHooks();
        break;
    }

    const elapsedMs = Math.round(performance.now() - startMs);
    console.log(`  Done (${elapsedMs}ms)`);
  } catch (error) {
    console.error(`  Failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

console.log("Recompilation complete.");
```

**Implementation notes:**

- The script dynamically imports from `src/compilers/index` to access individual compiler functions. If the current barrel does not export per-domain compile functions (e.g., `compileAgents`, `compileSkills`, `compileRules`, `compileHooks`), the implementing agent must extract them from the existing build pipeline.
- Check `src/compilers/__helpers/` for the actual compilation functions. The existing `bun run build:all` script (likely in `packages-dev/bun-scripts/`) calls these. The targeted recompile script calls the same functions but only for one domain.
- If per-domain functions are not cleanly extractable, create thin wrappers that call the relevant subset of the build pipeline.

### 2. Add package.json script alias

**File:** `package.json` (root)

Add to `scripts`:

```json
{
  "scripts": {
    "build:domain": "bun run scripts/targeted-recompile.ts"
  }
}
```

Usage: `bun run build:domain -- --domain=agents`

## Verification

- `bun run scripts/targeted-recompile.ts --domain=agents` compiles only agent artifacts to `.claude/agents/` without touching skills/rules/hooks
- `bun run scripts/targeted-recompile.ts --domain=skills` compiles only skill artifacts
- `bun run scripts/targeted-recompile.ts --domain=rules` compiles only rule artifacts
- `bun run scripts/targeted-recompile.ts --domain=hooks` compiles only hook artifacts
- `bun run scripts/targeted-recompile.ts --domain=all` compiles all domains sequentially (equivalent to build:all but domain-by-domain)
- Output of `--domain=all` matches output of `bun run build:all` (use `bun run check:drift` to verify)
- `bunx --bun tsc --noEmit` passes
- Script completes without crashing the Claude Code session

## Notes

- This is a risk mitigation from the risk analysis (Risk 3, Likelihood HIGH, Impact MEDIUM).
- Priority: do this BEFORE starting Phase A. It costs ~1 day and saves weeks of friction.
- The `--domain=all` mode serves as a safe alternative to `build:all` that processes domains sequentially rather than potentially in a way that crashes Claude Code.
