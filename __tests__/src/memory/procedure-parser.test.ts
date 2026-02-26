import { describe, test, expect } from "bun:test";
import {
  parseProcedureContent,
  serializeProcedures,
  generateProcedureId,
} from "../../../src/memory/__helpers/procedure-parser.ts";
import {
  procedureEntrySchema,
  procedureStepSchema,
} from "~/memory/__schemas/memory.schemas";

// ─── Test Fixtures ──────────────────────────────────────────────────────────────

const WELL_FORMED_CONTENT = `# Procedures

> Executable learned procedures extracted from successful executions.
> Recalled during planning to suggest proven step sequences.

## Active Procedures

### Deploy Feature Branch

- **Trigger**: When a feature branch is ready for staging deployment
- **Source**: lu-executor (Phase 35)
- **Tags**: [deployment, ci-cd, git]
- **Success Rate**: 0.90 (9/10)
- **Last Executed**: 2026-02-13
- **Status**: Active

**Steps:**

1. Run test suite
2. Build artifacts -> output: dist directory
3. Push to staging [tool: lu-deployer]

---

### Add Zod Schema Validation

- **Trigger**: When adding a new API endpoint or data model
- **Source**: lu-architect (Phase 30)
- **Tags**: [validation, zod, api]
- **Success Rate**: 1.00 (4/4)
- **Last Executed**: 2026-02-12
- **Status**: Active

**Steps:**

1. Define Zod schema with snake_case fields
2. Export type via z.infer
3. Add safeParse to handler -> output: validated data
4. Write test cases [tool: bun-test]

---

## Retired Procedures

<!-- Procedures with success rate below threshold or marked obsolete -->

---

_Procedure Statistics_

- Total active: 2
- Total retired: 0
- Average success rate: 0.95
- Last updated: 2026-02-14
`;

const MIXED_ACTIVE_RETIRED_CONTENT = `# Procedures

## Active Procedures

### Active Procedure One

- **Trigger**: When setting up a new module
- **Source**: lu-executor (Phase 10)
- **Tags**: [setup, modules]
- **Success Rate**: 0.75 (3/4)
- **Last Executed**: 2026-02-10
- **Status**: Active

**Steps:**

1. Create directory structure
2. Add index barrel file
3. Write initial tests

---

## Retired Procedures

### Old Deployment Flow

- **Trigger**: When deploying to production
- **Source**: general
- **Tags**: [legacy, deployment]
- **Success Rate**: 0.20 (1/5)
- **Status**: Retired
- **Retirement Reason**: Low success rate (0.20 after 5 executions)

**Steps:**

1. Run manual checks
2. Deploy via script

---

_Procedure Statistics_

- Total active: 1
- Total retired: 1
- Average success rate: 0.75
- Last updated: 2026-02-14
`;

const STEPS_WITH_METADATA = `# Procedures

## Active Procedures

### Complex Step Procedure

- **Trigger**: When performing complex data migration
- **Source**: lu-executor (Phase 22)
- **Tags**: [data, migration]
- **Success Rate**: 0.67 (2/3)
- **Last Executed**: 2026-02-11
- **Status**: Active

**Steps:**

1. Backup existing database -> output: backup file
2. Run migration script [tool: lu-migrator]
3. Validate data integrity -> output: validation report
4. Notify stakeholders [tool: lu-notifier]

---

## Retired Procedures

---
`;

const MINIMAL_PROCEDURE = `# Procedures

## Active Procedures

### Minimal Setup

- **Trigger**: When bootstrapping a test file
- **Source**: general
- **Tags**: []
- **Success Rate**: 0.50 (1/2)
- **Status**: Active

**Steps:**

1. Create test file
2. Add imports

---

## Retired Procedures

---
`;

// ─── Parse well-formed content ───────────────────────────────────────────────

describe("parse well-formed content", () => {
  test("parses active entries with steps, metadata, and tags", () => {
    const result = parseProcedureContent(WELL_FORMED_CONTENT);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.length).toBe(2);

    const deploy = result.data.find((e) => e.title === "Deploy Feature Branch");
    expect(deploy).toBeDefined();
    expect(deploy!.trigger).toBe(
      "When a feature branch is ready for staging deployment",
    );
    expect(deploy!.source_agent).toBe("lu-executor");
    expect(deploy!.source_phase).toBe(35);
    expect(deploy!.tags).toEqual(["deployment", "ci-cd", "git"]);
    expect(deploy!.success_rate).toBe(0.9);
    expect(deploy!.success_count).toBe(9);
    expect(deploy!.execution_count).toBe(10);
    expect(deploy!.last_executed_at).toBe("2026-02-13");
    expect(deploy!.status).toBe("active");
    expect(deploy!.steps.length).toBe(3);

    const zodProc = result.data.find(
      (e) => e.title === "Add Zod Schema Validation",
    );
    expect(zodProc).toBeDefined();
    expect(zodProc!.steps.length).toBe(4);
    expect(zodProc!.success_rate).toBe(1.0);
    expect(zodProc!.execution_count).toBe(4);
    expect(zodProc!.tags).toContain("zod");
  });

  test("generates correct IDs for parsed entries", () => {
    const result = parseProcedureContent(WELL_FORMED_CONTENT);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const deploy = result.data.find((e) => e.title === "Deploy Feature Branch");
    expect(deploy!.id).toBe("proc-deploy-feature-branch");

    const zodProc = result.data.find(
      (e) => e.title === "Add Zod Schema Validation",
    );
    expect(zodProc!.id).toBe("proc-add-zod-schema-validation");
  });
});

// ─── Parse content with retired entries ──────────────────────────────────────

describe("parse content with retired entries", () => {
  test("parses both active and retired entries with correct status", () => {
    const result = parseProcedureContent(MIXED_ACTIVE_RETIRED_CONTENT);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.length).toBe(2);

    const active = result.data.filter((e) => e.status === "active");
    const retired = result.data.filter((e) => e.status === "retired");

    expect(active.length).toBe(1);
    expect(retired.length).toBe(1);

    expect(active[0]!.title).toBe("Active Procedure One");
    expect(retired[0]!.title).toBe("Old Deployment Flow");
    expect(retired[0]!.retirement_reason).toBe(
      "Low success rate (0.20 after 5 executions)",
    );
  });
});

// ─── Parse empty content ─────────────────────────────────────────────────────

describe("parse empty content", () => {
  test("returns empty array for empty content", () => {
    const result = parseProcedureContent("");

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual([]);
  });

  test("returns empty array for whitespace-only content", () => {
    const result = parseProcedureContent("   \n\n   ");

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual([]);
  });
});

// ─── Parse content with missing optional fields ──────────────────────────────

describe("parse content with missing optional fields", () => {
  test("handles missing expected_output, tool, last_executed_at, and source_phase", () => {
    const result = parseProcedureContent(MINIMAL_PROCEDURE);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.length).toBe(1);
    const entry = result.data[0]!;

    expect(entry.title).toBe("Minimal Setup");
    expect(entry.source_agent).toBe("general");
    expect(entry.source_phase).toBeUndefined();
    expect(entry.last_executed_at).toBeUndefined();

    // Steps should not have expected_output or tool
    for (const step of entry.steps) {
      expect(step.expected_output).toBeUndefined();
      expect(step.tool).toBeUndefined();
    }
  });
});

// ─── generateProcedureId ─────────────────────────────────────────────────────

describe("generateProcedureId", () => {
  test("produces correct format from title", () => {
    const id = generateProcedureId("Add security hardening");
    expect(id).toBe("proc-add-security-hardening");
  });

  test("handles special characters and long titles", () => {
    const id = generateProcedureId(
      "Deploy (production) — with rollback & monitoring!",
    );
    expect(id).toMatch(/^proc-/);
    expect(id).not.toContain("(");
    expect(id).not.toContain(")");
    expect(id).not.toContain("!");
    expect(id).not.toContain("&");
    expect(id).not.toContain("—");

    // Long title should be truncated (slug max 50 chars)
    const longTitle =
      "This is a very long procedure title that exceeds fifty characters in its slug form when converted";
    const longId = generateProcedureId(longTitle);
    // "proc-" is 5 chars, slug is max 50, total max 55
    expect(longId.length).toBeLessThanOrEqual(55);
    expect(longId).toMatch(/^proc-/);
  });

  test("same title produces same ID (deterministic)", () => {
    const id1 = generateProcedureId("Consistent procedure");
    const id2 = generateProcedureId("Consistent procedure");
    expect(id1).toBe(id2);
  });

  test("different titles produce different IDs", () => {
    const id1 = generateProcedureId("First procedure");
    const id2 = generateProcedureId("Second procedure");
    expect(id1).not.toBe(id2);
  });
});

// ─── serializeProcedures ─────────────────────────────────────────────────────

describe("serializeProcedures", () => {
  test("produces valid markdown with Active and Retired sections", () => {
    const result = parseProcedureContent(MIXED_ACTIVE_RETIRED_CONTENT);
    expect(result.success).toBe(true);
    if (!result.success) return;

    const markdown = serializeProcedures(result.data);

    expect(markdown).toContain("# Procedures");
    expect(markdown).toContain("## Active Procedures");
    expect(markdown).toContain("## Retired Procedures");
    expect(markdown).toContain("### Active Procedure One");
    expect(markdown).toContain("### Old Deployment Flow");
    expect(markdown).toContain("- **Status**: Active");
    expect(markdown).toContain("- **Status**: Retired");
    expect(markdown).toContain(
      "- **Retirement Reason**: Low success rate (0.20 after 5 executions)",
    );
  });

  test("serializes empty entries with placeholder comments", () => {
    const markdown = serializeProcedures([]);

    expect(markdown).toContain("## Active Procedures");
    expect(markdown).toContain("## Retired Procedures");
    expect(markdown).toContain(
      "<!-- No procedures extracted yet. Procedures are added by lu-learner after successful phase executions. -->",
    );
    expect(markdown).toContain(
      "<!-- Procedures with success rate below threshold or marked obsolete -->",
    );
  });

  test("statistics footer correctly rendered", () => {
    const result = parseProcedureContent(MIXED_ACTIVE_RETIRED_CONTENT);
    expect(result.success).toBe(true);
    if (!result.success) return;

    const markdown = serializeProcedures(result.data);

    expect(markdown).toContain("_Procedure Statistics_");
    expect(markdown).toContain("- Total active: 1");
    expect(markdown).toContain("- Total retired: 1");
    expect(markdown).toContain("- Average success rate: 0.75");
    expect(markdown).toContain("- Last updated:");
  });
});

// ─── Round-trip ──────────────────────────────────────────────────────────────

describe("round-trip", () => {
  test("parse -> serialize -> parse produces equivalent entries", () => {
    const firstParse = parseProcedureContent(WELL_FORMED_CONTENT);
    expect(firstParse.success).toBe(true);
    if (!firstParse.success) return;

    const serialized = serializeProcedures(firstParse.data);
    const secondParse = parseProcedureContent(serialized);

    expect(secondParse.success).toBe(true);
    if (!secondParse.success) return;

    // Same number of entries
    expect(secondParse.data.length).toBe(firstParse.data.length);

    // Same IDs
    const firstIds = firstParse.data.map((e) => e.id).sort();
    const secondIds = secondParse.data.map((e) => e.id).sort();
    expect(secondIds).toEqual(firstIds);

    // Same step counts per entry
    for (const first of firstParse.data) {
      const second = secondParse.data.find((e) => e.id === first.id);
      expect(second).toBeDefined();
      expect(second!.steps.length).toBe(first.steps.length);
      expect(second!.status).toBe(first.status);
      expect(second!.trigger).toBe(first.trigger);
      expect(second!.source_agent).toBe(first.source_agent);
      expect(second!.source_phase).toBe(first.source_phase);
      expect(second!.tags).toEqual(first.tags);
    }
  });
});

// ─── Steps with expected_output and tool ─────────────────────────────────────

describe("steps with expected_output and tool", () => {
  test("parses steps with -> output: and [tool:] markers", () => {
    const result = parseProcedureContent(STEPS_WITH_METADATA);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const entry = result.data[0]!;
    expect(entry.steps.length).toBe(4);

    // Step 1: has expected_output, no tool
    expect(entry.steps[0]!.order).toBe(1);
    expect(entry.steps[0]!.action).toBe("Backup existing database");
    expect(entry.steps[0]!.expected_output).toBe("backup file");
    expect(entry.steps[0]!.tool).toBeUndefined();

    // Step 2: has tool, no expected_output
    expect(entry.steps[1]!.order).toBe(2);
    expect(entry.steps[1]!.action).toBe("Run migration script");
    expect(entry.steps[1]!.expected_output).toBeUndefined();
    expect(entry.steps[1]!.tool).toBe("lu-migrator");

    // Step 3: has expected_output, no tool
    expect(entry.steps[2]!.order).toBe(3);
    expect(entry.steps[2]!.action).toBe("Validate data integrity");
    expect(entry.steps[2]!.expected_output).toBe("validation report");

    // Step 4: has tool, no expected_output
    expect(entry.steps[3]!.order).toBe(4);
    expect(entry.steps[3]!.action).toBe("Notify stakeholders");
    expect(entry.steps[3]!.tool).toBe("lu-notifier");
  });
});

// ─── Parse success rate ──────────────────────────────────────────────────────

describe("parse success rate", () => {
  test("parses formatted string '0.83 (5/6)' correctly", () => {
    const content = `# Procedures

## Active Procedures

### Rate Test Procedure

- **Trigger**: When testing rate parsing
- **Source**: lu-executor (Phase 20)
- **Tags**: [testing]
- **Success Rate**: 0.83 (5/6)
- **Status**: Active

**Steps:**

1. Test step

---

## Retired Procedures

---
`;

    const result = parseProcedureContent(content);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const entry = result.data[0]!;
    expect(entry.success_rate).toBe(0.83);
    expect(entry.success_count).toBe(5);
    expect(entry.execution_count).toBe(6);
  });
});

// ─── Invalid entries ─────────────────────────────────────────────────────────

describe("invalid entries", () => {
  test("skips entries without trigger without crashing", () => {
    const content = `# Procedures

## Active Procedures

### Missing Trigger Procedure

- **Source**: general
- **Tags**: [broken]
- **Success Rate**: 0.50 (1/2)
- **Status**: Active

**Steps:**

1. Step one

---

### Valid Procedure

- **Trigger**: When doing something valid
- **Source**: general
- **Tags**: [valid]
- **Success Rate**: 1.00 (2/2)
- **Status**: Active

**Steps:**

1. Do the thing

---

## Retired Procedures

---
`;

    const result = parseProcedureContent(content);

    expect(result.success).toBe(true);
    if (!result.success) return;

    // Should have skipped the invalid entry and kept the valid one
    expect(result.data.length).toBe(1);
    expect(result.data[0]!.title).toBe("Valid Procedure");
  });

  test("handles content with no procedure sections gracefully", () => {
    const content = `# Some Other Document

Just random markdown content with no Active or Retired Procedures sections.
`;

    const result = parseProcedureContent(content);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual([]);
  });
});

// ─── Schema validation ──────────────────────────────────────────────────────

describe("schema validation", () => {
  test("procedureStepSchema validates correct step", () => {
    const step = { order: 1, action: "Do something" };
    const result = procedureStepSchema.safeParse(step);
    expect(result.success).toBe(true);
  });

  test("procedureStepSchema rejects invalid order", () => {
    const step = { order: -1, action: "Do something" };
    const result = procedureStepSchema.safeParse(step);
    expect(result.success).toBe(false);
  });

  test("procedureEntrySchema applies correct defaults", () => {
    const entry = {
      id: "proc-test",
      title: "Test",
      trigger: "When testing",
      steps: [{ order: 1, action: "Step one" }],
      added_at: "2026-02-14T00:00:00Z",
    };
    const result = procedureEntrySchema.safeParse(entry);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.tags).toEqual([]);
    expect(result.data.source_agent).toBe("general");
    expect(result.data.execution_count).toBe(0);
    expect(result.data.success_count).toBe(0);
    expect(result.data.success_rate).toBe(0);
    expect(result.data.token_estimate).toBe(0);
    expect(result.data.status).toBe("active");
  });
});
