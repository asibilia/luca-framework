/**
 * Use Bun package manager and runtime over npm or yarn where applicable
 */
import { createRule } from "~/rules/__helpers/create-rule";
import type { RuleConfig } from "~/rules/__schemas/rule.schemas";

// Define the bun-preference rule configuration
const bunPreferenceConfig: RuleConfig = {
  frontmatter: {
    description: `Use Bun package manager and runtime over npm or yarn where applicable`,
    globs: ["package.json", "*.sh", "*.ts", "*.js", "*.md"],
    alwaysApply: true,
  },
  sections: [
    {
      title: "rule",
      content: `# Bun Package Manager Preference

This project uses **Bun** as the primary package manager and JavaScript runtime. Always prefer Bun commands over npm or yarn equivalents.

## **Why Bun?**

- **Performance**: Significantly faster package installation and script execution
- **Built-in Tools**: Includes bundler, test runner, and package manager in one tool
- **TypeScript Support**: Native TypeScript execution without compilation step
- **Project Standard**: This codebase is configured for Bun (see \`bun.lock\` and \`bunfig.toml\`)

## **Command Mappings**

### **Package Management**

\`\`\`bash
# ✅ DO: Use Bun commands
bun install                 # Install dependencies
bun add <package>          # Add dependency
bun add -d <package>       # Add dev dependency
bun remove <package>       # Remove dependency
bun update                 # Update dependencies

# ❌ DON'T: Use npm/yarn equivalents
npm install
yarn install
npm install <package>
yarn add <package>
\`\`\`

### **Script Execution**

\`\`\`bash
# ✅ DO: Use Bun for script execution
bun run dev                # Run development server
bun run build             # Build project
bun run test              # Run tests
bun <script.ts>           # Execute TypeScript directly

# ❌ DON'T: Use npm/yarn for scripts
npm run dev
yarn dev
npx <command>
\`\`\`

### **Testing**

\`\`\`bash
# ✅ DO: Use Bun's built-in test runner
bun test                  # Run all tests
bun test <file>           # Run specific test file
bun test --watch          # Watch mode

# ❌ DON'T: Use separate test runners when Bun can handle it
npm test
yarn test
jest
\`\`\`

## **When to Use Bun**

- **Package Installation**: Always use \`bun install\` instead of \`npm install\`
- **Running Scripts**: Use \`bun run <script>\` for package.json scripts
- **TypeScript Execution**: Use \`bun <file.ts>\` for direct TypeScript execution
- **Testing**: Use \`bun test\` for test execution (see [bun-test-setup.ts](mdc:scripts/bun-test-setup.ts))
- **Build Tools**: Prefer Bun's built-in bundler when applicable

## **Project Configuration**

This project is configured for Bun:

- **Lock File**: Uses \`bun.lock\` instead of \`package-lock.json\` or \`yarn.lock\`
- **Configuration**: [\`bunfig.toml\`](mdc:bunfig.toml) for Bun-specific settings
- **Scripts**: Package scripts in [\`packages-dev/bun-scripts/\`](mdc:packages-dev/bun-scripts/)
- **Test Setup**: Custom test setup in [\`scripts/bun-test-setup.ts\`](mdc:scripts/bun-test-setup.ts)

## **Examples**

### **Adding Dependencies**

\`\`\`bash
# ✅ DO: Use Bun
bun add react @types/react
bun add -d typescript

# ❌ DON'T: Use npm/yarn
npm install react @types/react
yarn add react @types/react
\`\`\`

### **Running Development**

\`\`\`bash
# ✅ DO: Use Bun
bun run dev
bun run start

# ❌ DON'T: Use npm/yarn
npm run dev
yarn dev
\`\`\`

### **Direct Script Execution**

\`\`\`bash
# ✅ DO: Use Bun for TypeScript
bun scripts/analyze-dependencies.ts
bun packages-dev/generate-env/generate-env.ts

# ❌ DON'T: Compile first or use ts-node
npx ts-node scripts/analyze-dependencies.ts
\`\`\`

## **Documentation & Comments**

When writing documentation or comments that reference package management:

\`\`\`markdown
# ✅ DO: Reference Bun commands

Install dependencies: \`bun install\`
Run tests: \`bun test\`

# ❌ DON'T: Reference npm/yarn

Install dependencies: \`npm install\`
Run tests: \`npm test\`
\`\`\`

## **CI/CD & Scripts**

In shell scripts and CI/CD configurations:

\`\`\`bash
# ✅ DO: Use Bun
#!/bin/bash
bun install
bun run build
bun test

# ❌ DON'T: Default to npm
npm ci
npm run build
\`\`\`

## **Exceptions**

Use npm/yarn only when:

- **Third-party tooling** explicitly requires npm/yarn
- **Legacy scripts** that haven't been migrated yet
- **External documentation** specifically references npm/yarn commands
- **Bun compatibility issues** (rare, but document the reason)

When exceptions are necessary, document why:

\`\`\`bash
# Using npm because tool X requires npm-specific features
npm run legacy-script
\`\`\`

## **Bun APIs**

Prefer Bun built-in APIs over third-party equivalents:

- \\\`Bun.serve()\\\` supports WebSockets, HTTPS, and routes. Don't use \\\`express\\\`.
- \\\`bun:sqlite\\\` for SQLite. Don't use \\\`better-sqlite3\\\`.
- \\\`Bun.redis\\\` for Redis. Don't use \\\`ioredis\\\`.
- \\\`Bun.sql\\\` for Postgres. Don't use \\\`pg\\\` or \\\`postgres.js\\\`.
- \\\`WebSocket\\\` is built-in. Don't use \\\`ws\\\`.
- Prefer \\\`Bun.file\\\` over \\\`node:fs\\\`'s readFile/writeFile.
- \\\`Bun.$\\\\\\\`ls\\\\\\\`\\\` instead of execa.
- Bun automatically loads .env, so don't use dotenv.

## **Migration Guidelines**

When updating existing scripts or documentation:

1. **Replace npm/yarn commands** with Bun equivalents
2. **Update documentation** to reference Bun commands
3. **Test thoroughly** to ensure Bun compatibility
4. **Update package.json scripts** to assume Bun execution context

Follow [percent-ui.mdc](mdc:.cursor/rules/percent-ui.mdc) for general coding standards.`,
      order: 1,
    },
  ],
};

export const bunPreferenceRule = createRule(bunPreferenceConfig);
