# Technology Stack: Luca Framework CLI

**Project:** Luca Framework - CLI-installable agent development framework for Cursor IDE  
**Researched:** 2026-02-04  
**Overall Confidence:** HIGH

## Executive Summary

This document recommends the optimal technology stack for building a CLI-installable Cursor agent framework. The stack prioritizes:

1. **Zero-friction installation** via `npx` pattern
2. **Modern TypeScript-first tooling** from the UnJS ecosystem
3. **Lightweight dependencies** for fast execution
4. **Enterprise-grade configuration** patterns
5. **Cursor IDE compatibility** following established MCP patterns

## Recommended Stack

### Core CLI Framework

| Technology | Version | Purpose | Rationale |
|------------|---------|---------|-----------|
| **citty** | ^0.2.0 | CLI framework | Zero deps, UnJS ecosystem, lazy commands, auto-help generation, 10M+ weekly downloads |
| **@clack/prompts** | ^0.10.0 | Interactive prompts | 80% smaller than Inquirer, beautiful UI, TypeScript-first, async/await native |
| **consola** | ^3.4.0 | Logging/output | Elegant terminal output, UnJS ecosystem, fancy + minimal fallback, tag support |

**Why citty over Commander/Yargs?**
- Commander has 243M downloads but is heavier and less TypeScript-native
- citty offers zero dependencies, lazy command loading, and fits the UnJS ecosystem pattern
- Smart value parsing with typecast and boolean shortcuts built-in

```typescript
// Example: citty usage
import { defineCommand, runMain } from 'citty';

const main = defineCommand({
  meta: {
    name: 'luca',
    description: 'Luca Framework CLI',
    version: '1.0.0',
  },
  subCommands: {
    init: () => import('./commands/init').then(m => m.default),
    update: () => import('./commands/update').then(m => m.default),
  },
});

runMain(main);
```

### Terminal Output & Styling

| Technology | Version | Purpose | Rationale |
|------------|---------|---------|-----------|
| **picocolors** | ^1.1.0 | Terminal colors | 14x smaller than chalk, 2x faster, zero deps, NO_COLOR friendly |
| **consola** | ^3.4.0 | Structured logging | Box drawing, success/warn/error styling, progress indicators |

**Why picocolors over chalk?**
- Chalk v5 is ESM-only and 101 kB (including deps)
- picocolors is 7 kB with 0.466ms load time vs chalk's 6.167ms
- Performance matters for CLI startup time

```typescript
// Example: picocolors usage
import pc from 'picocolors';

console.log(pc.green('✓') + ' ' + pc.bold('Installation complete'));
console.log(pc.yellow('⚠') + ' ' + pc.dim('Using default configuration'));
```

### File System & Shell Operations

| Technology | Version | Purpose | Rationale |
|------------|---------|---------|-----------|
| **fs-extra** | ^11.3.0 | File operations | Drop-in fs replacement, promise support, graceful-fs for EMFILE prevention |
| **execa** | ^9.6.0 | Shell commands | Promise-based, no shell injection, cross-platform, detailed errors |
| **giget** | ^1.2.0 | Template downloading | Fast tarball extraction, GitHub/GitLab support, offline caching |

**Why execa over native child_process?**
- Template string syntax like zx: `` await $`git status` ``
- No escaping needed, eliminating shell injection risks
- Excellent Windows support with shebang and PATHEXT handling
- IPC support for subprocess communication

```typescript
// Example: execa usage
import { $ } from 'execa';

// Safe, no shell injection possible
const branch = await $`git branch --show-current`;
await $`mkdir -p ${directoryName}`; // Properly escaped
```

### Configuration Management

| Technology | Version | Purpose | Rationale |
|------------|---------|---------|-----------|
| **cosmiconfig** | ^9.0.0 | Config loading | Industry standard, searches package.json + rc files + .config/ |
| **zod** | ^3.24.0 | Schema validation | Runtime validation, TypeScript inference, composable schemas |

**Configuration file strategy:**
```
.planning/
├── config.json              # Primary project configuration
├── BRAIN.md                 # AI context
└── research/                # Research outputs

.cursor/
├── mcp.json                 # MCP server configuration (Cursor standard)
├── rules/                   # Project rules (.mdc files)
│   └── *.mdc
└── skills/                  # Agent skills
    └── */SKILL.md
```

**Why this structure?**
- Follows established Cursor IDE patterns
- Separates concerns: project config vs IDE config
- Uses JSON for structured data, Markdown for human-readable context
- Compatible with MCP server patterns already adopted

```typescript
// Example: cosmiconfig + zod usage
import { cosmiconfig } from 'cosmiconfig';
import { z } from 'zod';

const ConfigSchema = z.object({
  project_name: z.string(),
  version: z.string().default('1.0.0'),
  model_config: z.object({
    main: z.string().default('claude-opus-4'),
    research: z.string().optional(),
  }).default({}),
});

const explorer = cosmiconfig('luca');
const result = await explorer.search();
const config = ConfigSchema.parse(result?.config ?? {});
```

### Build & Bundling

| Technology | Version | Purpose | Rationale |
|------------|---------|---------|-----------|
| **unbuild** | ^3.3.0 | Package bundling | Active development (unlike tsup), Rollup-based, auto-inference from package.json |
| **typescript** | ^5.7.0 | Type checking | Required for type declarations |

**Why unbuild over tsup?**
- tsup is no longer actively maintained (recommends migration to tsdown)
- unbuild offers bundleless mode via mkdist for faster development
- Automatic security checks for missing/unused dependencies
- Better package.json inference

```json
// package.json build configuration
{
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    }
  },
  "bin": {
    "luca": "./dist/cli.mjs"
  },
  "files": ["dist"]
}
```

### Testing

| Technology | Version | Purpose | Rationale |
|------------|---------|---------|-----------|
| **bun test** | built-in | Unit testing | Project already uses Bun, Jest-compatible, TypeScript native |

**Why Bun test?**
- Per project rules, Bun is the primary runtime
- Zero additional dependencies
- Native TypeScript execution
- Fast test execution

```typescript
// Example: Bun test
import { describe, test, expect } from 'bun:test';
import { parseConfig } from './config';

describe('parseConfig', () => {
  test('applies defaults for missing fields', () => {
    const result = parseConfig({});
    expect(result.version).toBe('1.0.0');
  });
});
```

## npm Package Structure

### Package Naming

**Recommended:** `create-luca` + `luca-framework`

| Package | Purpose | Installation |
|---------|---------|--------------|
| `create-luca` | Project scaffolding | `npx create-luca` or `npm init luca` |
| `luca-framework` | Core library + CLI | `npx luca-framework` or global install |

**Why this split?**
- `npm init <name>` pattern triggers `create-<name>` automatically
- Follows ecosystem conventions (create-vite, create-next-app)
- Allows standalone CLI usage without scaffolding

### package.json Configuration

```json
{
  "name": "create-luca",
  "version": "1.0.0",
  "description": "Scaffold a Luca Framework project for Cursor IDE",
  "type": "module",
  "bin": {
    "create-luca": "./dist/cli.mjs"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "files": [
    "dist",
    "templates"
  ],
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "types": "./dist/index.d.ts"
    }
  },
  "keywords": [
    "cursor",
    "ide",
    "agent",
    "mcp",
    "ai",
    "scaffolding"
  ]
}
```

### CLI Executable Structure

```
#!/usr/bin/env node
// dist/cli.mjs - Entry point

import { runMain } from 'citty';
import { main } from './commands/main.js';

runMain(main);
```

**Critical:** Every executable must have `#!/usr/bin/env node` shebang for cross-platform compatibility.

## Installation Patterns

### Pattern 1: npx One-Shot (Recommended for Scaffolding)

```bash
# Creates new project with interactive prompts
npx create-luca my-project

# Or using npm init shorthand
npm init luca my-project
```

**Implementation:**
- Package name: `create-luca`
- Downloads on-demand, always latest version
- No global pollution
- Interactive prompts via @clack/prompts

### Pattern 2: Global Install (For Power Users)

```bash
# Install globally for frequent use
npm install -g luca-framework

# Use anywhere
luca init
luca update
```

### Pattern 3: Project-Local (For Team Consistency)

```bash
# Add to devDependencies
npm install -D luca-framework

# Run via npx or npm scripts
npx luca update
```

## Configuration File Strategy

### Hierarchical Precedence (Enterprise Pattern)

1. **System defaults** (hardcoded in CLI)
2. **User settings** (`~/.config/luca/config.json`)
3. **Project settings** (`.planning/config.json`)
4. **Environment overrides** (env vars for CI/CD)

```typescript
// Configuration loading order
const loadConfig = async () => {
  const explorer = cosmiconfig('luca');
  
  // Project-level config
  const projectConfig = await explorer.search();
  
  // User-level config
  const userConfig = await explorer.load(
    path.join(os.homedir(), '.config/luca/config.json')
  ).catch(() => null);
  
  // Merge with precedence
  return mergeConfigs(
    DEFAULT_CONFIG,
    userConfig?.config,
    projectConfig?.config,
    getEnvOverrides()
  );
};
```

### Cursor-Specific Configuration

```json
// .cursor/mcp.json - MCP server configuration
{
  "mcpServers": {
    "luca": {
      "command": "npx",
      "args": ["luca-framework", "mcp-server"],
      "env": {
        "ANTHROPIC_API_KEY": "${env:ANTHROPIC_API_KEY}"
      }
    }
  }
}
```

## Postinstall Considerations

### Security Warning

**DO NOT use postinstall scripts for critical setup.** They execute with user privileges and are increasingly disabled for security (`--ignore-scripts`).

### Recommended Alternative

Use explicit `init` command instead:

```bash
# User runs explicitly, understands what happens
npx create-luca init

# NOT automatic postinstall that runs unknown code
```

### When Postinstall is Acceptable

- Compiling native modules (unavoidable)
- Running `husky install` for git hooks (dev dependency only)
- Generating type definitions (rare)

## Cursor IDE Compatibility Notes

### .cursor/rules Structure

```
.cursor/
├── rules/
│   ├── my-rule.mdc           # Rule files (Markdown Cursor)
│   └── subdir/
│       └── nested-rule.mdc
└── skills/
    └── my-skill/
        └── SKILL.md
```

### MCP Server Integration

Cursor expects MCP servers configured in `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "server-name": {
      "command": "node",
      "args": ["./path/to/server.js"],
      "env": {}
    }
  }
}
```

The Luca CLI should:
1. Scaffold this structure during `init`
2. Provide commands to manage MCP configuration
3. Never modify user's existing MCP servers without consent

## Alternatives Considered

| Category | Recommended | Alternative | Why Not Alternative |
|----------|-------------|-------------|---------------------|
| CLI Framework | citty | Commander | Commander is heavier, less TypeScript-native |
| CLI Framework | citty | Yargs | Yargs is more complex for simple use cases |
| CLI Framework | citty | oclif | oclif is enterprise-grade but heavyweight |
| Prompts | @clack/prompts | Inquirer | Inquirer is 80% larger, older API patterns |
| Colors | picocolors | chalk | chalk v5 is ESM-only and 14x larger |
| Shell | execa | zx | execa is more programmatic, better for libraries |
| Bundler | unbuild | tsup | tsup is no longer maintained |
| Config | cosmiconfig | custom | cosmiconfig is industry standard, well-tested |

## Installation Commands

```bash
# Core dependencies
bun add citty @clack/prompts consola picocolors

# File system utilities
bun add fs-extra execa giget

# Configuration
bun add cosmiconfig zod

# Dev dependencies
bun add -D unbuild typescript @types/fs-extra
```

## Version Compatibility

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| Node.js | 18.0.0 | 20.x LTS |
| Bun | 1.0.0 | 1.1.x |
| npm | 9.0.0 | 10.x |

**Why Node 18+?**
- Native fetch API
- ESM support
- Most libraries have dropped Node 16 support

## Sources

### HIGH Confidence (Official Documentation)

- npm docs: bin field, engines field, scripts lifecycle
- Execa GitHub: https://github.com/sindresorhus/execa
- UnJS packages: citty, consola, giget (official documentation)
- cosmiconfig npm: Configuration loading patterns

### MEDIUM Confidence (Verified Community Sources)

- CLI framework comparison: npmtrends.com/commander-vs-oclif-vs-yargs
- picocolors vs chalk: GitHub benchmarks and npm statistics
- @clack/prompts: npm package documentation

### Research Methodology

1. Verified all library recommendations against npm download statistics
2. Cross-referenced UnJS ecosystem patterns for consistency
3. Checked maintenance status (tsup deprecation warning)
4. Confirmed Cursor IDE compatibility patterns from existing tools
