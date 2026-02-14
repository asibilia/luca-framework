import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "fs";
import path from "path";

const ROOT = path.join(import.meta.dir, "../..");
const CLAUDE_DIR = path.join(ROOT, ".claude");
const LOCK_PATH = path.join(CLAUDE_DIR, ".session-lock");
const MANIFEST_PATH = path.join(CLAUDE_DIR, ".build-manifest.json");
const CONFIG_PATH = path.join(ROOT, ".planning", "config.json");

describe("dogfood stability — session lock guard", () => {
  beforeEach(() => {
    // Ensure .claude/ directory exists
    mkdirSync(CLAUDE_DIR, { recursive: true });
    // Clean up any existing lock file
    if (existsSync(LOCK_PATH)) rmSync(LOCK_PATH);
  });

  afterEach(() => {
    // Clean up test lock file
    if (existsSync(LOCK_PATH)) rmSync(LOCK_PATH);
  });

  test("build refuses when session lock exists", async () => {
    // Create a fake session lock
    const lockPayload = {
      created_at: new Date().toISOString(),
      pid: process.pid,
    };
    await Bun.write(LOCK_PATH, JSON.stringify(lockPayload, null, 2) + "\n");

    const proc = Bun.spawn(["bun", "run", "./scripts/build-all.ts"], {
      cwd: ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Build blocked");
  });

  test("build proceeds with --force flag despite lock", async () => {
    // Create a fake session lock
    const lockPayload = {
      created_at: new Date().toISOString(),
      pid: process.pid,
    };
    await Bun.write(LOCK_PATH, JSON.stringify(lockPayload, null, 2) + "\n");

    const proc = Bun.spawn(
      ["bun", "run", "./scripts/build-all.ts", "--force"],
      {
        cwd: ROOT,
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();

    expect(exitCode).toBe(0);
    expect(stderr).toContain("--force");
  });

  test("stale lock (>12h old) is detected and reported", async () => {
    // Create a lock with a timestamp from 24 hours ago
    const staleDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const lockPayload = {
      created_at: staleDate.toISOString(),
      pid: 99999,
    };
    await Bun.write(LOCK_PATH, JSON.stringify(lockPayload, null, 2) + "\n");

    const proc = Bun.spawn(["bun", "run", "./scripts/build-all.ts"], {
      cwd: ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();

    expect(exitCode).toBe(1);
    expect(stderr).toContain("possibly stale");
  });

  test("build runs normally with no lock file", async () => {
    // Ensure no lock exists
    if (existsSync(LOCK_PATH)) rmSync(LOCK_PATH);

    const proc = Bun.spawn(["bun", "run", "./scripts/build-all.ts"], {
      cwd: ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
  });
});

describe("dogfood stability — build manifest", () => {
  const hasManifest = existsSync(MANIFEST_PATH);

  test.skipIf(!hasManifest)(
    "manifest is valid JSON with required fields",
    async () => {
      const content = await Bun.file(MANIFEST_PATH).text();
      const manifest = JSON.parse(content);

      expect(manifest).toHaveProperty("built_at");
      expect(manifest).toHaveProperty("output_count");
      expect(manifest).toHaveProperty("version");
    },
  );

  test.skipIf(!hasManifest)(
    "built_at is a valid ISO 8601 timestamp",
    async () => {
      const manifest = JSON.parse(await Bun.file(MANIFEST_PATH).text());
      const date = new Date(manifest.built_at);
      expect(date.toISOString()).toBe(manifest.built_at);
    },
  );

  test.skipIf(!hasManifest)("output_count is a positive integer", async () => {
    const manifest = JSON.parse(await Bun.file(MANIFEST_PATH).text());
    expect(Number.isInteger(manifest.output_count)).toBe(true);
    expect(manifest.output_count).toBeGreaterThan(0);
  });

  test.skipIf(!hasManifest)(
    "version matches package.json version",
    async () => {
      const manifest = JSON.parse(await Bun.file(MANIFEST_PATH).text());
      const pkg = JSON.parse(
        await Bun.file(path.join(ROOT, "package.json")).text(),
      );
      expect(manifest.version).toBe(pkg.version ?? "0.0.0");
    },
  );
});

describe("dogfood stability — harness config safety", () => {
  const hasConfig = existsSync(CONFIG_PATH);

  test.skipIf(!hasConfig)(
    "harness build check command is check:drift (not build:all)",
    async () => {
      const config = JSON.parse(await Bun.file(CONFIG_PATH).text());
      const buildCheck = config.harness?.checks?.find(
        (c: { name: string }) => c.name === "build",
      );
      expect(buildCheck).toBeDefined();
      expect(buildCheck.command).toBe("bun run check:drift");
      expect(buildCheck.command).not.toContain("build:all");
    },
  );

  test.skipIf(!hasConfig)("harness build check is enabled", async () => {
    const config = JSON.parse(await Bun.file(CONFIG_PATH).text());
    const buildCheck = config.harness?.checks?.find(
      (c: { name: string }) => c.name === "build",
    );
    expect(buildCheck).toBeDefined();
    expect(buildCheck.enabled).toBe(true);
  });

  test.skipIf(!hasConfig)("dogfood config section exists", async () => {
    const config = JSON.parse(await Bun.file(CONFIG_PATH).text());
    expect(config.dogfood).toBeDefined();
    expect(config.dogfood.enabled).toBe(true);
    expect(config.dogfood.source).toBe("src/");
    expect(config.dogfood.outputs).toContain(".claude/");
    expect(config.dogfood.outputs).toContain(".cursor/");
    expect(config.dogfood.build_command).toBe("bun run build:all");
    expect(config.dogfood.lock_file).toBe(".claude/.session-lock");
    expect(config.dogfood.manifest_file).toBe(".claude/.build-manifest.json");
  });
});
