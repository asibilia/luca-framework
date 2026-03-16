#!/usr/bin/env bun
/**
 * Copy compiled harness outputs to templates/harness/ for npm distribution.
 *
 * Copies the compiled Claude Code assets (.claude/) from the project root
 * into the package's templates/harness/ directory. This enables
 * `luca init --harness=claude` to scaffold from pre-built templates
 * without requiring the full monorepo build pipeline.
 *
 * Usage: bun run scripts/copy-harness-templates.ts
 */
import { cpSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dir, "..");
const templatesDest = resolve(
  projectRoot,
  "packages",
  "luca-framework",
  "templates",
  "harness",
);

// Clean previous output to avoid stale files
if (existsSync(templatesDest)) {
  rmSync(templatesDest, { recursive: true, force: true });
}

mkdirSync(templatesDest, { recursive: true });

// Harness definitions: source dir, subdirectories to copy, extra files
const harnesses = [
  {
    id: "claude",
    source: resolve(projectRoot, ".claude"),
    dirs: ["agents", "rules", "skills", "hooks"],
    files: ["settings.json"],
  },
];

let totalCopied = 0;

for (const harness of harnesses) {
  if (!existsSync(harness.source)) {
    console.log(
      `Skipped ${harness.id}/ (source not found — run 'bun run build:all' first)`,
    );
    continue;
  }

  const dest = resolve(templatesDest, harness.id);
  mkdirSync(dest, { recursive: true });

  // Copy asset directories
  for (const dir of harness.dirs) {
    const src = resolve(harness.source, dir);
    const dirDest = resolve(dest, dir);
    if (existsSync(src)) {
      cpSync(src, dirDest, { recursive: true });
      console.log(`  ${harness.id}/${dir}/ copied`);
      totalCopied++;
    }
  }

  // Copy individual files
  for (const file of harness.files) {
    const src = resolve(harness.source, file);
    if (existsSync(src)) {
      cpSync(src, resolve(dest, file));
      console.log(`  ${harness.id}/${file} copied`);
      totalCopied++;
    }
  }
}

console.log(
  `\nHarness templates ready: ${totalCopied} assets → templates/harness/`,
);
