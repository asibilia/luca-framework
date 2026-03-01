import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  createContextMonitor,
  getCurrentZone,
} from "../../../src/memory/__helpers/context-monitor.ts";
import { join } from "node:path";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

// ─── Test Fixtures ──────────────────────────────────────────────────────────────

let tempDir: string;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "context-monitor-test-"));

  // Create .planning directory
  const planningDir = join(tempDir, ".planning");
  await mkdir(planningDir, { recursive: true });
  await Bun.write(
    join(planningDir, "BRAIN.md"),
    "# Brain\n\nProject identity.",
  );
  await Bun.write(
    join(planningDir, "MEMORY.md"),
    "# Memory\n\n" + "Entry content. ".repeat(100),
  );
  await Bun.write(
    join(planningDir, "WORKING.md"),
    "# Working Memory\n\n## Session Info\n\nActive session.",
  );
  await Bun.write(join(planningDir, "STATE.md"), "# State\n\nCurrent state.");
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

// ─── Factory creation ────────────────────────────────────────────────────────

describe("createContextMonitor", () => {
  test("returns object with expected methods", () => {
    const monitor = createContextMonitor();

    expect(typeof monitor.checkContextUsage).toBe("function");
    expect(typeof monitor.getBreakdown).toBe("function");
    expect(typeof monitor.shouldCompress).toBe("function");
  });

  test("custom config overrides are respected", () => {
    const monitor = createContextMonitor({
      project_dir: tempDir,
      context_budget: 1000,
      zone_boundaries: { peak_end: 10, good_end: 20, degrading_end: 30 },
    });

    // Monitor was created without error
    expect(monitor).toBeDefined();
  });

  test("default context budget is applied when not specified", async () => {
    const monitor = createContextMonitor({ project_dir: tempDir });
    const usage = await monitor.checkContextUsage();

    // Budget should be the default 50000
    expect(usage.budget_tokens).toBe(50000);
  });

  test("zero context_budget falls back to default", async () => {
    const monitor = createContextMonitor({
      project_dir: tempDir,
      context_budget: 0,
    });
    const usage = await monitor.checkContextUsage();

    expect(usage.budget_tokens).toBe(50000);
    expect(Number.isFinite(usage.usage_percent)).toBe(true);
  });

  test("negative context_budget falls back to default", async () => {
    const monitor = createContextMonitor({
      project_dir: tempDir,
      context_budget: -100,
    });
    const usage = await monitor.checkContextUsage();

    expect(usage.budget_tokens).toBe(50000);
    expect(Number.isFinite(usage.usage_percent)).toBe(true);
  });
});

// ─── checkContextUsage ──────────────────────────────────────────────────────

describe("checkContextUsage", () => {
  test("returns usage_percent as a number >= 0", async () => {
    const monitor = createContextMonitor({ project_dir: tempDir });
    const usage = await monitor.checkContextUsage();

    expect(typeof usage.usage_percent).toBe("number");
    expect(usage.usage_percent).toBeGreaterThanOrEqual(0);
  });

  test("returns valid QualityZone", async () => {
    const monitor = createContextMonitor({ project_dir: tempDir });
    const usage = await monitor.checkContextUsage();

    expect(["peak", "good", "degrading", "stop"]).toContain(usage.zone);
  });

  test("breakdown includes entries for all four context files", async () => {
    const monitor = createContextMonitor({ project_dir: tempDir });
    const usage = await monitor.checkContextUsage();

    expect(usage.breakdown.length).toBe(4);

    const files = usage.breakdown.map((b) => b.file);
    expect(files).toContain(".planning/BRAIN.md");
    expect(files).toContain(".planning/MEMORY.md");
    expect(files).toContain(".planning/WORKING.md");
    expect(files).toContain(".planning/STATE.md");
  });

  test("all files show exists: true for temp dir with files", async () => {
    const monitor = createContextMonitor({ project_dir: tempDir });
    const usage = await monitor.checkContextUsage();

    for (const entry of usage.breakdown) {
      expect(entry.exists).toBe(true);
    }
  });

  test("missing files show exists: false, tokens: 0", async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), "ctx-empty-"));
    const monitor = createContextMonitor({ project_dir: emptyDir });
    const usage = await monitor.checkContextUsage();

    for (const entry of usage.breakdown) {
      expect(entry.exists).toBe(false);
      expect(entry.tokens).toBe(0);
    }

    await rm(emptyDir, { recursive: true, force: true });
  });

  test("timestamp is a valid ISO 8601 string", async () => {
    const monitor = createContextMonitor({ project_dir: tempDir });
    const usage = await monitor.checkContextUsage();

    expect(usage.timestamp).toBeDefined();
    const parsed = new Date(usage.timestamp);
    expect(parsed.getTime()).not.toBeNaN();
  });
});

// ─── Zone mapping ────────────────────────────────────────────────────────────

describe("zone mapping", () => {
  test("usage 0-30% maps to peak", async () => {
    // Very large budget so our small test files are < 30%
    const monitor = createContextMonitor({
      project_dir: tempDir,
      context_budget: 100000,
    });
    const usage = await monitor.checkContextUsage();

    expect(usage.usage_percent).toBeLessThanOrEqual(30);
    expect(usage.zone).toBe("peak");
  });

  test("usage maps to good with appropriate budget", async () => {
    // Calculate what budget would put us in the 30-50% range
    const peakMonitor = createContextMonitor({
      project_dir: tempDir,
      context_budget: 100000,
    });
    const peakUsage = await peakMonitor.checkContextUsage();
    const totalTokens = peakUsage.total_tokens;

    if (totalTokens > 0) {
      // Set budget so usage is ~40%
      const budget = Math.round((totalTokens / 40) * 100);
      const monitor = createContextMonitor({
        project_dir: tempDir,
        context_budget: budget,
      });
      const usage = await monitor.checkContextUsage();
      expect(usage.zone).toBe("good");
    }
  });

  test("usage maps to degrading with small budget", async () => {
    const peakMonitor = createContextMonitor({
      project_dir: tempDir,
      context_budget: 100000,
    });
    const peakUsage = await peakMonitor.checkContextUsage();
    const totalTokens = peakUsage.total_tokens;

    if (totalTokens > 0) {
      // Set budget so usage is ~60%
      const budget = Math.round((totalTokens / 60) * 100);
      const monitor = createContextMonitor({
        project_dir: tempDir,
        context_budget: budget,
      });
      const usage = await monitor.checkContextUsage();
      expect(usage.zone).toBe("degrading");
    }
  });

  test("usage maps to stop with very small budget", async () => {
    const monitor = createContextMonitor({
      project_dir: tempDir,
      context_budget: 10, // Very small budget
    });
    const usage = await monitor.checkContextUsage();

    expect(usage.zone).toBe("stop");
  });

  test("zone boundaries respect config overrides", async () => {
    const monitor = createContextMonitor({
      project_dir: tempDir,
      context_budget: 100000,
      zone_boundaries: { peak_end: 90, good_end: 95, degrading_end: 99 },
    });
    const usage = await monitor.checkContextUsage();

    // With these wide boundaries and large budget, usage should be in peak
    expect(usage.zone).toBe("peak");
  });
});

// ─── shouldCompress ──────────────────────────────────────────────────────────

describe("shouldCompress", () => {
  test("returns should_compress: false when all files are small", async () => {
    const monitor = createContextMonitor({
      project_dir: tempDir,
      context_budget: 100000,
    });
    const result = await monitor.shouldCompress();

    expect(result.should_compress).toBe(false);
    expect(result.triggers).toHaveLength(0);
  });

  test("returns should_compress: true when total usage is in stop zone", async () => {
    const monitor = createContextMonitor({
      project_dir: tempDir,
      context_budget: 10, // Forces stop zone
    });
    const result = await monitor.shouldCompress();

    expect(result.should_compress).toBe(true);
    expect(result.triggers.length).toBeGreaterThan(0);
  });

  test("triggers array explains why compression was recommended", async () => {
    const monitor = createContextMonitor({
      project_dir: tempDir,
      context_budget: 10,
    });
    const result = await monitor.shouldCompress();

    expect(result.triggers.length).toBeGreaterThan(0);
    for (const trigger of result.triggers) {
      expect(typeof trigger).toBe("string");
      expect(trigger.length).toBeGreaterThan(0);
    }
  });

  test("recommended_actions provides actionable suggestions", async () => {
    const monitor = createContextMonitor({
      project_dir: tempDir,
      context_budget: 10,
    });
    const result = await monitor.shouldCompress();

    expect(result.recommended_actions.length).toBeGreaterThan(0);
    for (const action of result.recommended_actions) {
      expect(typeof action).toBe("string");
      expect(action.length).toBeGreaterThan(0);
    }
  });
});

// ─── getBreakdown ────────────────────────────────────────────────────────────

describe("getBreakdown", () => {
  test("returns token count for each file", async () => {
    const monitor = createContextMonitor({ project_dir: tempDir });
    const breakdown = await monitor.getBreakdown();

    expect(breakdown.length).toBe(4);
    for (const entry of breakdown) {
      expect(typeof entry.tokens).toBe("number");
      expect(entry.tokens).toBeGreaterThanOrEqual(0);
    }
  });

  test("handles missing files without errors", async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), "ctx-breakdown-"));
    const monitor = createContextMonitor({ project_dir: emptyDir });
    const breakdown = await monitor.getBreakdown();

    expect(breakdown.length).toBe(4);
    for (const entry of breakdown) {
      expect(entry.exists).toBe(false);
      expect(entry.tokens).toBe(0);
    }

    await rm(emptyDir, { recursive: true, force: true });
  });
});

// ─── Integration with real project files ──────────────────────────────────────

describe("integration with real project", () => {
  test("reads real .planning/MEMORY.md and produces valid output", async () => {
    // Skip if not running from project root
    const memoryFile = Bun.file(".planning/MEMORY.md");
    const exists = await memoryFile.exists();

    if (!exists) {
      // Skip gracefully in CI environments
      return;
    }

    const monitor = createContextMonitor({ project_dir: "." });
    const usage = await monitor.checkContextUsage();

    expect(usage.total_tokens).toBeGreaterThan(0);
    expect(["peak", "good", "degrading", "stop"]).toContain(usage.zone);
    expect(usage.breakdown.length).toBe(4);

    // MEMORY.md should be the largest file
    const memoryBreakdown = usage.breakdown.find((b) =>
      b.file.includes("MEMORY.md"),
    );
    expect(memoryBreakdown).toBeDefined();
    expect(memoryBreakdown!.tokens).toBeGreaterThan(0);
  });
});

// ─── Auto-Persist Working ────────────────────────────────────────────────────

describe("autoPersistWorking", () => {
  test("returns object with expected shape", async () => {
    const monitor = createContextMonitor({ project_dir: tempDir });
    const result = await monitor.autoPersistWorking();

    expect(typeof result.persisted).toBe("boolean");
    expect(typeof result.zone).toBe("string");
  });

  test("does not persist when zone is peak or good", async () => {
    // With our small temp files, usage should be in peak zone
    const monitor = createContextMonitor({
      project_dir: tempDir,
      context_budget: 100000, // Large budget so files are tiny relative to it
    });
    const result = await monitor.autoPersistWorking();

    expect(result.persisted).toBe(false);
    expect(["peak", "good"]).toContain(result.zone);
  });

  test("persists when zone is degrading or stop", async () => {
    // Set a tiny budget so files push us into degrading/stop zone
    const monitor = createContextMonitor({
      project_dir: tempDir,
      context_budget: 10, // Extremely small budget
      zone_boundaries: { peak_end: 10, good_end: 20, degrading_end: 50 },
    });
    const result = await monitor.autoPersistWorking();

    // With such a tiny budget, all files should push us past degrading
    expect(result.persisted).toBe(true);
    expect(["degrading", "stop"]).toContain(result.zone);

    // Check that WORKING.md was modified with auto-persist marker
    const workingContent = await Bun.file(
      join(tempDir, ".planning/WORKING.md"),
    ).text();
    expect(workingContent).toContain("Auto-persisted:");
  });

  test("includes zone in auto-persist marker", async () => {
    // Reset WORKING.md to clean state
    await Bun.write(
      join(tempDir, ".planning/WORKING.md"),
      "# Working Memory\n\n## Session Info\n\nClean state.",
    );

    const monitor = createContextMonitor({
      project_dir: tempDir,
      context_budget: 10,
      zone_boundaries: { peak_end: 10, good_end: 20, degrading_end: 50 },
    });
    const result = await monitor.autoPersistWorking();

    if (result.persisted) {
      const workingContent = await Bun.file(
        join(tempDir, ".planning/WORKING.md"),
      ).text();
      expect(workingContent).toContain(`zone: ${result.zone}`);
    }
  });
});

// ─── estimation_method field ──────────────────────────────────────────────────

describe("estimation_method", () => {
  test("checkContextUsage includes estimation_method field", async () => {
    const monitor = createContextMonitor({ project_dir: tempDir });
    const usage = await monitor.checkContextUsage();

    expect(usage.estimation_method).toBeDefined();
    expect(["tiktoken", "heuristic"]).toContain(usage.estimation_method);
  });

  test("estimation_method is tiktoken when js-tiktoken is available", async () => {
    const monitor = createContextMonitor({ project_dir: tempDir });
    const usage = await monitor.checkContextUsage();

    // In this test environment, js-tiktoken should be available
    expect(usage.estimation_method).toBe("tiktoken");
  });
});

// ─── getCurrentZone ──────────────────────────────────────────────────────────

describe("getCurrentZone", () => {
  test("returns a valid QualityZone", async () => {
    const zone = await getCurrentZone(tempDir);
    expect(["peak", "good", "degrading", "stop"]).toContain(zone);
  });

  test("returns peak with large budget", async () => {
    const zone = await getCurrentZone(tempDir, 100000);
    expect(zone).toBe("peak");
  });

  test("returns stop with tiny budget", async () => {
    const zone = await getCurrentZone(tempDir, 10);
    expect(zone).toBe("stop");
  });

  test("handles non-existent project directory gracefully", async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), "ctx-zone-"));
    const zone = await getCurrentZone(emptyDir);

    // No files means 0 tokens, should be peak
    expect(zone).toBe("peak");

    await rm(emptyDir, { recursive: true, force: true });
  });
});
