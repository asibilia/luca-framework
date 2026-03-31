#!/usr/bin/env bun

/**
 * Build-time lint check: verify no compiled skill templates contain
 * statusline side-effect commands (write-status, clear-status) or
 * redundant state commands (luca-bridge snapshot).
 *
 * These side-effects are now handled by deterministic hooks:
 * - write-status / clear-status: handled by skill-status-enter / skill-status-exit
 * - luca-bridge snapshot: handled by the snapshot-sync PostToolUse hook (120s throttle)
 *
 * None of these must appear in skill templates where LLM compliance would be required.
 *
 * Exit 0: no violations found
 * Exit 1: violations found (prints file paths and line numbers)
 */

import { glob } from "glob";
import path from "path";
import { resolvePackageRoot } from "../src/shared/__helpers/resolve-package-root";

const FORBIDDEN_PATTERNS = [
  // Status bus (handled by skill-status-enter / skill-status-exit hooks)
  "write-status",
  "clear-status",
  // Snapshot (handled by snapshot-sync PostToolUse hook, 120s throttle)
  "luca-bridge snapshot",
] as const;

// NOTE: luca-bridge transition, set-field, ensure-init, and context-cli
// calls are NOT flagged here. The 17 remaining instances in templates are
// intentionally kept — they carry dynamic data, are conditional on LLM
// decisions, or fire after inline work (not after agents). See Phase 251
// "intentional-keeps" in ROADMAP.md for the full list.

interface Violation {
  file: string;
  line: number;
  content: string;
  pattern: string;
}

async function main(): Promise<void> {
  const projectDir = resolvePackageRoot();
  const skillGlob = path.join(projectDir, "src/skills/**/*.skill.ts");

  const files = await glob(skillGlob);

  const violations: Violation[] = [];

  for (const file of files) {
    const bunFile = Bun.file(file);
    const content = await bunFile.text();
    const lines = content.split("\n");

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx] ?? "";
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (line.includes(pattern)) {
          violations.push({
            file: path.relative(projectDir, file),
            line: lineIdx + 1,
            content: line.trim(),
            pattern,
          });
        }
      }
    }
  }

  if (violations.length === 0) {
    console.log("No statusline or snapshot side-effects in skill templates.");
    process.exit(0);
  }

  console.error(
    `\nStatusline side-effect violations found: ${violations.length}\n`,
  );
  console.error("Skills must not contain LLM-dependent side-effect commands.");
  console.error(
    "These are handled by deterministic hooks (skill-status-enter/exit, agent-transition-sync, snapshot-sync).\n",
  );

  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.pattern}]  ${v.content}`);
  }

  console.error(
    "\nFix: Remove side-effect commands from skill templates — hooks handle these deterministically.",
  );
  process.exit(1);
}

main().catch((error) => {
  console.error("Template side-effect check failed:", error.message || error);
  process.exit(1);
});
