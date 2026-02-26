#!/usr/bin/env bun
/**
 * Copy compiled .claude/ assets to dist/plugin/ for --plugin-dir distribution.
 *
 * This script copies the compiled Claude assets (rules, skills, agents, hooks,
 * settings.json) from the project root .claude/ directory into the package's
 * dist/plugin/ directory. This enables `luca run:claude` to pass the plugin
 * directory to Claude Code via --plugin-dir.
 *
 * Usage: bun run packages/luca-framework/scripts/copy-plugin.ts
 */
import { cpSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dir, "..", "..", "..");
const pluginDest = resolve(import.meta.dir, "..", "dist", "plugin");

// Source: compiled Claude assets from project root
const claudeSource = resolve(projectRoot, ".claude");

if (!existsSync(claudeSource)) {
  console.error(
    `Source directory not found: ${claudeSource}\nRun 'bun run build:all' first to generate .claude/ assets.`,
  );
  process.exit(1);
}

// Ensure dist/plugin exists
mkdirSync(pluginDest, { recursive: true });

// Copy relevant directories
const assetDirs = ["rules", "skills", "agents", "hooks"];

for (const dir of assetDirs) {
  const src = resolve(claudeSource, dir);
  const dest = resolve(pluginDest, dir);
  if (existsSync(src)) {
    cpSync(src, dest, { recursive: true });
    console.log(`Copied ${dir}/ -> dist/plugin/${dir}/`);
  } else {
    console.log(`Skipped ${dir}/ (not found)`);
  }
}

// Copy settings.json if it exists
const settingsFile = resolve(claudeSource, "settings.json");
if (existsSync(settingsFile)) {
  cpSync(settingsFile, resolve(pluginDest, "settings.json"));
  console.log("Copied settings.json -> dist/plugin/settings.json");
}

console.log("Plugin distribution assets ready.");
