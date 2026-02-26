import { describe, test, expect } from "bun:test";
import { runHarness, loadHarnessConfig } from "../../../src/harness/runner";
import { DEFAULT_HARNESS_CONFIG } from "~/harness/harness.schemas";
import type { HarnessConfig } from "~/harness/harness.schemas";
import { join } from "path";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";

const PROJECT_DIR = join(import.meta.dir, "../../..");

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "harness-test-"));
}

describe("loadHarnessConfig", () => {
  test("returns defaults when no config.json exists", async () => {
    const tmpDir = makeTmpDir();
    try {
      const config = await loadHarnessConfig(tmpDir);
      expect(config.enabled).toBe(true);
      expect(config.checks.length).toBeGreaterThan(0);
      expect(config.maxFixIterations).toBe(3);
      expect(config.failFast).toBe(false);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("loads harness section from project config.json", async () => {
    const config = await loadHarnessConfig(PROJECT_DIR);
    expect(config.enabled).toBe(true);
    expect(config.checks).toHaveLength(4);
    expect(config.maxFixIterations).toBe(3);
    // Project config has build enabled (differs from defaults)
    const buildCheck = config.checks.find((c) => c.name === "build");
    expect(buildCheck?.enabled).toBe(true);
  });

  test("reads harness section from config.json when present", async () => {
    const tmpDir = makeTmpDir();
    const planningDir = join(tmpDir, ".planning");
    mkdirSync(planningDir, { recursive: true });

    const customConfig = {
      harness: {
        enabled: true,
        checks: [
          {
            name: "custom",
            command: "echo ok",
            enabled: true,
            timeout: 10,
            parser: "generic",
          },
        ],
        maxFixIterations: 5,
        failFast: true,
      },
    };
    writeFileSync(
      join(planningDir, "config.json"),
      JSON.stringify(customConfig),
    );

    try {
      const config = await loadHarnessConfig(tmpDir);
      expect(config.maxFixIterations).toBe(5);
      expect(config.failFast).toBe(true);
      expect(config.checks).toHaveLength(1);
      expect(config.checks[0]!.name).toBe("custom");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("returns defaults on invalid JSON", async () => {
    const tmpDir = makeTmpDir();
    const planningDir = join(tmpDir, ".planning");
    mkdirSync(planningDir, { recursive: true });
    writeFileSync(join(planningDir, "config.json"), "{invalid json}}}");

    try {
      const config = await loadHarnessConfig(tmpDir);
      expect(config).toEqual(DEFAULT_HARNESS_CONFIG);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("runHarness", () => {
  test("runs a passing check (echo)", async () => {
    const config: HarnessConfig = {
      enabled: true,
      checks: [
        {
          name: "echo-test",
          command: 'echo "hello world"',
          enabled: true,
          timeout: 10,
          parser: "generic",
        },
      ],
      maxFixIterations: 3,
      failFast: false,
    };

    const result = await runHarness(config, PROJECT_DIR);

    expect(result.status).toBe("passed");
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0]!.status).toBe("passed");
    expect(result.checks[0]!.exitCode).toBe(0);
    expect(result.checks[0]!.rawOutput).toContain("hello world");
    expect(result.totalErrors).toBe(0);
    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("runs a failing check (false command)", async () => {
    const config: HarnessConfig = {
      enabled: true,
      checks: [
        {
          name: "fail-test",
          command: "false",
          enabled: true,
          timeout: 10,
          parser: "generic",
        },
      ],
      maxFixIterations: 3,
      failFast: false,
    };

    const result = await runHarness(config, PROJECT_DIR);

    expect(result.status).toBe("failed");
    expect(result.checks[0]!.status).toBe("failed");
    expect(result.checks[0]!.exitCode).not.toBe(0);
  });

  test("skips disabled checks", async () => {
    const config: HarnessConfig = {
      enabled: true,
      checks: [
        {
          name: "disabled",
          command: "echo disabled",
          enabled: false,
          timeout: 10,
          parser: "generic",
        },
        {
          name: "enabled",
          command: "echo enabled",
          enabled: true,
          timeout: 10,
          parser: "generic",
        },
      ],
      maxFixIterations: 3,
      failFast: false,
    };

    const result = await runHarness(config, PROJECT_DIR);

    expect(result.checks).toHaveLength(1);
    expect(result.checks[0]!.name).toBe("enabled");
  });

  test("failFast stops after first failure", async () => {
    const config: HarnessConfig = {
      enabled: true,
      checks: [
        {
          name: "pass",
          command: "true",
          enabled: true,
          timeout: 10,
          parser: "generic",
        },
        {
          name: "fail",
          command: "false",
          enabled: true,
          timeout: 10,
          parser: "generic",
        },
        {
          name: "should-not-run",
          command: "echo never",
          enabled: true,
          timeout: 10,
          parser: "generic",
        },
      ],
      maxFixIterations: 3,
      failFast: true,
    };

    const result = await runHarness(config, PROJECT_DIR);

    expect(result.status).toBe("failed");
    expect(result.checks).toHaveLength(2);
    expect(result.checks[0]!.name).toBe("pass");
    expect(result.checks[1]!.name).toBe("fail");
  });

  test("handles timeout", async () => {
    const config: HarnessConfig = {
      enabled: true,
      checks: [
        {
          name: "timeout-test",
          command: "sleep 30",
          enabled: true,
          timeout: 1,
          parser: "generic",
        },
      ],
      maxFixIterations: 3,
      failFast: false,
    };

    const result = await runHarness(config, PROJECT_DIR);

    expect(result.status).toBe("failed");
    expect(result.checks[0]!.status).toBe("timeout");
    expect(result.checks[0]!.exitCode).toBe(-1);
    expect(result.checks[0]!.rawOutput).toContain("timed out");
  }, 10000);

  test("uses correct parser for check output", async () => {
    // Simulate tsc-like output via echo
    const tscOutput = "src/foo.ts(10,3): error TS2322: Type mismatch";
    const config: HarnessConfig = {
      enabled: true,
      checks: [
        {
          name: "tsc-mock",
          command: `echo '${tscOutput}' && exit 1`,
          enabled: true,
          timeout: 10,
          parser: "tsc",
        },
      ],
      maxFixIterations: 3,
      failFast: false,
    };

    const result = await runHarness(config, PROJECT_DIR);

    expect(result.checks[0]!.errors).toHaveLength(1);
    expect(result.checks[0]!.errors[0]!.file).toBe("src/foo.ts");
    expect(result.checks[0]!.errors[0]!.code).toBe("TS2322");
    expect(result.totalErrors).toBe(1);
  });

  test("captures stderr in combined output", async () => {
    const config: HarnessConfig = {
      enabled: true,
      checks: [
        {
          name: "stderr-test",
          command: 'echo "stdout line" && echo "stderr line" >&2',
          enabled: true,
          timeout: 10,
          parser: "generic",
        },
      ],
      maxFixIterations: 3,
      failFast: false,
    };

    const result = await runHarness(config, PROJECT_DIR);

    expect(result.checks[0]!.rawOutput).toContain("stdout line");
    expect(result.checks[0]!.rawOutput).toContain("stderr line");
  });

  test("reports duration in milliseconds", async () => {
    const config: HarnessConfig = {
      enabled: true,
      checks: [
        {
          name: "duration-test",
          command: "true",
          enabled: true,
          timeout: 10,
          parser: "generic",
        },
      ],
      maxFixIterations: 3,
      failFast: false,
    };

    const result = await runHarness(config, PROJECT_DIR);

    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect(result.checks[0]!.duration).toBeGreaterThanOrEqual(0);
  });

  test("handles empty checks list", async () => {
    const config: HarnessConfig = {
      enabled: true,
      checks: [],
      maxFixIterations: 3,
      failFast: false,
    };

    const result = await runHarness(config, PROJECT_DIR);

    expect(result.status).toBe("passed");
    expect(result.checks).toHaveLength(0);
    expect(result.totalErrors).toBe(0);
  });

  test("handles command that does not exist", async () => {
    const config: HarnessConfig = {
      enabled: true,
      checks: [
        {
          name: "bad-cmd",
          command: "nonexistent_command_12345",
          enabled: true,
          timeout: 10,
          parser: "generic",
        },
      ],
      maxFixIterations: 3,
      failFast: false,
    };

    const result = await runHarness(config, PROJECT_DIR);

    // Should either fail or be skipped, not crash
    expect(["failed", "skipped"]).toContain(result.checks[0]!.status);
  });

  test("falls back to generic parser for unknown parser key", async () => {
    const config: HarnessConfig = {
      enabled: true,
      checks: [
        {
          name: "unknown-parser",
          command: 'echo "src/x.ts:1:1: error: test error" && exit 1',
          enabled: true,
          timeout: 10,
          parser: "nonexistent-parser",
        },
      ],
      maxFixIterations: 3,
      failFast: false,
    };

    const result = await runHarness(config, PROJECT_DIR);

    expect(result.checks[0]!.errors).toHaveLength(1);
    expect(result.checks[0]!.errors[0]!.file).toBe("src/x.ts");
  });
});
