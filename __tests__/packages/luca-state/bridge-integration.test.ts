import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { unlinkSync, mkdirSync } from "node:fs";
import { $ } from "bun";

// ─── Test Helpers ───────────────────────────────────────────────────────────

const STATE_FILE = ".planning/state.json";
const STATE_MD = ".planning/STATE.md";
const BRIDGE = "packages/luca-framework/src/state/bridge.ts";
const CLI = "packages/luca-framework/src/state/cli.ts";

/**
 * Clean up state files between tests.
 */
function cleanupStateFiles() {
  for (const file of [STATE_FILE, STATE_MD]) {
    try {
      unlinkSync(file);
    } catch {
      // File may not exist -- ignore
    }
  }
}

/**
 * Ensure the .planning directory exists for tests.
 */
function ensurePlanningDir() {
  try {
    mkdirSync(".planning", { recursive: true });
  } catch {
    // Directory may already exist -- ignore
  }
}

/**
 * Run a bridge CLI subcommand and return parsed result.
 */
async function runBridge(
  ...args: string[]
): Promise<{ exitCode: number; stdout: string; stderr: string; json?: any }> {
  const result = await $`bun run ${BRIDGE} ${args}`.quiet().nothrow();
  const stdout = result.stdout.toString().trim();
  const stderr = result.stderr.toString().trim();
  let json: any;
  try {
    json = JSON.parse(stdout);
  } catch {
    // stdout may not be JSON
  }
  return { exitCode: result.exitCode, stdout, stderr, json };
}

/**
 * Run a low-level CLI subcommand and return parsed result.
 */
async function runCli(
  ...args: string[]
): Promise<{ exitCode: number; stdout: string; stderr: string; json?: any }> {
  const result = await $`bun run ${CLI} ${args}`.quiet().nothrow();
  const stdout = result.stdout.toString().trim();
  const stderr = result.stderr.toString().trim();
  let json: any;
  try {
    json = JSON.parse(stdout);
  } catch {
    // stdout may not be JSON
  }
  return { exitCode: result.exitCode, stdout, stderr, json };
}

beforeEach(() => {
  ensurePlanningDir();
  cleanupStateFiles();
});

afterEach(() => {
  cleanupStateFiles();
});

// ─── Bridge + CLI Interop ───────────────────────────────────────────────────

describe("bridge and CLI interop", () => {
  test("bridge ensure-init creates state that CLI can read", async () => {
    // Initialize via bridge
    const initResult = await runBridge("ensure-init");
    expect(initResult.exitCode).toBe(0);
    expect(initResult.json.initialized).toBe(true);

    // Read via low-level CLI
    const getResult = await runCli("get");
    expect(getResult.exitCode).toBe(0);
    expect(getResult.json.state).toBe("idle");
    expect(getResult.json.context.session_id).toBeDefined();
  });

  test("CLI init creates state that bridge can read", async () => {
    // Initialize via CLI
    await runCli("init");

    // Read via bridge
    const complexityResult = await runBridge("read-complexity");
    expect(complexityResult.exitCode).toBe(0);
    expect(complexityResult.json.complexity).toBe("TRIVIAL");
    expect(complexityResult.json.initialized).toBe(true);

    const oversightResult = await runBridge("read-oversight");
    expect(oversightResult.exitCode).toBe(0);
    expect(oversightResult.json.initialized).toBe(true);
  });

  test("bridge transition updates state that CLI status reads", async () => {
    // Initialize via CLI
    await runCli("init");

    // Transition via bridge
    const transResult = await runBridge("transition", "--event=START");
    expect(transResult.exitCode).toBe(0);
    expect(transResult.json.current_state).toBe("preflight");

    // Verify via CLI status
    const statusResult = await runCli("status");
    expect(statusResult.exitCode).toBe(0);
    expect(statusResult.json.state).toBe("preflight");
    expect(statusResult.json.allowed_events).toContain("PREFLIGHT_COMPLETE");
  });
});

// ─── Bridge Transition + Snapshot Integration ───────────────────────────────

describe("bridge transition + snapshot integration", () => {
  test("transition generates STATE.md with correct state", async () => {
    await runCli("init");
    await runBridge("transition", "--event=START");

    const content = await Bun.file(STATE_MD).text();
    expect(content).toContain("# Project State");
    expect(content).toContain("Pre-flight");
    expect(content).toContain("## Session Identity");
    expect(content).toContain("## Progress");
  });

  test("successive transitions update STATE.md correctly", async () => {
    await runCli("init");

    // First transition: idle -> preflight
    await runBridge("transition", "--event=START");
    let content = await Bun.file(STATE_MD).text();
    expect(content).toContain("Pre-flight");

    // Second transition: preflight -> routing
    await runBridge(
      "transition",
      "--event=PREFLIGHT_COMPLETE",
      '--data={"intuition_flags":["RISK"]}',
    );
    content = await Bun.file(STATE_MD).text();
    expect(content).toContain("Routing");
    expect(content).toContain("RISK");
  });

  test("STATE.md preserves sections across multiple transitions", async () => {
    // Write initial STATE.md with preservable content
    await Bun.write(
      STATE_MD,
      `# Project State

## Current Position

Old.

## Previous Milestones

### v1.0.0 -- First Release

First release content.

## Pending Todos

- Build the thing
- Test the thing

## Next Actions

1. Do step one
2. Do step two
`,
    );

    await runCli("init");

    // First transition
    await runBridge("transition", "--event=START");
    let content = await Bun.file(STATE_MD).text();

    // Preserved sections should still be there
    expect(content).toContain("## Previous Milestones");
    expect(content).toContain("### v1.0.0 -- First Release");
    expect(content).toContain("## Pending Todos");
    expect(content).toContain("Build the thing");
    expect(content).toContain("## Next Actions");
    expect(content).toContain("Do step one");

    // Second transition -- sections should still survive
    await runBridge(
      "transition",
      "--event=PREFLIGHT_COMPLETE",
      '--data={"intuition_flags":[]}',
    );
    content = await Bun.file(STATE_MD).text();

    expect(content).toContain("## Previous Milestones");
    expect(content).toContain("First release content.");
    expect(content).toContain("## Pending Todos");
    expect(content).toContain("Test the thing");
  });

  test("snapshot command generates same content as transition", async () => {
    await runCli("init");
    await runCli("send", "--event=START");

    // Generate snapshot via bridge
    const { exitCode } = await runBridge("snapshot");
    expect(exitCode).toBe(0);

    const content = await Bun.file(STATE_MD).text();
    expect(content).toContain("# Project State");
    expect(content).toContain("Pre-flight");
    expect(content).toContain("## Session Identity");
    expect(content).toContain("## Allowed Events");
    expect(content).toContain("`PREFLIGHT_COMPLETE`");
    expect(content).toContain("`SKIP`");
  });
});

// ─── CLI snapshot subcommand ────────────────────────────────────────────────

describe("CLI snapshot subcommand", () => {
  test("generates STATE.md via CLI snapshot", async () => {
    await runCli("init");
    await runCli("send", "--event=START");

    const { exitCode, json } = await runCli("snapshot");
    expect(exitCode).toBe(0);
    expect(json.snapshot_written).toBe(true);
    expect(json.path).toBe(".planning/STATE.md");

    const content = await Bun.file(STATE_MD).text();
    expect(content).toContain("# Project State");
    expect(content).toContain("Pre-flight");
  });

  test("CLI snapshot errors when no state exists", async () => {
    const { exitCode, stderr } = await runCli("snapshot");
    expect(exitCode).toBe(2);
    expect(stderr).toContain("not found");
  });
});

// ─── Full Workflow Sequence ─────────────────────────────────────────────────

describe("full workflow sequence", () => {
  test("ensure-init -> read commands -> transition -> snapshot", async () => {
    // Step 1: ensure-init
    const initResult = await runBridge("ensure-init");
    expect(initResult.exitCode).toBe(0);
    expect(initResult.json.initialized).toBe(true);

    // Step 2: read-complexity (should be TRIVIAL)
    const complexityResult = await runBridge("read-complexity");
    expect(complexityResult.json.complexity).toBe("TRIVIAL");

    // Step 3: read-oversight
    const oversightResult = await runBridge("read-oversight");
    expect(oversightResult.json.oversight).toBeDefined();

    // Step 4: read-phase
    const phaseResult = await runBridge("read-phase");
    expect(phaseResult.json.current_phase).toBeNull();

    // Step 5: gate-check
    const gateResult = await runBridge("gate-check", "--gate=confirm_plan");
    expect(gateResult.exitCode).toBe(0);

    // Step 6: transition START
    const transResult = await runBridge("transition", "--event=START");
    expect(transResult.exitCode).toBe(0);
    expect(transResult.json.current_state).toBe("preflight");

    // Step 7: verify STATE.md exists
    expect(await Bun.file(STATE_MD).exists()).toBe(true);

    // Step 8: read-field should reflect new state
    const fieldResult = await runBridge("read-field", "--field=started_at");
    expect(fieldResult.exitCode).toBe(0);
    expect(fieldResult.json.value).toBeDefined();

    // Step 9: snapshot regenerates STATE.md
    const snapshotResult = await runBridge("snapshot");
    expect(snapshotResult.exitCode).toBe(0);

    const content = await Bun.file(STATE_MD).text();
    expect(content).toContain("Pre-flight");
  });
});
