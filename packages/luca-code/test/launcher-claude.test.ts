/**
 * test/launcher-claude.test.ts — step 15 (launcher/claude.ts).
 *
 * Covers gatewayArgs, buildClaudeEnv, stopClaudeDaemon,
 * saveTerminalState/restoreTerminalAfterClaude, mapExitCode, and launchClaude
 * per the macaz internal/launcher/launcher.go port spec.
 *
 * Spawn/which are injected via the LaunchClaudeOpts seams so the suite never
 * launches a real `claude` binary.
 */

import { test, expect, describe } from "bun:test";

import {
  gatewayArgs,
  buildClaudeEnv,
  stopClaudeDaemon,
  saveTerminalState,
  restoreTerminalAfterClaude,
  mapExitCode,
  launchClaude,
  type SpawnFn,
  type SpawnResult,
  type TerminalState,
} from "../src/launcher/claude";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Read the JSON payload appended after `--managed-settings`. */
function managedSettings(args: string[]): {
  model: string;
  availableModels: string[];
  enforceAvailableModels: boolean;
} {
  const i = args.indexOf("--managed-settings");
  expect(i).toBeGreaterThan(-1);
  const raw = args[i + 1];
  expect(raw).toBeDefined();
  return JSON.parse(raw!) as {
    model: string;
    availableModels: string[];
    enforceAvailableModels: boolean;
  };
}

/** Build a fake SpawnFn that returns a fixed exit code. */
function fakeSpawnReturning(code: number): SpawnFn {
  return () => {
    const exited = Promise.resolve(code);
    return { exitCode: code, exited } satisfies SpawnResult;
  };
}

/** Build a fake SpawnFn that records the invocation. */
function recordingSpawn(
  code: number,
): {
  fn: SpawnFn;
  calls: Array<{
    cmd: string[];
    env: Record<string, string>;
    stdin?: "inherit" | "ignore";
    stdout?: "inherit" | "ignore";
    stderr?: "inherit" | "ignore";
  }>;
} {
  const calls: Array<{
    cmd: string[];
    env: Record<string, string>;
    stdin?: "inherit" | "ignore";
    stdout?: "inherit" | "ignore";
    stderr?: "inherit" | "ignore";
  }> = [];
  const fn: SpawnFn = (opts) => {
    calls.push({
      cmd: opts.cmd,
      env: opts.env,
      stdin: opts.stdin,
      stdout: opts.stdout,
      stderr: opts.stderr,
    });
    return { exitCode: code, exited: Promise.resolve(code) };
  };
  return { fn, calls };
}

// ---------------------------------------------------------------------------
// gatewayArgs
// ---------------------------------------------------------------------------

describe("gatewayArgs", () => {
  test("appends --managed-settings with {model, availableModels, enforceAvailableModels}", () => {
    const out = gatewayArgs([], ["gpt-5", "gpt-4o"], "gpt-5");
    expect(out).toEqual([
      "--managed-settings",
      JSON.stringify({
        model: "gpt-5",
        availableModels: ["gpt-5", "gpt-4o"],
        enforceAvailableModels: true,
      }),
    ]);
    const ms = managedSettings(out);
    expect(ms.model).toBe("gpt-5");
    expect(ms.availableModels).toEqual(["gpt-5", "gpt-4o"]);
    expect(ms.enforceAvailableModels).toBe(true);
  });

  test("resolves --model alias (sonnet) to selected", () => {
    const out = gatewayArgs(["--model", "sonnet"], ["gpt-5"], "gpt-5");
    expect(out[0]).toBe("--model");
    expect(out[1]).toBe("gpt-5");
    expect(managedSettings(out).model).toBe("gpt-5");
  });

  test("resolves --model=haiku (joined form) to selected", () => {
    const out = gatewayArgs(["--model=haiku", "--print"], ["gpt-5"], "gpt-5");
    expect(out[0]).toBe("--model=gpt-5");
    expect(out[1]).toBe("--print");
  });

  test("keeps --model value when it is an allowed public id", () => {
    const out = gatewayArgs(["--model", "gpt-4o"], ["gpt-5", "gpt-4o"], "gpt-5");
    expect(out[1]).toBe("gpt-4o");
    expect(managedSettings(out).model).toBe("gpt-4o");
  });

  test("resolves unknown --model value to selected (we own model selection)", () => {
    const out = gatewayArgs(["--model", "claude-opus-9"], ["gpt-5"], "gpt-5");
    expect(out[1]).toBe("gpt-5");
    expect(managedSettings(out).model).toBe("gpt-5");
  });

  test("all alias keywords resolve to selected", () => {
    for (const alias of ["default", "inherit", "sonnet", "opus", "haiku", "fable"]) {
      const out = gatewayArgs(["--model", alias], ["gpt-5"], "gpt-5");
      expect(out[1]).toBe("gpt-5");
    }
  });

  test("uses selected as the managed-settings model when no --model passed", () => {
    const out = gatewayArgs(["--print"], ["gpt-5"], "gpt-5");
    expect(out[0]).toBe("--print");
    expect(managedSettings(out).model).toBe("gpt-5");
  });

  test("rejects user --managed-settings (we own it)", () => {
    expect(() => gatewayArgs(["--managed-settings", "x.json"], ["gpt-5"], "gpt-5")).toThrow();
    expect(() => gatewayArgs(["--managed-settings=x.json"], ["gpt-5"], "gpt-5")).toThrow();
  });

  test("rejects user --fallback-model (we own it)", () => {
    expect(() => gatewayArgs(["--fallback-model", "gpt-4o"], ["gpt-5"], "gpt-5")).toThrow();
    expect(() => gatewayArgs(["--fallback-model=gpt-4o"], ["gpt-5"], "gpt-5")).toThrow();
  });

  test("does not mutate the caller's args array", () => {
    const args = ["--model", "sonnet"];
    gatewayArgs(args, ["gpt-5"], "gpt-5");
    expect(args).toEqual(["--model", "sonnet"]);
  });
});

// ---------------------------------------------------------------------------
// gatewayArgs — separate-form --model validation (todo #15)
// ---------------------------------------------------------------------------

describe("gatewayArgs — separate-form --model validation", () => {
  const MODELS = ["claude-luca-code-gpt-5"];
  const SELECTED = "claude-luca-code-gpt-5";
  /** The JSON payload gatewayArgs appends for MODELS/SELECTED. */
  const MANAGED = JSON.stringify({
    model: SELECTED,
    availableModels: MODELS,
    enforceAvailableModels: true,
  });

  test("dangling --model as the last arg gets the selected id, not our own flag", () => {
    const out = gatewayArgs(["--model"], MODELS, SELECTED);
    expect(out).toEqual(["--model", SELECTED, "--managed-settings", MANAGED]);
    // the launcher's own flag must never be consumed as the model value
    expect(out[1]).not.toBe("--managed-settings");
  });

  test("dangling --model after another flag still gets a value", () => {
    const out = gatewayArgs(["--print", "--model"], MODELS, SELECTED);
    expect(out).toEqual(["--print", "--model", SELECTED, "--managed-settings", MANAGED]);
  });

  test("a following long flag is not consumed as the --model value", () => {
    const out = gatewayArgs(["--model", "--print"], MODELS, SELECTED);
    expect(out).toEqual(["--model", SELECTED, "--print", "--managed-settings", MANAGED]);
    expect(out.includes("--print")).toBe(true);
  });

  test("a following short flag and its positional survive intact", () => {
    const out = gatewayArgs(["--model", "-p", "hello"], MODELS, SELECTED);
    expect(out).toEqual(["--model", SELECTED, "-p", "hello", "--managed-settings", MANAGED]);
    expect(out.includes("-p")).toBe(true);
  });

  test("--dangerously-skip-permissions is not swallowed as a model value", () => {
    const out = gatewayArgs(["--model", "--dangerously-skip-permissions"], MODELS, SELECTED);
    expect(out.includes("--dangerously-skip-permissions")).toBe(true);
    expect(out[1]).toBe(SELECTED);
  });

  test("every --model occurrence is resolved, not just the first", () => {
    const out = gatewayArgs(["--model", "sonnet", "--model", "claude-opus-4-5"], MODELS, SELECTED);
    expect(out).toEqual([
      "--model",
      SELECTED,
      "--model",
      SELECTED,
      "--managed-settings",
      MANAGED,
    ]);
    // an out-of-catalog id must not survive to win under last-wins parsing
    expect(out.includes("claude-opus-4-5")).toBe(false);
  });

  test("REGRESSION: an allowed id is overwritten in place, never spliced", () => {
    const out = gatewayArgs(["--model", "gpt-4o"], ["gpt-5", "gpt-4o"], "gpt-5");
    expect(out[1]).toBe("gpt-4o");
    expect(out.length).toBe(4);
    expect(managedSettings(out).model).toBe("gpt-4o");
  });

  test("REGRESSION: joined form is untouched by the separate-form fix", () => {
    const out = gatewayArgs(["--model=haiku", "--print"], ["gpt-5"], "gpt-5");
    expect(out).toEqual([
      "--model=gpt-5",
      "--print",
      "--managed-settings",
      JSON.stringify({
        model: "gpt-5",
        availableModels: ["gpt-5"],
        enforceAvailableModels: true,
      }),
    ]);
  });

  test("joined form with an empty value resolves to selected", () => {
    const out = gatewayArgs(["--model="], MODELS, SELECTED);
    expect(out[0]).toBe(`--model=${SELECTED}`);
  });

  test("IMMUTABILITY: the splice never leaks into the caller's array", () => {
    const args = ["--model"];
    gatewayArgs(args, ["gpt-5"], "gpt-5");
    expect(args).toEqual(["--model"]);
  });
});

// ---------------------------------------------------------------------------
// buildClaudeEnv
// ---------------------------------------------------------------------------

describe("buildClaudeEnv", () => {
  test("sets the full Claude-only env override subset", () => {
    const env = buildClaudeEnv({
      baseEnv: {},
      baseUrl: "http://127.0.0.1:5555",
      authToken: "tok-123",
      launchModel: "gpt-5",
      profileDir: "/tmp/profile",
      hasEfforts: false,
    });
    expect(env["ANTHROPIC_BASE_URL"]).toBe("http://127.0.0.1:5555");
    expect(env["ANTHROPIC_AUTH_TOKEN"]).toBe("tok-123");
    expect(env["ANTHROPIC_API_KEY"]).toBe("tok-123");
    expect(env["ANTHROPIC_MODEL"]).toBe("gpt-5");
    expect(env["ANTHROPIC_SMALL_FAST_MODEL"]).toBe("gpt-5");
    expect(env["CLAUDE_CODE_AUTO_MODE_MODEL"]).toBe("gpt-5");
    expect(env["CLAUDE_CODE_BG_CLASSIFIER_MODEL"]).toBe("gpt-5");
    expect(env["CLAUDE_CODE_SUBAGENT_MODEL"]).toBe("gpt-5");
    expect(env["CLAUDE_CODE_DISABLE_LEGACY_MODEL_REMAP"]).toBe("1");
    expect(env["CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK"]).toBe("1");
    expect(env["CLAUDE_CODE_USE_GATEWAY"]).toBe("1");
    expect(env["CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY"]).toBe("1");
    expect(env["DISABLE_ERROR_REPORTING"]).toBe("1");
    expect(env["DISABLE_FEEDBACK_COMMAND"]).toBe("1");
    expect(env["DO_NOT_TRACK"]).toBe("1");
    expect(env["CLAUDE_CONFIG_DIR"]).toBe("/tmp/profile");
    // conditional — absent
    expect(env["CLAUDE_CODE_AUTO_COMPACT_WINDOW"]).toBeUndefined();
    expect(env["CLAUDE_CODE_ALWAYS_ENABLE_EFFORT"]).toBeUndefined();
  });

  test("copies string values from baseEnv", () => {
    const env = buildClaudeEnv({
      baseEnv: { PATH: "/usr/bin", HOME: "/h", EMPTY: undefined },
      baseUrl: "http://x",
      authToken: "t",
      launchModel: "m",
      profileDir: "/p",
    });
    expect(env["PATH"]).toBe("/usr/bin");
    expect(env["HOME"]).toBe("/h");
    // undefined values are dropped
    expect(env["EMPTY"]).toBeUndefined();
  });

  test("gateway overrides win over baseEnv copies", () => {
    const env = buildClaudeEnv({
      baseEnv: { ANTHROPIC_MODEL: "should-be-overwritten" },
      baseUrl: "http://x",
      authToken: "t",
      launchModel: "gpt-5",
      profileDir: "/p",
    });
    expect(env["ANTHROPIC_MODEL"]).toBe("gpt-5");
  });

  test("sets CLAUDE_CODE_AUTO_COMPACT_WINDOW when contextWindow known", () => {
    const env = buildClaudeEnv({
      baseEnv: {},
      baseUrl: "http://x",
      authToken: "t",
      launchModel: "m",
      profileDir: "/p",
      contextWindow: 200000,
    });
    expect(env["CLAUDE_CODE_AUTO_COMPACT_WINDOW"]).toBe("200000");
  });

  test("sets CLAUDE_CODE_ALWAYS_ENABLE_EFFORT=1 when hasEfforts", () => {
    const env = buildClaudeEnv({
      baseEnv: {},
      baseUrl: "http://x",
      authToken: "t",
      launchModel: "m",
      profileDir: "/p",
      hasEfforts: true,
    });
    expect(env["CLAUDE_CODE_ALWAYS_ENABLE_EFFORT"]).toBe("1");
  });

  test("throws on invalid opts (missing required baseUrl)", () => {
    expect(() =>
      buildClaudeEnv({ launchModel: "m", profileDir: "/p", authToken: "t" }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// mapExitCode
// ---------------------------------------------------------------------------

describe("mapExitCode", () => {
  test("passes through zero", () => {
    expect(mapExitCode(0)).toBe(0);
  });
  test("passes through a generic non-zero code", () => {
    expect(mapExitCode(2)).toBe(2);
  });
  test("maps SIGINT (130) to 0 — user interrupt is not an error", () => {
    expect(mapExitCode(130)).toBe(0);
  });
  test("maps null (signal death) to 1", () => {
    expect(mapExitCode(null)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// saveTerminalState / restoreTerminalAfterClaude
// ---------------------------------------------------------------------------

describe("terminal state", () => {
  test("saveTerminalState returns a TerminalState object", () => {
    const s = saveTerminalState();
    expect(typeof s.isTTY).toBe("boolean");
    expect(typeof s.wasRaw).toBe("boolean");
  });

  test("restoreTerminalAfterClaude accepts a saved state and does not throw", () => {
    const s: TerminalState = { isTTY: false, wasRaw: false };
    expect(() => restoreTerminalAfterClaude(s)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// stopClaudeDaemon
// ---------------------------------------------------------------------------

describe("stopClaudeDaemon", () => {
  test("spawns <claude> daemon stop --any with the provided env and discards io", async () => {
    const rec = recordingSpawn(0);
    await stopClaudeDaemon({
      claudePath: "/fake/claude",
      env: { FOO: "bar" },
      timeoutMs: 1000,
      spawn: rec.fn,
    });
    expect(rec.calls.length).toBe(1);
    const dcall = rec.calls[0]!;
    expect(dcall.cmd).toEqual(["/fake/claude", "daemon", "stop", "--any"]);
    expect(dcall.env["FOO"]).toBe("bar");
  });

  test("no-op when claudePath resolves to null", async () => {
    const rec = recordingSpawn(0);
    await stopClaudeDaemon({
      claudePath: null,
      env: {},
      timeoutMs: 100,
      spawn: rec.fn,
    });
    expect(rec.calls.length).toBe(0);
  });

  test("swallows spawn errors (best-effort)", async () => {
    const throwing: SpawnFn = () => {
      throw new Error("boom");
    };
    await expect(
      stopClaudeDaemon({
        claudePath: "/fake/claude",
        env: {},
        timeoutMs: 100,
        spawn: throwing,
      }),
    ).resolves.toBeUndefined();
  });

  test("respects the timeout — resolves even if the process never exits", async () => {
    const neverExiting: SpawnFn = () => ({
      exitCode: null,
      exited: new Promise<number>(() => {}), // never resolves
    });
    const start = Date.now();
    await stopClaudeDaemon({
      claudePath: "/fake/claude",
      env: {},
      timeoutMs: 50,
      spawn: neverExiting,
    });
    expect(Date.now() - start).toBeLessThan(500);
  });
});

// ---------------------------------------------------------------------------
// launchClaude
// ---------------------------------------------------------------------------

describe("launchClaude", () => {
  test("finds claude via which, builds args+env, spawns with inherited stdio, returns mapped exit code", async () => {
    const rec = recordingSpawn(0);
    let daemonCalled = false;
    const code = await launchClaude({
      args: ["--model", "sonnet"],
      models: ["gpt-5"],
      selectedModel: "gpt-5",
      launchModel: "gpt-5",
      baseUrl: "http://127.0.0.1:5555",
      authToken: "tok",
      profileDir: "/tmp/profile",
      baseEnv: {},
      which: () => "/fake/claude",
      spawn: rec.fn,
      // short daemon timeout so the deferred cleanup resolves quickly
      daemonTimeoutMs: 50,
      daemonSpawn: () => {
        daemonCalled = true;
        return { exitCode: 0, exited: Promise.resolve(0) };
      },
    });
    expect(code).toBe(0);
    expect(rec.calls.length).toBe(1);
    const call = rec.calls[0]!;
    expect(call.cmd[0]).toBe("/fake/claude");
    // args after the exe: resolved --model gpt-5 + --managed-settings <json>
    expect(call.cmd[1]).toBe("--model");
    expect(call.cmd[2]).toBe("gpt-5");
    expect(call.cmd[3]).toBe("--managed-settings");
    const ms = JSON.parse(call.cmd[4]!) as { model: string };
    expect(ms.model).toBe("gpt-5");
    // env built via buildClaudeEnv
    expect(call.env["ANTHROPIC_BASE_URL"]).toBe("http://127.0.0.1:5555");
    expect(call.env["ANTHROPIC_MODEL"]).toBe("gpt-5");
    expect(call.env["CLAUDE_CONFIG_DIR"]).toBe("/tmp/profile");
    expect(call.env["CLAUDE_CODE_USE_GATEWAY"]).toBe("1");
    // stdio inherited
    expect(call.stdin).toBe("inherit");
    expect(call.stdout).toBe("inherit");
    expect(call.stderr).toBe("inherit");
    // daemon stop was deferred after exit
    expect(daemonCalled).toBe(true);
  });

  test("maps exit code 130 (SIGINT) to 0", async () => {
    const rec = recordingSpawn(130);
    const code = await launchClaude({
      args: [],
      models: ["gpt-5"],
      selectedModel: "gpt-5",
      launchModel: "gpt-5",
      baseUrl: "http://x",
      authToken: "t",
      profileDir: "/p",
      baseEnv: {},
      which: () => "/fake/claude",
      spawn: rec.fn,
      daemonTimeoutMs: 50,
      daemonSpawn: () => ({ exitCode: 0, exited: Promise.resolve(0) }),
    });
    expect(code).toBe(0);
  });

  test("returns 127 when claude binary is not found", async () => {
    const rec = recordingSpawn(0);
    const code = await launchClaude({
      args: [],
      models: ["gpt-5"],
      selectedModel: "gpt-5",
      launchModel: "gpt-5",
      baseUrl: "http://x",
      authToken: "t",
      profileDir: "/p",
      baseEnv: {},
      which: () => null,
      spawn: rec.fn,
      daemonTimeoutMs: 50,
      daemonSpawn: () => ({ exitCode: 0, exited: Promise.resolve(0) }),
    });
    expect(code).toBe(127);
    expect(rec.calls.length).toBe(0);
  });

  test("a dangling --model in argv is given a value before --managed-settings", async () => {
    const rec = recordingSpawn(0);
    const code = await launchClaude({
      args: ["--model"],
      models: ["claude-luca-code-gpt-5"],
      selectedModel: "claude-luca-code-gpt-5",
      launchModel: "claude-luca-code-gpt-5",
      baseUrl: "http://127.0.0.1:5555",
      authToken: "tok",
      profileDir: "/tmp/profile",
      baseEnv: {},
      which: () => "/fake/claude",
      spawn: rec.fn,
      daemonTimeoutMs: 50,
      daemonSpawn: () => ({ exitCode: 0, exited: Promise.resolve(0) }),
    });
    expect(code).toBe(0);
    const call = rec.calls[0]!;
    expect(call.cmd).toEqual([
      "/fake/claude",
      "--model",
      "claude-luca-code-gpt-5",
      "--managed-settings",
      JSON.stringify({
        model: "claude-luca-code-gpt-5",
        availableModels: ["claude-luca-code-gpt-5"],
        enforceAvailableModels: true,
      }),
    ]);
    expect(JSON.parse(call.cmd[4]!).model).toBe("claude-luca-code-gpt-5");
  });

  test("still restores terminal + stops daemon when spawn exits non-zero", async () => {
    const rec = recordingSpawn(2);
    let daemonCalled = false;
    const code = await launchClaude({
      args: [],
      models: ["gpt-5"],
      selectedModel: "gpt-5",
      launchModel: "gpt-5",
      baseUrl: "http://x",
      authToken: "t",
      profileDir: "/p",
      baseEnv: {},
      which: () => "/fake/claude",
      spawn: rec.fn,
      daemonTimeoutMs: 50,
      daemonSpawn: () => {
        daemonCalled = true;
        return { exitCode: 0, exited: Promise.resolve(0) };
      },
    });
    expect(code).toBe(2);
    expect(daemonCalled).toBe(true);
  });
});