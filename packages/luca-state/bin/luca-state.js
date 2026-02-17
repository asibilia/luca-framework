#!/usr/bin/env bun
/**
 * CLI entry point for the luca-state package.
 *
 * Directly runs the bridge subcommand router so that `import.meta.main`
 * checks inside bridge.ts are not needed when invoked via this binary.
 *
 * This is the binary registered in package.json as "luca-state".
 *
 * Usage:
 *   luca-state read-status
 *   luca-state read-complexity
 *   luca-state transition --event=START
 *   luca-state ensure-init
 */
import {
  handleReadComplexity,
  handleReadOversight,
  handleReadPhase,
  handleReadStatus,
  handleReadField,
  handleSetField,
  handleTransition,
  handleSnapshot,
  handleEnsureInit,
  handleGateCheck,
  handleSuspend,
  handleResumePhase,
} from "../src/bridge.ts";

const subcommand = Bun.argv[2];
const args = Bun.argv.slice(3);

async function run() {
  switch (subcommand) {
    case "read-complexity":
      await handleReadComplexity();
      break;
    case "read-oversight":
      await handleReadOversight();
      break;
    case "read-phase":
      await handleReadPhase();
      break;
    case "read-status":
      await handleReadStatus();
      break;
    case "read-field":
      await handleReadField(args);
      break;
    case "set-field":
      await handleSetField(args);
      break;
    case "transition":
      await handleTransition(args);
      break;
    case "snapshot":
      await handleSnapshot();
      break;
    case "ensure-init":
      await handleEnsureInit(args);
      break;
    case "gate-check":
      await handleGateCheck(args);
      break;
    case "suspend":
      await handleSuspend(args);
      break;
    case "resume-phase":
      await handleResumePhase(args);
      break;
    default:
      console.error(`Usage: luca-state <subcommand> [options]

Subcommands:
  read-complexity, read-oversight, read-phase, read-status,
  read-field, set-field, transition, snapshot, ensure-init, gate-check,
  suspend, resume-phase

Run "luca-state <subcommand> --help" for details.`);
      process.exit(2);
  }
}

run().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : String(err));
  process.exit(2);
});
