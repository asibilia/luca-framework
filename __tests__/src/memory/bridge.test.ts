import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, unlinkSync } from "node:fs";
import { $ } from "bun";

// ─── Test Helpers ───────────────────────────────────────────────────────────

const BRIDGE = "src/memory/__helpers/bridge.ts";
const MEMORY_PATH = ".planning/MEMORY.md";
const WORKING_PATH = ".planning/WORKING.md";
const PROCEDURES_PATH = ".planning/PROCEDURES.md";
const MEMORY_JSON_PATH = ".planning/memory.json";
const WORKING_JSON_PATH = ".planning/working.json";
const PROCEDURES_JSON_PATH = ".planning/procedures.json";

/** Backup original file contents for restore after tests. */
let memoryBackup: string | null = null;
let workingBackup: string | null = null;
let proceduresBackup: string | null = null;
let memoryJsonBackup: string | null = null;
let workingJsonBackup: string | null = null;
let proceduresJsonBackup: string | null = null;

/**
 * Run a memory bridge CLI subcommand and return parsed result.
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
 * Ensure the .planning directory exists.
 */
function ensurePlanningDir() {
  try {
    mkdirSync(".planning", { recursive: true });
  } catch {
    // Directory may already exist
  }
}

/**
 * Back up existing planning files.
 */
async function backupFiles() {
  for (const [path, setter] of [
    [
      MEMORY_PATH,
      (v: string | null) => {
        memoryBackup = v;
      },
    ],
    [
      WORKING_PATH,
      (v: string | null) => {
        workingBackup = v;
      },
    ],
    [
      PROCEDURES_PATH,
      (v: string | null) => {
        proceduresBackup = v;
      },
    ],
    [
      MEMORY_JSON_PATH,
      (v: string | null) => {
        memoryJsonBackup = v;
      },
    ],
    [
      WORKING_JSON_PATH,
      (v: string | null) => {
        workingJsonBackup = v;
      },
    ],
    [
      PROCEDURES_JSON_PATH,
      (v: string | null) => {
        proceduresJsonBackup = v;
      },
    ],
  ] as const) {
    try {
      const file = Bun.file(path as string);
      if (await file.exists()) {
        (setter as (v: string | null) => void)(await file.text());
      } else {
        (setter as (v: string | null) => void)(null);
      }
    } catch {
      (setter as (v: string | null) => void)(null);
    }
  }
}

/**
 * Restore backed-up planning files.
 */
async function restoreFiles() {
  for (const [path, backup] of [
    [MEMORY_PATH, memoryBackup],
    [WORKING_PATH, workingBackup],
    [PROCEDURES_PATH, proceduresBackup],
    [MEMORY_JSON_PATH, memoryJsonBackup],
    [WORKING_JSON_PATH, workingJsonBackup],
    [PROCEDURES_JSON_PATH, proceduresJsonBackup],
  ] as const) {
    if (backup !== null) {
      await Bun.write(path as string, backup as string);
    } else {
      try {
        unlinkSync(path as string);
      } catch {
        // File may not exist
      }
    }
  }
}

/**
 * Remove a file if it exists (for "does not exist" tests).
 */
function removeFile(path: string) {
  try {
    unlinkSync(path);
  } catch {
    // May not exist
  }
}

/**
 * Write a fixture MEMORY.md with known entries.
 */
async function writeFixtureMemory() {
  // Remove JSON so bridge falls through to MD fixture
  removeFile(MEMORY_JSON_PATH);
  await Bun.write(
    MEMORY_PATH,
    `# Project Memory

## Patterns

### Validated Approaches

- **Test Pattern Alpha**: A validated testing pattern for APIs
  - **Tags**: [testing, api]
  - **Confidence**: High
  - **Agent**: lu-executor
  - **Milestone**: v1.5.0
  - **Added**: 2026-01-15

- **Build Pipeline Setup**: Standard build configuration
  - **Tags**: [build, architecture]
  - **Confidence**: Medium
  - **Agent**: general
  - **Milestone**: v1.4.0
  - **Added**: 2026-01-20

## Decisions

### Architectural Choices

### Use Bun Over Node

- **Context**: Runtime selection for performance
- **Tags**: [stack, coding]
- **Confidence**: High
- **Agent**: general
- **Milestone**: v1.6.0
- **Added**: 2026-02-01

## Pitfalls

### Known Issues

- **Import Path Gotcha**: Relative imports break when moving files
  - **Tags**: [coding, debugging]
  - **Confidence**: Low
  - **Agent**: lu-verifier
  - **Added**: 2026-02-10

## Preferences

- **Dark Mode Always**: User prefers dark theme
  - **Tags**: [preferences, ui]
  - **Confidence**: Medium
  - **Agent**: general
  - **Added**: 2026-02-12
`,
  );
}

/**
 * Write a fixture WORKING.md with known sections.
 */
async function writeFixtureWorking() {
  // Remove JSON so bridge falls through to MD fixture
  removeFile(WORKING_JSON_PATH);
  await Bun.write(
    WORKING_PATH,
    `# Working Memory

## Session Info

- **Started**: 2026-02-15
- **Workflow**: Memory Bridge
- **Phase**: Implementation

## Findings

Found that the bridge pattern works well.

## Hypotheses

Maybe we should add caching later.

---

_Session Status_

- [x] Active
- [ ] Learnings extracted
- [ ] Ready to clear
`,
  );
}

/**
 * Write a fixture PROCEDURES.md with known entries.
 */
async function writeFixtureProcedures() {
  // Remove JSON so bridge falls through to MD fixture
  removeFile(PROCEDURES_JSON_PATH);
  await Bun.write(
    PROCEDURES_PATH,
    `# Procedures

> Executable learned procedures extracted from successful executions.
> Recalled during planning to suggest proven step sequences.

## Active Procedures

### Add API Endpoint

- **Trigger**: When adding a new REST API endpoint
- **Source**: lu-executor (Phase 10)
- **Tags**: [api, coding]
- **Success Rate**: 0.80 (4/5)
- **Last Executed**: 2026-02-14
- **Status**: Active

**Steps:**

1. Define route handler
2. Add input validation [tool: zod]
3. Implement business logic
4. Write integration test -> output: test file

---

### Run Test Suite

- **Trigger**: When verifying code changes
- **Source**: general
- **Tags**: [testing, verification]
- **Success Rate**: 0.90 (9/10)
- **Last Executed**: 2026-02-15
- **Status**: Active

**Steps:**

1. Run bun test
2. Check coverage report -> output: coverage summary
3. Fix any failures

---

## Retired Procedures

### Legacy Deploy Script

- **Trigger**: When deploying to production
- **Source**: general
- **Tags**: [deployment]
- **Success Rate**: 0.20 (1/5)
- **Last Executed**: 2025-06-01
- **Status**: Retired
- **Retirement Reason**: Low success rate

**Steps:**

1. Build the project
2. Deploy to server

---

_Procedure Statistics_

- Total active: 2
- Total retired: 1
- Average success rate: 0.85
- Last updated: 2026-02-15
`,
  );
}

beforeEach(async () => {
  ensurePlanningDir();
  await backupFiles();
});

afterEach(async () => {
  await restoreFiles();
});

// ─── read-memory ─────────────────────────────────────────────────────────────

describe("memory bridge read-memory", () => {
  test("returns empty defaults when MEMORY.md does not exist", async () => {
    removeFile(MEMORY_PATH);
    removeFile(MEMORY_JSON_PATH);
    const { exitCode, json } = await runBridge("read-memory");
    expect(exitCode).toBe(0);
    expect(json.entries_count).toBe(0);
    expect(json.entries).toEqual([]);
    expect(json.total_tokens).toBe(0);
  });

  test("returns compact summary index without filters", async () => {
    await writeFixtureMemory();
    const { exitCode, json } = await runBridge("read-memory");
    expect(exitCode).toBe(0);
    expect(json.entries_count).toBeGreaterThan(0);
    expect(json.categories).toBeDefined();
    expect(json.total_tokens).toBeGreaterThan(0);
    // Summary entries should have id, title, category, tags, confidence but NOT content
    const first = json.entries[0];
    expect(first.id).toBeDefined();
    expect(first.title).toBeDefined();
    expect(first.category).toBeDefined();
    expect(first.tags).toBeDefined();
    expect(first.confidence).toBeDefined();
    expect(first.content).toBeUndefined();
  });

  test("filters by tags and returns full entries", async () => {
    await writeFixtureMemory();
    const { exitCode, json } = await runBridge("read-memory", "--tags=testing");
    expect(exitCode).toBe(0);
    expect(json.entries.length).toBeGreaterThan(0);
    // Full entries should have content
    for (const entry of json.entries) {
      expect(
        entry.tags.some((t: string) => t.toLowerCase() === "testing"),
      ).toBe(true);
    }
  });

  test("filters by category", async () => {
    await writeFixtureMemory();
    const { exitCode, json } = await runBridge(
      "read-memory",
      "--category=pitfall",
    );
    expect(exitCode).toBe(0);
    for (const entry of json.entries) {
      expect(entry.category).toBe("pitfall");
    }
  });

  test("applies limit", async () => {
    await writeFixtureMemory();
    const { exitCode, json } = await runBridge(
      "read-memory",
      "--tags=testing,coding,api,build,architecture,stack,debugging,preferences,ui",
      "--limit=2",
    );
    expect(exitCode).toBe(0);
    expect(json.entries.length).toBeLessThanOrEqual(2);
  });
});

// ─── read-memory --milestone ──────────────────────────────────────────────────

describe("memory bridge read-memory --milestone", () => {
  test("returns milestone-scoped scored results", async () => {
    await writeFixtureMemory();
    const { exitCode, json } = await runBridge(
      "read-memory",
      "--milestone=v1.6.0",
      "--tags=coding,stack",
    );
    expect(exitCode).toBe(0);
    expect(json.milestone).toBe("v1.6.0");
    expect(json.query_tags).toEqual(["coding", "stack"]);
    expect(json.total_scored).toBeGreaterThan(0);
    expect(json.entries.length).toBeGreaterThan(0);

    // Each entry should have score and milestone_proximity fields
    const first = json.entries[0];
    expect(first.score).toBeDefined();
    expect(typeof first.score).toBe("number");
    expect(first.milestone_proximity).toBeDefined();
    expect(typeof first.milestone_proximity).toBe("number");
    expect(first.tag_overlap).toBeDefined();
  });

  test("entries are sorted by score descending", async () => {
    await writeFixtureMemory();
    const { exitCode, json } = await runBridge(
      "read-memory",
      "--milestone=v1.6.0",
    );
    expect(exitCode).toBe(0);

    for (let i = 1; i < json.entries.length; i++) {
      expect(json.entries[i - 1].score).toBeGreaterThanOrEqual(
        json.entries[i].score,
      );
    }
  });

  test("same-milestone entries rank higher", async () => {
    await writeFixtureMemory();
    const { exitCode, json } = await runBridge(
      "read-memory",
      "--milestone=v1.6.0",
      "--tags=coding,stack",
    );
    expect(exitCode).toBe(0);

    // "Use Bun Over Node" has milestone v1.6.0 and tags [stack, coding]
    // so it should rank first (same milestone + tag match)
    const topEntry = json.entries[0];
    expect(topEntry.milestone).toBe("v1.6.0");
    expect(topEntry.milestone_proximity).toBe(1.0);
  });

  test("applies --limit to milestone results", async () => {
    await writeFixtureMemory();
    const { exitCode, json } = await runBridge(
      "read-memory",
      "--milestone=v1.6.0",
      "--limit=2",
    );
    expect(exitCode).toBe(0);
    expect(json.entries.length).toBeLessThanOrEqual(2);
    expect(json.total_scored).toBeGreaterThanOrEqual(json.entries.length);
  });

  test("entries without milestone get neutral proximity", async () => {
    await writeFixtureMemory();
    const { exitCode, json } = await runBridge(
      "read-memory",
      "--milestone=v1.6.0",
    );
    expect(exitCode).toBe(0);

    // "Import Path Gotcha" and "Dark Mode Always" have no milestone
    const noMilestone = json.entries.filter(
      (e: any) => e.milestone === undefined || e.milestone === null,
    );
    for (const entry of noMilestone) {
      expect(entry.milestone_proximity).toBe(0.5);
    }
  });

  test("read-memory without --milestone still works normally", async () => {
    await writeFixtureMemory();
    const { exitCode, json } = await runBridge("read-memory");
    expect(exitCode).toBe(0);
    // Standard summary mode: no score field
    expect(json.entries_count).toBeGreaterThan(0);
    expect(json.entries[0].score).toBeUndefined();
  });

  test("applies --category filter before milestone scoring", async () => {
    await writeFixtureMemory();
    const { exitCode, json } = await runBridge(
      "read-memory",
      "--milestone=v1.6.0",
      "--category=pattern",
    );
    expect(exitCode).toBe(0);

    // All entries should be patterns
    for (const entry of json.entries) {
      expect(entry.category).toBe("pattern");
    }
  });

  test("returns graceful empty when MEMORY.md does not exist", async () => {
    removeFile(MEMORY_PATH);
    removeFile(MEMORY_JSON_PATH);
    const { exitCode, json } = await runBridge(
      "read-memory",
      "--milestone=v1.6.0",
    );
    expect(exitCode).toBe(0);
    expect(json.entries).toEqual([]);
    expect(json.entries_count).toBe(0);
  });
});

// ─── read-working ────────────────────────────────────────────────────────────

describe("memory bridge read-working", () => {
  test("returns empty defaults when WORKING.md does not exist", async () => {
    removeFile(WORKING_PATH);
    removeFile(WORKING_JSON_PATH);
    const { exitCode, json } = await runBridge("read-working");
    expect(exitCode).toBe(0);
    expect(json.sections).toEqual([]);
    expect(json.total_tokens).toBe(0);
    expect(json.status).toBe("cleared");
  });

  test("returns parsed working memory structure", async () => {
    removeFile(WORKING_JSON_PATH);
    await writeFixtureWorking();
    const { exitCode, json } = await runBridge("read-working");
    expect(exitCode).toBe(0);
    expect(json.sections.length).toBeGreaterThan(0);
    expect(json.total_tokens).toBeGreaterThan(0);
    expect(json.status).toBe("active");

    // Check that known sections are present
    const sectionNames = json.sections.map((s: any) => s.name);
    expect(sectionNames).toContain("session_info");
    expect(sectionNames).toContain("findings");
  });
});

// ─── read-procedures ─────────────────────────────────────────────────────────

describe("memory bridge read-procedures", () => {
  test("returns empty defaults when PROCEDURES.md does not exist", async () => {
    removeFile(PROCEDURES_PATH);
    removeFile(PROCEDURES_JSON_PATH);
    const { exitCode, json } = await runBridge("read-procedures");
    expect(exitCode).toBe(0);
    expect(json.active_count).toBe(0);
    expect(json.retired_count).toBe(0);
    expect(json.entries).toEqual([]);
  });

  test("returns summary index without query", async () => {
    await writeFixtureProcedures();
    const { exitCode, json } = await runBridge("read-procedures");
    expect(exitCode).toBe(0);
    expect(json.active_count).toBe(2);
    expect(json.retired_count).toBe(1);
    expect(json.entries.length).toBe(3);

    // Summary entries should have id, title, trigger, tags, success_rate, status
    const first = json.entries[0];
    expect(first.id).toBeDefined();
    expect(first.title).toBeDefined();
    expect(first.trigger).toBeDefined();
    expect(first.success_rate).toBeDefined();
    expect(first.status).toBeDefined();
    // Should NOT have full steps in summary
    expect(first.steps).toBeUndefined();
  });

  test("returns scored recall with --query", async () => {
    await writeFixtureProcedures();
    const { exitCode, json } = await runBridge(
      "read-procedures",
      "--query=adding API endpoint",
      "--tags=api",
      "--limit=2",
    );
    expect(exitCode).toBe(0);
    expect(json.entries.length).toBeLessThanOrEqual(2);
    // Scored recall returns full entries (active only)
    if (json.entries.length > 0) {
      expect(json.entries[0].steps).toBeDefined();
      expect(json.entries[0].status).toBe("active");
    }
  });
});

// ─── check-context ───────────────────────────────────────────────────────────

describe("memory bridge check-context", () => {
  test("returns context usage with zone and breakdown", async () => {
    const { exitCode, json } = await runBridge("check-context");
    expect(exitCode).toBe(0);
    expect(json.total_tokens).toBeDefined();
    expect(json.budget_tokens).toBeDefined();
    expect(json.usage_percent).toBeDefined();
    expect(json.zone).toBeDefined();
    expect(json.breakdown).toBeDefined();
    expect(Array.isArray(json.breakdown)).toBe(true);
  });
});

// ─── check-compression ──────────────────────────────────────────────────────

describe("memory bridge check-compression", () => {
  test("returns compression assessment", async () => {
    const { exitCode, json } = await runBridge("check-compression");
    expect(exitCode).toBe(0);
    expect(typeof json.should_compress).toBe("boolean");
    expect(Array.isArray(json.triggers)).toBe(true);
    expect(Array.isArray(json.recommended_actions)).toBe(true);
    expect(Array.isArray(json.entry_recommendations)).toBe(true);
  });

  test("includes per-entry recommendations when MEMORY.md exists", async () => {
    await writeFixtureMemory();
    const { exitCode, json } = await runBridge("check-compression");
    expect(exitCode).toBe(0);
    expect(json.entry_recommendations.length).toBeGreaterThan(0);
    const rec = json.entry_recommendations[0];
    expect(rec.entry_id).toBeDefined();
    expect(rec.strategy).toBeDefined();
    expect(rec.priority).toBeDefined();
  });
});

// ─── append-working ──────────────────────────────────────────────────────────

describe("memory bridge append-working", () => {
  test("appends content to a section", async () => {
    removeFile(WORKING_JSON_PATH);
    await writeFixtureWorking();
    const { exitCode, json } = await runBridge(
      "append-working",
      "--section=findings",
      "--content=New finding from bridge test",
    );
    expect(exitCode).toBe(0);
    expect(json.section).toBe("findings");
    expect(json.total_tokens).toBeGreaterThan(0);
    expect(json.status).toBe("active");

    // Verify content was persisted
    const readResult = await runBridge("read-working");
    const findings = readResult.json.sections.find(
      (s: any) => s.name === "findings",
    );
    expect(findings.content).toContain("New finding from bridge test");
    // Original content should also still be there
    expect(findings.content).toContain("bridge pattern works well");
  });

  test("creates WORKING.md if it does not exist", async () => {
    removeFile(WORKING_PATH);
    removeFile(WORKING_JSON_PATH);
    const { exitCode, json } = await runBridge(
      "append-working",
      "--section=findings",
      "--content=First finding",
    );
    expect(exitCode).toBe(0);
    expect(json.section).toBe("findings");

    // Verify file was created
    const file = Bun.file(WORKING_PATH);
    expect(await file.exists()).toBe(true);
  });

  test("errors on missing --section argument", async () => {
    const { exitCode, stderr } = await runBridge(
      "append-working",
      "--content=test",
    );
    expect(exitCode).toBe(2);
    expect(stderr).toContain("Missing --section");
  });

  test("errors on missing --content argument", async () => {
    const { exitCode, stderr } = await runBridge(
      "append-working",
      "--section=findings",
    );
    expect(exitCode).toBe(2);
    expect(stderr).toContain("Missing --content");
  });

  test("errors on invalid section name", async () => {
    const { exitCode, stderr } = await runBridge(
      "append-working",
      "--section=nonexistent_section",
      "--content=test",
    );
    expect(exitCode).toBe(2);
    expect(stderr).toContain("Invalid section");
  });
});

// ─── clear-working ───────────────────────────────────────────────────────────

describe("memory bridge clear-working", () => {
  test("resets WORKING.md to empty state", async () => {
    await writeFixtureWorking();
    const { exitCode, json } = await runBridge("clear-working");
    expect(exitCode).toBe(0);
    expect(json.cleared).toBe(true);
    expect(json.status).toBe("cleared");
    expect(json.session_started_at).toBeDefined();

    // Verify file was cleared
    const readResult = await runBridge("read-working");
    expect(readResult.json.status).toBe("cleared");
    // All sections should have empty content
    for (const section of readResult.json.sections) {
      expect(section.content).toBe("");
    }
  });

  test("creates WORKING.md if it does not exist", async () => {
    removeFile(WORKING_PATH);
    removeFile(WORKING_JSON_PATH);
    const { exitCode, json } = await runBridge("clear-working");
    expect(exitCode).toBe(0);
    expect(json.cleared).toBe(true);

    const file = Bun.file(WORKING_PATH);
    expect(await file.exists()).toBe(true);
  });
});

// ─── update-procedure-stats ──────────────────────────────────────────────────

describe("memory bridge update-procedure-stats", () => {
  test("updates execution stats for success", async () => {
    removeFile(PROCEDURES_JSON_PATH);
    await writeFixtureProcedures();
    const { exitCode, json } = await runBridge(
      "update-procedure-stats",
      "--id=proc-add-api-endpoint",
      "--success=true",
    );
    expect(exitCode).toBe(0);
    expect(json.id).toBe("proc-add-api-endpoint");
    expect(json.execution_count).toBe(6); // was 5
    expect(json.success_count).toBe(5); // was 4
    expect(json.success_rate).toBeCloseTo(0.83, 1);
    expect(json.last_executed_at).toBeDefined();
  });

  test("updates execution stats for failure", async () => {
    removeFile(PROCEDURES_JSON_PATH);
    await writeFixtureProcedures();
    const { exitCode, json } = await runBridge(
      "update-procedure-stats",
      "--id=proc-add-api-endpoint",
      "--success=false",
    );
    expect(exitCode).toBe(0);
    expect(json.execution_count).toBe(6); // was 5
    expect(json.success_count).toBe(4); // unchanged
    expect(json.success_rate).toBeCloseTo(0.67, 1);
  });

  test("errors on missing --id argument", async () => {
    const { exitCode, stderr } = await runBridge(
      "update-procedure-stats",
      "--success=true",
    );
    expect(exitCode).toBe(2);
    expect(stderr).toContain("Missing --id");
  });

  test("errors on missing --success argument", async () => {
    const { exitCode, stderr } = await runBridge(
      "update-procedure-stats",
      "--id=proc-add-api-endpoint",
    );
    expect(exitCode).toBe(2);
    expect(stderr).toContain("Missing --success");
  });

  test("errors when procedure not found", async () => {
    await writeFixtureProcedures();
    const { exitCode, stderr } = await runBridge(
      "update-procedure-stats",
      "--id=proc-nonexistent",
      "--success=true",
    );
    expect(exitCode).toBe(2);
    expect(stderr).toContain("not found");
  });

  test("errors when procedures data does not exist", async () => {
    removeFile(PROCEDURES_PATH);
    removeFile(PROCEDURES_JSON_PATH);
    const { exitCode, stderr } = await runBridge(
      "update-procedure-stats",
      "--id=proc-add-api-endpoint",
      "--success=true",
    );
    expect(exitCode).toBe(2);
    expect(stderr).toContain("Failed to load");
  });
});

// ─── Round-trip tests ────────────────────────────────────────────────────────

describe("memory bridge round-trips", () => {
  test("append-working then read-working preserves content", async () => {
    removeFile(WORKING_PATH);
    removeFile(WORKING_JSON_PATH);

    // Write initial content
    await runBridge(
      "append-working",
      "--section=findings",
      "--content=Finding one",
    );

    // Append more content
    await runBridge(
      "append-working",
      "--section=findings",
      "--content=Finding two",
    );

    // Read back
    const { json } = await runBridge("read-working");
    const findings = json.sections.find((s: any) => s.name === "findings");
    expect(findings.content).toContain("Finding one");
    expect(findings.content).toContain("Finding two");
  });

  test("clear-working then append-working starts fresh", async () => {
    removeFile(WORKING_JSON_PATH);
    await writeFixtureWorking();

    // Clear
    await runBridge("clear-working");

    // Append fresh content
    await runBridge(
      "append-working",
      "--section=hypotheses",
      "--content=Fresh hypothesis",
    );

    // Read back -- should only have the fresh content
    const { json } = await runBridge("read-working");
    const hypotheses = json.sections.find((s: any) => s.name === "hypotheses");
    expect(hypotheses.content).toContain("Fresh hypothesis");
    // Original "Maybe we should add caching later" should be gone
    expect(hypotheses.content).not.toContain("caching later");
  });
});

// ─── Unknown subcommand ─────────────────────────────────────────────────────

describe("memory bridge unknown subcommand", () => {
  test("prints usage and exits with code 2", async () => {
    const { exitCode, stderr } = await runBridge("unknown-command");
    expect(exitCode).toBe(2);
    expect(stderr).toContain("Usage");
  });
});
