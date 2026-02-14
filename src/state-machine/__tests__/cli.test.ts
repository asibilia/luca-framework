import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { unlinkSync, mkdirSync } from "node:fs";
import { $ } from "bun";

// ─── Test Helpers ───────────────────────────────────────────────────────────

const STATE_FILE = ".planning/state.json";
const CLI = "src/state-machine/cli.ts";

/**
 * Clean up the state file between tests.
 */
function cleanupStateFile() {
  try {
    unlinkSync(STATE_FILE);
  } catch {
    // File may not exist -- ignore
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
 * Run a CLI subcommand and return parsed result.
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
  cleanupStateFile();
});

afterEach(() => {
  cleanupStateFile();
});

// ─── init ───────────────────────────────────────────────────────────────────

describe("cli init", () => {
  test("creates state.json and outputs initialized: true", async () => {
    const { exitCode, json } = await runCli("init");
    expect(exitCode).toBe(0);
    expect(json.initialized).toBe(true);
    expect(json.state).toBe("idle");
    expect(json.session_id).toBeDefined();

    // Verify file was created
    expect(await Bun.file(STATE_FILE).exists()).toBe(true);
  });

  test("fails without --force when state already exists", async () => {
    // First init
    await runCli("init");

    // Second init without --force should fail
    const { exitCode, stderr } = await runCli("init");
    expect(exitCode).toBe(2);
    expect(stderr).toContain("already exists");
  });

  test("--force overwrites existing state", async () => {
    // First init
    const { json: first } = await runCli("init");
    const firstSessionId = first.session_id;

    // Second init with --force
    const { exitCode, json: second } = await runCli("init", "--force");
    expect(exitCode).toBe(0);
    expect(second.initialized).toBe(true);
    // New session should have different session_id
    expect(second.session_id).not.toBe(firstSessionId);
  });
});

// ─── get ────────────────────────────────────────────────────────────────────

describe("cli get", () => {
  test("returns full state after init", async () => {
    await runCli("init");
    const { exitCode, json } = await runCli("get");
    expect(exitCode).toBe(0);
    expect(json.state).toBe("idle");
    expect(json.context).toBeDefined();
    expect(json.context.session_id).toBeDefined();
  });

  test("--field=session_id returns session UUID", async () => {
    await runCli("init");
    const { exitCode, json } = await runCli("get", "--field=session_id");
    expect(exitCode).toBe(0);
    expect(json.field).toBe("session_id");
    expect(json.value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  test("--field=complexity returns TRIVIAL by default", async () => {
    await runCli("init");
    const { exitCode, json } = await runCli("get", "--field=complexity");
    expect(exitCode).toBe(0);
    expect(json.value).toBe("TRIVIAL");
  });

  test("fails when no state exists", async () => {
    const { exitCode, stderr } = await runCli("get");
    expect(exitCode).toBe(2);
    expect(stderr).toContain("not found");
  });
});

// ─── send ───────────────────────────────────────────────────────────────────

describe("cli send", () => {
  test("START transitions idle to preflight (TransitionRecord format)", async () => {
    await runCli("init");
    const { exitCode, json } = await runCli(
      "send",
      "--event=START",
      '--data={"ticket_id":"TEST-1"}',
    );
    expect(exitCode).toBe(0);
    expect(json.previous_state).toBe("idle");
    expect(json.current_state).toBe("preflight");
    expect(json.event_type).toBe("START");
    expect(json.event_data).toBeDefined();
    expect(json.event_data.ticket_id).toBe("TEST-1");
    expect(json.session_id).toBeDefined();
    expect(json.timestamp).toBeDefined();
    expect(json.context).toBeDefined();
    expect(json.context.session_id).toBeDefined();
  });

  test("fails with invalid event type", async () => {
    await runCli("init");
    const { exitCode, stderr } = await runCli("send", "--event=INVALID_EVENT");
    expect(exitCode).toBe(2);
    expect(stderr).toContain("Invalid event");
  });

  test("fails with malformed JSON in --data", async () => {
    await runCli("init");
    const { exitCode, stderr } = await runCli(
      "send",
      "--event=START",
      "--data={not valid json}",
    );
    expect(exitCode).toBe(2);
    expect(stderr).toContain("Invalid JSON");
  });

  test("fails when --event is missing", async () => {
    await runCli("init");
    const { exitCode, stderr } = await runCli("send");
    expect(exitCode).toBe(2);
    expect(stderr).toContain("Missing --event");
  });

  test("persists state after send", async () => {
    await runCli("init");
    await runCli("send", "--event=START");

    // Verify persisted state is preflight
    const { json } = await runCli("get");
    expect(json.state).toBe("preflight");
  });
});

// ─── status ─────────────────────────────────────────────────────────────────

describe("cli status", () => {
  test("shows initialized: false when no state exists", async () => {
    const { exitCode, json } = await runCli("status");
    expect(exitCode).toBe(0);
    expect(json.initialized).toBe(false);
  });

  test("shows full status after init", async () => {
    await runCli("init");
    const { exitCode, json } = await runCli("status");
    expect(exitCode).toBe(0);
    expect(json.initialized).toBe(true);
    expect(json.state).toBe("idle");
    expect(json.session_id).toBeDefined();
    expect(json.allowed_events).toContain("START");
  });

  test("shows allowed events after state transition", async () => {
    await runCli("init");
    await runCli("send", "--event=START");
    const { json } = await runCli("status");
    expect(json.state).toBe("preflight");
    expect(json.allowed_events).toContain("PREFLIGHT_COMPLETE");
    expect(json.allowed_events).toContain("SKIP");
  });
});

// ─── resume ─────────────────────────────────────────────────────────────────

describe("cli resume", () => {
  test("loads persisted state and outputs current state", async () => {
    await runCli("init");
    await runCli("send", "--event=START");

    const { exitCode, json } = await runCli("resume");
    expect(exitCode).toBe(0);
    expect(json.resumed).toBe(true);
    expect(json.state).toBe("preflight");
    expect(json.session_id).toBeDefined();
    expect(json.allowed_events).toBeDefined();
  });

  test("fails when no state file exists", async () => {
    const { exitCode, stderr } = await runCli("resume");
    expect(exitCode).toBe(2);
    expect(stderr).toContain("not found");
  });
});

// ─── reset ──────────────────────────────────────────────────────────────────

describe("cli reset", () => {
  test("clears state file and outputs reset: true", async () => {
    await runCli("init");
    expect(await Bun.file(STATE_FILE).exists()).toBe(true);

    const { exitCode, json } = await runCli("reset");
    expect(exitCode).toBe(0);
    expect(json.reset).toBe(true);

    expect(await Bun.file(STATE_FILE).exists()).toBe(false);
  });

  test("get fails after reset", async () => {
    await runCli("init");
    await runCli("reset");

    const { exitCode, stderr } = await runCli("get");
    expect(exitCode).toBe(2);
    expect(stderr).toContain("not found");
  });

  test("reset is idempotent (succeeds even when no state)", async () => {
    const { exitCode, json } = await runCli("reset");
    expect(exitCode).toBe(0);
    expect(json.reset).toBe(true);
  });
});

// ─── Unknown subcommand ─────────────────────────────────────────────────────

describe("cli unknown subcommand", () => {
  test("prints usage and exits with code 2", async () => {
    const { exitCode, stderr } = await runCli("unknown-command");
    expect(exitCode).toBe(2);
    expect(stderr).toContain("Usage");
  });
});
