/**
 * pre-commit-drift-check — Block commits when output files drift from source.
 *
 * Intercepts all Bash tool calls. For non-commit commands, exits 0 immediately.
 * For commit commands that touch generated output files or their source,
 * runs the drift check and blocks if drift is detected.
 *
 * Exit 0 = allow, Exit 2 = block.
 *
 * @module pre-commit-drift-check
 */

import { existsSync } from "fs";

import {
  guardDedup,
  readStdinJson,
  extractCommand,
  exitBlock,
  exitSuccess,
  projectDir,
} from "./__helpers/hook-io.ts";

// ─── Dedup guard ─────────────────────────────────────────────────────────────
guardDedup("pre-commit-drift-check");

// ─── Commit Pattern Matching ─────────────────────────────────────────────────

const isCommitCommand = (cmd: string): boolean => {
  const patterns = [
    "git commit",
    "git merge",
    "bun run commit",
    "bunx commit",
    "bunx --bun commit",
  ];
  return patterns.some((p) => cmd.includes(p));
};

// ─── Relevant Path Prefixes ─────────────────────────────────────────────────

const relevantPrefixes = [
  ".claude/",
  "dist/plugin/",
  "src/agents/",
  "src/skills/",
  "src/rules/",
  "src/hooks/",
  "src/compilers/",
];

// ─── Main ────────────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  const data = await readStdinJson();
  const command = extractCommand(data);

  // Fast exit: Not a commit command? Allow immediately.
  if (!command || !isCommitCommand(command)) {
    return exitSuccess();
  }

  const pd = projectDir();

  // Get staged files
  const stagedResult = Bun.spawnSync(
    ["git", "diff", "--cached", "--name-only"],
    { stdout: "pipe", stderr: "pipe", cwd: pd },
  );
  const stagedFiles = stagedResult.stdout.toString().trim();

  if (!stagedFiles) {
    return exitSuccess();
  }

  // Check if any staged files are in relevant directories
  const hasRelevant = stagedFiles
    .split("\n")
    .some((file) => relevantPrefixes.some((prefix) => file.startsWith(prefix)));

  if (!hasRelevant) {
    return exitSuccess();
  }

  // Run drift check
  process.stderr.write("Checking for output drift...\n");

  const driftResult = Bun.spawnSync(
    ["bun", "run", "./scripts/check-drift.ts"],
    {
      stdout: "pipe",
      stderr: "pipe",
      cwd: pd,
      env: {
        ...process.env,
        PATH: `${pd}/node_modules/.bin:${process.env.PATH}`,
      },
    },
  );

  if (driftResult.exitCode !== 0) {
    const output = (
      driftResult.stdout.toString() + driftResult.stderr.toString()
    ).trim();
    const reason = `Commit blocked: output files have drifted from source.\n\n${output}\n\nFix: Run \`bun run build:all\` to regenerate outputs, then commit again.`;
    return exitBlock(reason);
  }

  // No drift — allow the commit
  return exitSuccess();
};

await main();
