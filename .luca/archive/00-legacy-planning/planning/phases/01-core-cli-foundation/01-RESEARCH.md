# Phase 1: Core CLI & Foundation - Research

**Researched:** 2026-02-04
**Domain:** CLI scaffolding, npm packages, interactive setup wizards
**Confidence:** HIGH

## Summary

This research covers the technical implementation for building a CLI installer (`npx luca init`) that scaffolds Luca projects. The key architectural decisions are:

1. **Dual-package architecture**: `create-luca` (thin scaffolder) + `luca-framework` (main CLI)
2. **UnJS ecosystem**: citty for CLI commands, @clack/prompts for interactive wizard, consola for output
3. **Template extraction**: giget for pulling templates, EJS for variable substitution
4. **Manifest-driven updates**: SHA-256 hashes for conflict detection

**Primary recommendation:** Build `create-luca` as a minimal package that runs the interactive wizard and delegates to `luca-framework` for file generation. This keeps scaffolding logic centralized and enables future commands (update, doctor) in the main package.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| citty | 0.2.0 | CLI framework | UnJS ecosystem, zero deps, fast, built-in help generation |
| @clack/prompts | 1.0.0 | Interactive prompts | 4KB, beautiful UI, TypeScript-native, Promise-based |
| consola | 3.4.2 | Console logging | UnJS ecosystem, colorful output, spinners, clack integration |
| giget | latest | Template extraction | UnJS ecosystem, GitHub/npm support, offline cache |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pathe | latest | Path utilities | Cross-platform path handling |
| defu | latest | Object defaults | Merging config with defaults |
| pkg-types | latest | Package detection | Read package.json safely |
| std-env | latest | Environment detection | Detect CI, TTY, etc. |
| fs-extra | latest | File operations | Ensuring directories, copying |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| citty | commander/yargs | citty is lighter, UnJS-native, but less mature |
| @clack/prompts | inquirer/prompts | clack has better UX, smaller bundle, but newer |
| giget | degit | giget has UnJS integration, template registry |
| EJS | handlebars | EJS is simpler, more familiar to Node devs |

**Installation:**
```bash
bun add citty @clack/prompts consola giget pathe defu pkg-types std-env fs-extra
```

## Architecture Patterns

### Dual-Package Structure

```
packages/
├── create-luca/              # Scaffolding entry point
│   ├── package.json          # name: "create-luca", bin: "./bin/create-luca.js"
│   ├── bin/
│   │   └── create-luca.js    # #!/usr/bin/env node, delegates to luca-framework
│   └── src/
│       └── index.ts          # Thin wrapper: imports and runs wizard
│
└── luca-framework/           # Main CLI with all logic
    ├── package.json          # name: "luca-framework", bin: "./bin/luca.js"
    ├── bin/
    │   └── luca.js           # Main CLI entry
    ├── src/
    │   ├── commands/
    │   │   ├── init.ts       # Full init wizard logic
    │   │   ├── update.ts     # Phase 2
    │   │   └── doctor.ts     # Phase 3
    │   ├── utils/
    │   │   ├── detect.ts     # Project detection
    │   │   ├── template.ts   # Template processing
    │   │   ├── manifest.ts   # Manifest operations
    │   │   └── files.ts      # File operations
    │   └── templates/        # Embedded templates
    │       ├── base/         # Core framework files
    │       ├── stacks/       # Stack-specific templates
    │       │   └── react-ts/ # React+TS BRAIN.md, rules
    │       └── config.json   # Default config template
    └── templates/            # External templates (for giget)
```

### Pattern 1: npm create Convention

**What:** `npm create luca` invokes `create-luca` which runs `luca-framework init`

**When to use:** Any scaffolding CLI following modern npm patterns

**How it works:**
```
npm create luca → npm exec create-luca → create-luca/bin/create-luca.js
                                         ↓
                                    imports luca-framework
                                         ↓
                                    runs init wizard
```

**Example:**
```typescript
// create-luca/bin/create-luca.js
#!/usr/bin/env node
import { runInit } from 'luca-framework/commands/init';
runInit();

// luca-framework/src/commands/init.ts
import { defineCommand, runMain } from 'citty';
import * as p from '@clack/prompts';
import consola from 'consola';

export const initCommand = defineCommand({
  meta: {
    name: 'init',
    description: 'Initialize a new Luca project',
  },
  args: {
    quick: {
      type: 'boolean',
      description: 'Skip interactive prompts, use defaults',
      default: false,
    },
    config: {
      type: 'string',
      description: 'Path to config file for non-interactive mode',
    },
  },
  async run({ args }) {
    // Run wizard or use config file
  },
});

export const runInit = () => runMain(initCommand);
```

### Pattern 2: Interactive Setup Wizard

**What:** Guided flow using @clack/prompts

**Example:**
```typescript
import * as p from '@clack/prompts';
import consola from 'consola';

async function runWizard() {
  p.intro('🚀 Welcome to Luca');

  // 1. Detect existing project
  const hasPackageJson = await detectPackageJson();
  const hasGit = await detectGit();

  if (hasPackageJson) {
    consola.info('Detected existing project');
  }

  // 2. Branding (early in flow per CONTEXT.md)
  const branding = await p.group({
    frameworkName: () => p.text({
      message: 'What should we call your assistant?',
      placeholder: 'Luca',
      defaultValue: 'Luca',
      validate: (value) => {
        if (!value) return 'Name is required';
        if (!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(value)) {
          return 'Name must start with letter, contain only letters, numbers, dashes';
        }
      },
    }),
    commandPrefix: () => p.text({
      message: 'Command prefix for skills?',
      placeholder: 'lu',
      defaultValue: 'lu',
      validate: (value) => {
        if (!value) return 'Prefix is required';
        if (!/^[a-z][a-z0-9]*$/.test(value)) {
          return 'Prefix must be lowercase letters and numbers';
        }
      },
    }),
  });

  // 3. Stack detection/selection
  const detectedStack = await detectStack();
  const stack = await p.select({
    message: 'Select your stack template',
    options: [
      { value: 'react-ts', label: 'React + TypeScript', hint: detectedStack === 'react' ? '(detected)' : '' },
      { value: 'custom', label: 'Custom (no template)' },
    ],
    initialValue: detectedStack === 'react' ? 'react-ts' : undefined,
  });

  // 4. Work tracker (Phase 2 implements adapters)
  const workTracker = await p.select({
    message: 'Which work tracker do you use?',
    options: [
      { value: 'jira', label: 'Jira' },
      { value: 'github', label: 'GitHub Issues' },
      { value: 'none', label: 'None / Placeholder tickets' },
    ],
  });

  // 5. Confirmation
  const spinner = p.spinner();
  spinner.start('Creating Luca project...');

  await generateFiles({ branding, stack, workTracker });

  spinner.stop('Project created!');

  p.outro(`✅ Run /${branding.commandPrefix} to get started`);
}
```

### Pattern 3: Template Variable Substitution

**What:** EJS syntax for content, __ for filenames

**Template content example:**
```markdown
# <%= branding.frameworkName %> Project

Use `/<%= branding.commandPrefix %>` to interact with <%= branding.frameworkName %>.

- Ticket pattern: `<%= branding.ticketPattern %>`
- Placeholder ticket: `<%= branding.placeholderTicket %>`
```

**Filename example:**
```
templates/
├── __commandPrefix__-help.md  → lu-help.md (after processing)
└── config.json                → config.json (no substitution)
```

**Processing:**
```typescript
import { readFile, writeFile } from 'fs/promises';
import { render } from 'ejs';

async function processTemplate(
  templatePath: string,
  outputPath: string,
  context: Record<string, any>
) {
  const template = await readFile(templatePath, 'utf-8');
  const content = render(template, context);
  await writeFile(outputPath, content);
}

function processFilename(filename: string, context: Record<string, any>): string {
  return filename.replace(/__(\w+)__/g, (_, key) => context[key] || key);
}
```

### Anti-Patterns to Avoid

- **Monolithic create package:** Don't put all logic in create-luca. Keep it thin.
- **Synchronous prompts:** Always use async/await with @clack/prompts.
- **Missing cleanup on error:** Always handle SIGINT and cleanup partial files.
- **Hardcoded branding:** Never hardcode "lu", "Luca", etc. Always read from config.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CLI argument parsing | Custom parser | citty | Edge cases, help generation, types |
| Interactive prompts | readline-based | @clack/prompts | UX, validation, cancellation handling |
| Template cloning | git clone | giget | Speed, caching, subdirectory support |
| Path handling | string concat | pathe | Cross-platform, edge cases |
| Config merging | Object.assign | defu | Deep merge, array handling |
| Package.json reading | JSON.parse | pkg-types | Error handling, type safety |

**Key insight:** The UnJS ecosystem is designed to work together. Using citty + consola + giget + pathe gives consistent behavior and smaller bundle than mixing ecosystems.

## Common Pitfalls

### Pitfall 1: npm create Arguments

**What goes wrong:** Arguments don't reach the CLI

**Why it happens:** `npm create foo arg` doesn't pass `arg` to the package

**How to avoid:** Document that users need `--` separator: `npm create luca -- --quick`

**Warning signs:** "Arguments not working" issues

### Pitfall 2: Missing Shebang

**What goes wrong:** CLI fails with "cannot execute binary file"

**Why it happens:** Forgetting `#!/usr/bin/env node` at top of bin file

**How to avoid:** Always include shebang, test with `npm exec .`

**Warning signs:** Works with `bun` but fails with `npm exec`

### Pitfall 3: Partial Installation Cleanup

**What goes wrong:** Failed init leaves partial files

**Why it happens:** Error mid-process without cleanup

**How to avoid:** Track created files, implement cleanup on SIGINT/error

```typescript
const createdFiles: string[] = [];

process.on('SIGINT', async () => {
  consola.warn('\nInstallation cancelled. Cleaning up...');
  for (const file of createdFiles.reverse()) {
    await rm(file, { recursive: true, force: true });
  }
  process.exit(1);
});
```

### Pitfall 4: Detecting "Already Installed"

**What goes wrong:** Re-running init corrupts existing installation

**Why it happens:** No check for existing .cursor/luca/

**How to avoid:** Check early, abort with helpful message

```typescript
if (await exists('.cursor/luca/')) {
  consola.error('Luca is already installed in this project.');
  consola.info('Run `npx luca update` to update to the latest version.');
  process.exit(1);
}
```

### Pitfall 5: Windows Path Issues

**What goes wrong:** Paths break on Windows

**Why it happens:** Using `/` directly instead of path utilities

**How to avoid:** Always use pathe for path operations

```typescript
import { join, resolve } from 'pathe';

// ✅ Works everywhere
const configPath = join('.planning', 'config.json');

// ❌ Breaks on Windows
const badPath = '.planning/config.json';
```

## Code Examples

Verified patterns from official sources and best practices:

### citty Command with Subcommands

```typescript
// Source: citty documentation
import { defineCommand, runMain } from 'citty';

const init = defineCommand({
  meta: { name: 'init', description: 'Initialize Luca' },
  args: {
    quick: { type: 'boolean', description: 'Skip prompts' },
  },
  run: ({ args }) => { /* ... */ },
});

const update = defineCommand({
  meta: { name: 'update', description: 'Update Luca' },
  run: () => { /* ... */ },
});

const main = defineCommand({
  meta: { name: 'luca', version: '1.0.0' },
  subCommands: { init, update },
});

runMain(main);
```

### @clack/prompts Full Wizard

```typescript
// Source: @clack/prompts documentation
import * as p from '@clack/prompts';
import { setTimeout } from 'timers/promises';

async function wizard() {
  p.intro('Welcome!');

  const project = await p.group(
    {
      name: () => p.text({
        message: 'Project name?',
        validate: (v) => v.length < 1 ? 'Required' : undefined,
      }),
      type: () => p.select({
        message: 'Type?',
        options: [
          { value: 'app', label: 'Application' },
          { value: 'lib', label: 'Library' },
        ],
      }),
      features: () => p.multiselect({
        message: 'Features?',
        options: [
          { value: 'typescript', label: 'TypeScript' },
          { value: 'eslint', label: 'ESLint' },
        ],
      }),
      confirm: () => p.confirm({
        message: 'Proceed?',
      }),
    },
    {
      onCancel: () => {
        p.cancel('Setup cancelled.');
        process.exit(0);
      },
    }
  );

  const s = p.spinner();
  s.start('Creating files...');
  await setTimeout(1000);
  s.stop('Done!');

  p.outro('All set!');
}
```

### consola Logging Patterns

```typescript
// Source: consola documentation
import { consola, createConsola } from 'consola';

// Tagged logger for component
const log = consola.withTag('init');

log.start('Initializing Luca...');
log.info('Detected existing package.json');
log.success('Created .cursor/luca/');
log.warn('Work tracker not configured');
log.error(new Error('Failed to create directory'));

// Box for summary
consola.box(`
  ✅ Luca initialized successfully!
  
  Next steps:
  - Run /${config.commandPrefix} to get started
  - Customize .cursor/agents/ for your team
`);
```

### giget Template Extraction

```typescript
// Source: giget documentation
import { downloadTemplate } from 'giget';

// From GitHub
await downloadTemplate('github:user/luca-framework/templates/react-ts', {
  dir: '.cursor/luca/templates',
  force: true,
});

// From npm package (embedded templates)
await downloadTemplate('npm:luca-framework/templates/base', {
  dir: '.cursor/luca/',
});
```

### Manifest Structure

```typescript
// Recommended manifest.json structure
interface LucaManifest {
  version: string;                    // Semver, e.g., "1.0.0"
  installedAt: string;                // ISO timestamp
  updatedAt: string;                  // ISO timestamp
  
  branding: {
    frameworkName: string;            // e.g., "Luca"
    commandPrefix: string;            // e.g., "lu"
    ticketPattern: string;            // e.g., "[A-Z]+-\\d+"
    placeholderTicket: string;        // e.g., "PROJ-0000"
  };
  
  stack: string;                      // e.g., "react-ts"
  workTracker: string;                // e.g., "jira", "github", "none"
  
  files: {
    [path: string]: {
      originalHash: string;           // SHA-256 at install
      source: 'framework' | 'user';   // Who created it
    };
  };
}

// Example
const manifest: LucaManifest = {
  version: '1.0.0',
  installedAt: '2026-02-04T12:00:00Z',
  updatedAt: '2026-02-04T12:00:00Z',
  branding: {
    frameworkName: 'Luca',
    commandPrefix: 'lu',
    ticketPattern: '[A-Z]+-\\d+',
    placeholderTicket: 'PROJ-0000',
  },
  stack: 'react-ts',
  workTracker: 'jira',
  files: {
    '.cursor/luca/workflows/execute-phase.md': {
      originalHash: 'sha256-abc123...',
      source: 'framework',
    },
    '.cursor/agents/custom-agent.md': {
      originalHash: 'sha256-def456...',
      source: 'user',
    },
  },
};
```

### File Detection Utilities

```typescript
import { existsSync } from 'fs';
import { readPackageJSON } from 'pkg-types';

async function detectProjectContext() {
  const context = {
    hasPackageJson: false,
    hasGit: false,
    detectedStack: null as string | null,
    hasTsConfig: false,
  };

  // Check for package.json
  try {
    const pkg = await readPackageJSON();
    context.hasPackageJson = true;
    
    // Detect stack from dependencies
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps['react'] || deps['@types/react']) {
      context.detectedStack = 'react';
    }
    if (deps['typescript'] || existsSync('tsconfig.json')) {
      context.hasTsConfig = true;
    }
  } catch {
    // No package.json
  }

  // Check for git
  context.hasGit = existsSync('.git');

  return context;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| inquirer prompts | @clack/prompts | 2023 | Better UX, smaller bundle |
| commander CLI | citty | 2023 | UnJS ecosystem alignment |
| git clone templates | giget | 2022 | Faster, offline support |
| chalk for colors | consola | Built-in | Simpler, consistent |

**Deprecated/outdated:**
- **inquirer**: Works but @clack/prompts is preferred for modern CLIs
- **commander/yargs**: Still valid but citty is preferred for UnJS projects
- **degit**: giget is the UnJS equivalent with better integration

## Open Questions

Things that couldn't be fully resolved:

1. **Template Storage Location**
   - What we know: giget can pull from npm or GitHub
   - What's unclear: Whether to embed templates in package or pull from GitHub
   - Recommendation: Embed in `luca-framework` package for offline support, simplicity

2. **Update Conflict UI**
   - What we know: Need to handle user-modified files
   - What's unclear: Best UX for presenting conflicts
   - Recommendation: Write to `.cursor/luca/conflicts/`, prompt user to review

3. **Bun vs npm Compatibility**
   - What we know: Project uses Bun, but users may use npm
   - What's unclear: Whether shebang should specify node or bun
   - Recommendation: Use `#!/usr/bin/env node` for compatibility, works with both

## Sources

### Primary (HIGH confidence)
- citty npm package and UnJS documentation - CLI patterns, defineCommand API
- @clack/prompts npm package - Interactive prompt API, spinner patterns
- consola UnJS documentation - Logging API, box output
- giget UnJS documentation - Template extraction patterns
- npm CLI documentation - npm create convention, initializer naming

### Secondary (MEDIUM confidence)
- Alex Chan blog post on npm create packages - Verified structure patterns
- create-vite/create-next-app patterns - Dual-package architecture reference
- Nx generateFiles documentation - Template variable substitution patterns

### Tertiary (LOW confidence)
- None - all key findings verified with primary/secondary sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries from UnJS ecosystem, well-documented
- Architecture: HIGH - npm create pattern is well-established, verified
- Pitfalls: MEDIUM - Based on documented issues and common problems
- Template substitution: MEDIUM - EJS is common but no single standard

**Research date:** 2026-02-04
**Valid until:** 2026-03-04 (30 days - stable ecosystem)
