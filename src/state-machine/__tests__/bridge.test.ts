import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { unlinkSync, mkdirSync } from "node:fs";
import { $ } from "bun";

// ─── Test Helpers ───────────────────────────────────────────────────────────

const STATE_FILE = ".planning/state.json";
const STATE_MD = ".planning/STATE.md";
const BRIDGE = "packages/luca-state/src/bridge.ts";
const CLI = "packages/luca-state/src/cli.ts";

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
 * Initialize state via the low-level CLI (not the bridge).
 */
async function initState() {
  await $`bun run ${CLI} init --force`.quiet().nothrow();
}

/**
 * Initialize state and advance to preflight.
 */
async function initAndStart() {
  await initState();
  await $`bun run ${CLI} send --event=START`.quiet().nothrow();
}

beforeEach(() => {
  ensurePlanningDir();
  cleanupStateFiles();
});

afterEach(() => {
  cleanupStateFiles();
});

// ─── read-complexity ────────────────────────────────────────────────────────

describe("bridge read-complexity", () => {
  test("returns TRIVIAL when state not initialized", async () => {
    const { exitCode, json } = await runBridge("read-complexity");
    expect(exitCode).toBe(0);
    expect(json.complexity).toBe("TRIVIAL");
    expect(json.initialized).toBe(false);
  });

  test("returns current complexity when initialized", async () => {
    await initState();
    const { exitCode, json } = await runBridge("read-complexity");
    expect(exitCode).toBe(0);
    expect(json.complexity).toBe("TRIVIAL");
    expect(json.initialized).toBe(true);
  });
});

// ─── read-oversight ─────────────────────────────────────────────────────────

describe("bridge read-oversight", () => {
  test("returns milestone when state not initialized", async () => {
    const { exitCode, json } = await runBridge("read-oversight");
    expect(exitCode).toBe(0);
    expect(json.oversight).toBe("milestone");
    expect(json.initialized).toBe(false);
  });

  test("returns current oversight when initialized", async () => {
    await initState();
    const { exitCode, json } = await runBridge("read-oversight");
    expect(exitCode).toBe(0);
    expect(json.initialized).toBe(true);
    // Default oversight from config
    expect(json.oversight).toBeDefined();
  });
});

// ─── read-phase ─────────────────────────────────────────────────────────────

describe("bridge read-phase", () => {
  test("returns null defaults when state not initialized", async () => {
    const { exitCode, json } = await runBridge("read-phase");
    expect(exitCode).toBe(0);
    expect(json.current_phase).toBeNull();
    expect(json.current_milestone).toBeNull();
    expect(json.current_plan_ids).toEqual([]);
    expect(json.current_wave_count).toBe(0);
    expect(json.initialized).toBe(false);
  });

  test("returns phase info when initialized", async () => {
    await initState();
    const { exitCode, json } = await runBridge("read-phase");
    expect(exitCode).toBe(0);
    expect(json.initialized).toBe(true);
    expect(json.current_plan_ids).toEqual([]);
    expect(json.current_wave_count).toBe(0);
  });
});

// ─── read-field ─────────────────────────────────────────────────────────────

describe("bridge read-field", () => {
  test("returns a specific field value", async () => {
    await initState();
    const { exitCode, json } = await runBridge(
      "read-field",
      "--field=session_id",
    );
    expect(exitCode).toBe(0);
    expect(json.field).toBe("session_id");
    expect(json.value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  test("returns complexity field", async () => {
    await initState();
    const { exitCode, json } = await runBridge(
      "read-field",
      "--field=complexity",
    );
    expect(exitCode).toBe(0);
    expect(json.field).toBe("complexity");
    expect(json.value).toBe("TRIVIAL");
  });

  test("errors on missing --field argument", async () => {
    await initState();
    const { exitCode, stderr } = await runBridge("read-field");
    expect(exitCode).toBe(2);
    expect(stderr).toContain("Missing --field");
  });

  test("errors when state not initialized", async () => {
    const { exitCode, stderr } = await runBridge(
      "read-field",
      "--field=session_id",
    );
    expect(exitCode).toBe(2);
    expect(stderr).toContain("not found");
  });
});

// ─── ensure-init ────────────────────────────────────────────────────────────

describe("bridge ensure-init", () => {
  test("initializes state when not present", async () => {
    const { exitCode, json } = await runBridge("ensure-init");
    expect(exitCode).toBe(0);
    expect(json.initialized).toBe(true);
    expect(json.already_existed).toBe(false);
    expect(json.state).toBe("idle");
    expect(json.session_id).toBeDefined();
  });

  test("returns existing state without error when already initialized", async () => {
    // Initialize first
    await initState();

    // Call ensure-init -- should succeed without overwriting
    const { exitCode, json } = await runBridge("ensure-init");
    expect(exitCode).toBe(0);
    expect(json.initialized).toBe(true);
    expect(json.already_existed).toBe(true);
    expect(json.state).toBe("idle");
  });

  test("--force overwrites existing state", async () => {
    await initState();
    const firstResult = await runBridge("ensure-init");
    const firstSessionId = firstResult.json.session_id;

    const { exitCode, json } = await runBridge("ensure-init", "--force");
    expect(exitCode).toBe(0);
    expect(json.initialized).toBe(true);
    expect(json.already_existed).toBe(false);
    // New session should have a different session_id
    expect(json.session_id).not.toBe(firstSessionId);
  });
});

// ─── gate-check ─────────────────────────────────────────────────────────────

describe("bridge gate-check", () => {
  test("checks a gate that is enabled", async () => {
    await initState();
    // config.json has confirm_plan: true
    const { exitCode, json } = await runBridge(
      "gate-check",
      "--gate=confirm_plan",
    );
    expect(exitCode).toBe(0);
    expect(json.gate).toBe("confirm_plan");
    expect(json.enabled).toBe(true);
  });

  test("checks a gate that is disabled/absent", async () => {
    await initState();
    const { exitCode, json } = await runBridge(
      "gate-check",
      "--gate=nonexistent_gate",
    );
    expect(exitCode).toBe(0);
    expect(json.gate).toBe("nonexistent_gate");
    expect(json.enabled).toBe(false);
  });

  test("errors on missing --gate argument", async () => {
    await initState();
    const { exitCode, stderr } = await runBridge("gate-check");
    expect(exitCode).toBe(2);
    expect(stderr).toContain("Missing --gate");
  });

  test("errors when state not initialized", async () => {
    const { exitCode, stderr } = await runBridge(
      "gate-check",
      "--gate=confirm_plan",
    );
    expect(exitCode).toBe(2);
    expect(stderr).toContain("not found");
  });
});

// ─── transition ─────────────────────────────────────────────────────────────

describe("bridge transition", () => {
  test("sends event and returns transition record", async () => {
    await initState();
    const { exitCode, json } = await runBridge(
      "transition",
      "--event=START",
      '--data={"ticket_id":"BRIDGE-1"}',
    );
    expect(exitCode).toBe(0);
    expect(json.previous_state).toBe("idle");
    expect(json.current_state).toBe("preflight");
    expect(json.event_type).toBe("START");
    expect(json.session_id).toBeDefined();
  });

  test("creates STATE.md after transition", async () => {
    await initState();
    await runBridge("transition", "--event=START");

    // Verify STATE.md was created
    const stateFile = Bun.file(STATE_MD);
    expect(await stateFile.exists()).toBe(true);

    const content = await stateFile.text();
    expect(content).toContain("# Project State");
    expect(content).toContain("Pre-flight");
  });

  test("preserves STATE.md sections across transitions", async () => {
    // Write initial STATE.md with a preservable section
    await Bun.write(
      STATE_MD,
      `# Project State

## Current Position

Old position.

## Previous Milestones

### v1.0.0

Important milestone content.

## Session Continuity

Old session.
`,
    );

    await initState();
    await runBridge("transition", "--event=START");

    const content = await Bun.file(STATE_MD).text();
    expect(content).toContain("## Previous Milestones");
    expect(content).toContain("### v1.0.0");
    expect(content).toContain("Important milestone content.");
  });

  test("errors on missing --event argument", async () => {
    await initState();
    const { exitCode, stderr } = await runBridge("transition");
    expect(exitCode).toBe(2);
    expect(stderr).toContain("Missing --event");
  });

  test("errors on invalid event type", async () => {
    await initState();
    const { exitCode, stderr } = await runBridge(
      "transition",
      "--event=INVALID_EVENT",
    );
    expect(exitCode).toBe(2);
    expect(stderr).toContain("Invalid event");
  });

  test("errors on malformed JSON in --data", async () => {
    await initState();
    const { exitCode, stderr } = await runBridge(
      "transition",
      "--event=START",
      "--data={bad json}",
    );
    expect(exitCode).toBe(2);
    expect(stderr).toContain("Invalid JSON");
  });

  test("errors when state not initialized", async () => {
    const { exitCode, stderr } = await runBridge("transition", "--event=START");
    expect(exitCode).toBe(2);
    expect(stderr).toContain("not found");
  });
});

// ─── snapshot ───────────────────────────────────────────────────────────────

describe("bridge snapshot", () => {
  test("generates STATE.md from current state", async () => {
    await initState();
    const { exitCode, json } = await runBridge("snapshot");
    expect(exitCode).toBe(0);
    expect(json.snapshot_written).toBe(true);
    expect(json.path).toBe(".planning/STATE.md");
    expect(json.state).toBe("idle");

    // Verify file was created
    const content = await Bun.file(STATE_MD).text();
    expect(content).toContain("# Project State");
    expect(content).toContain("Idle");
  });

  test("preserves existing sections when generating snapshot", async () => {
    await Bun.write(
      STATE_MD,
      `# Project State

## Pending Todos

- Keep this todo

## Blockers

- Keep this blocker
`,
    );

    await initState();
    const { exitCode } = await runBridge("snapshot");
    expect(exitCode).toBe(0);

    const content = await Bun.file(STATE_MD).text();
    expect(content).toContain("Keep this todo");
    expect(content).toContain("Keep this blocker");
  });

  test("errors when state not initialized", async () => {
    const { exitCode, stderr } = await runBridge("snapshot");
    expect(exitCode).toBe(2);
    expect(stderr).toContain("not found");
  });
});

// ─── read-status ───────────────────────────────────────────────────────────

describe("bridge read-status", () => {
  test("returns defaults when state not initialized", async () => {
    const { exitCode, json } = await runBridge("read-status");
    expect(exitCode).toBe(0);
    expect(json.initialized).toBe(false);
    expect(json.state).toBe("idle");
    expect(json.complexity).toBe("TRIVIAL");
    expect(json.oversight).toBe("milestone");
    expect(json.current_phase).toBeNull();
    expect(json.current_milestone).toBeNull();
    expect(json.session_id).toBeNull();
    expect(json.ticket_id).toBeNull();
    expect(json.github_issue).toBeNull();
    expect(json.branch).toBeNull();
    expect(json.base_branch).toBe("main");
    expect(json.verification_attempts).toBe(0);
    expect(json.phase_results_count).toBe(0);
    expect(json.last_error).toBeNull();
  });

  test("returns comprehensive status when initialized", async () => {
    await initState();
    const { exitCode, json } = await runBridge("read-status");
    expect(exitCode).toBe(0);
    expect(json.initialized).toBe(true);
    expect(json.state).toBe("idle");
    expect(json.complexity).toBeDefined();
    expect(json.oversight).toBeDefined();
    expect(json.session_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(json.base_branch).toBe("main");
  });

  test("reflects state changes after transition", async () => {
    await initState();
    await runBridge("transition", "--event=START");
    const { exitCode, json } = await runBridge("read-status");
    expect(exitCode).toBe(0);
    expect(json.state).toBe("preflight");
  });
});

// ─── set-field ─────────────────────────────────────────────────────────────

describe("bridge set-field", () => {
  test("sets current_milestone field", async () => {
    await initState();
    const { exitCode, json } = await runBridge(
      "set-field",
      "--field=current_milestone",
      "--value=v2.0",
    );
    expect(exitCode).toBe(0);
    expect(json.field).toBe("current_milestone");
    expect(json.value).toBe("v2.0");
    expect(json.previous_value).toBeNull();

    // Verify persistence
    const readResult = await runBridge(
      "read-field",
      "--field=current_milestone",
    );
    expect(readResult.json.value).toBe("v2.0");
  });

  test("sets github_issue field with numeric value", async () => {
    await initState();
    const { exitCode, json } = await runBridge(
      "set-field",
      "--field=github_issue",
      "--value=42",
    );
    expect(exitCode).toBe(0);
    expect(json.field).toBe("github_issue");
    expect(json.value).toBe(42);
  });

  test("sets branch field", async () => {
    await initState();
    const { exitCode, json } = await runBridge(
      "set-field",
      "--field=branch",
      "--value=feat/14-cognitive-architecture",
    );
    expect(exitCode).toBe(0);
    expect(json.field).toBe("branch");
    expect(json.value).toBe("feat/14-cognitive-architecture");
  });

  test("sets complexity field", async () => {
    await initState();
    const { exitCode, json } = await runBridge(
      "set-field",
      "--field=complexity",
      "--value=COMPLEX",
    );
    expect(exitCode).toBe(0);
    expect(json.value).toBe("COMPLEX");

    // Verify via read-complexity
    const readResult = await runBridge("read-complexity");
    expect(readResult.json.complexity).toBe("COMPLEX");
  });

  test("sets array fields (memory_tags)", async () => {
    await initState();
    const { exitCode, json } = await runBridge(
      "set-field",
      "--field=memory_tags",
      '--value=["tag1","tag2"]',
    );
    expect(exitCode).toBe(0);
    expect(json.value).toEqual(["tag1", "tag2"]);
  });

  test("regenerates STATE.md after setting field", async () => {
    await initState();
    await runBridge("set-field", "--field=current_milestone", "--value=v3.0");

    const stateFile = Bun.file(STATE_MD);
    expect(await stateFile.exists()).toBe(true);
    // STATE.md should contain the updated milestone if the snapshot renders it
  });

  test("rejects unknown fields", async () => {
    await initState();
    const { exitCode, stderr } = await runBridge(
      "set-field",
      "--field=nonexistent_field",
      "--value=bad",
    );
    expect(exitCode).toBe(2);
    expect(stderr).toContain("not settable");
  });

  test("errors on missing --field argument", async () => {
    await initState();
    const { exitCode, stderr } = await runBridge(
      "set-field",
      "--value=something",
    );
    expect(exitCode).toBe(2);
    expect(stderr).toContain("Missing --field");
  });

  test("errors on missing --value argument", async () => {
    await initState();
    const { exitCode, stderr } = await runBridge(
      "set-field",
      "--field=current_milestone",
    );
    expect(exitCode).toBe(2);
    expect(stderr).toContain("Missing --value");
  });

  test("errors when state not initialized", async () => {
    const { exitCode, stderr } = await runBridge(
      "set-field",
      "--field=current_milestone",
      "--value=v1.0",
    );
    expect(exitCode).toBe(2);
    expect(stderr).toContain("not found");
  });

  test("returns previous_value when overwriting", async () => {
    await initState();
    await runBridge("set-field", "--field=current_milestone", "--value=v1.0");
    const { json } = await runBridge(
      "set-field",
      "--field=current_milestone",
      "--value=v2.0",
    );
    expect(json.previous_value).toBe("v1.0");
    expect(json.value).toBe("v2.0");
  });
});

// ─── Unknown subcommand ─────────────────────────────────────────────────────

describe("bridge unknown subcommand", () => {
  test("prints usage and exits with code 2", async () => {
    const { exitCode, stderr } = await runBridge("unknown-command");
    expect(exitCode).toBe(2);
    expect(stderr).toContain("Usage");
  });
});
