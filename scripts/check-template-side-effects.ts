#!/usr/bin/env bun

/**
 * Build-time lint check: verify no compiled skill templates contain
 * statusline side-effect commands (write-status, clear-status).
 *
 * These side-effects are now handled by deterministic hooks
 * (skill-status-enter, skill-status-exit) and must not appear in
 * skill templates where LLM compliance would be required.
 *
 * Exit 0: no violations found
 * Exit 1: violations found (prints file paths and line numbers)
 */

import { glob } from "glob";
import path from "path";
import { resolvePackageRoot } from "../src/shared/__helpers/resolve-package-root";

const FORBIDDEN_PATTERNS = ["write-status", "clear-status"] as const;

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
    console.log("No statusline side-effects in skill templates.");
    process.exit(0);
  }

  console.error(
    `\nStatusline side-effect violations found: ${violations.length}\n`,
  );
  console.error(
    "Skills must not call write-status or clear-status directly.",
  );
  console.error(
    "These are handled by deterministic hooks (skill-status-enter, skill-status-exit).\n",
  );

  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.pattern}]  ${v.content}`);
  }

  console.error(
    "\nFix: Remove write-status/clear-status calls from skill templates.",
  );
  process.exit(1);
}

main().catch((error) => {
  console.error("Template side-effect check failed:", error.message || error);
  process.exit(1);
});
