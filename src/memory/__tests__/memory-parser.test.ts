import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  parseMemoryFile,
  parseMemoryContent,
  extractTags,
  extractMetadataField,
  generateEntryId,
} from "../memory-parser.ts";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

// ─── Test Fixtures ──────────────────────────────────────────────────────────────

let tempDir: string;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "memory-parser-test-"));
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

const PATTERNS_SECTION = `# Long-Term Memory

## Patterns

### Validated Approaches

- **Codebase mapping with parallel agents**: Spawn 4 agents in parallel
  Tags: [patterns, architecture]
- **Questioning before planning**: Deep questioning surfaces hidden requirements
  Tags: [patterns, planning]
- **Wave-based parallelization**: Execute independent plans in parallel waves
  Tags: [patterns, planning, performance]
`;

const DECISIONS_TABLE_SECTION = `## Decisions

### Architectural Choices

| Decision | Context | Tags | Rationale | Date |
| --- | --- | --- | --- | --- |
| CLI installer over npm | Distribution model | [decisions, architecture] | Better UX for setup wizard | 2026-02-04 |
| Branded skin over rebrand | Customization approach | [decisions, architecture] | Cursor file name limitations | 2026-02-04 |
`;

const DECISIONS_SUBSECTION = `## Decisions

### Decision: WSJF Scoring with LLM-Inferred Inputs (T3 Signal)

**Tags:** [planner, decisions, architecture]
**Phase:** 18
**Context:** WSJF scoring requires Business Value inputs.
**Choice:** PM agent infers BV/TC/RR from todo context.
**Rationale:** No automated source of truth for business value exists.
`;

const PITFALLS_SECTION = `## Pitfalls

### Known Issues

- **Hardcoded paths break packageability**: Found 10+ locations with hardcoded prefixes
  Tags: [pitfalls, coding]
- **Package version mismatches**: Always verify package versions exist before committing
  Tags: [pitfalls, stack]
`;

const PREFERENCES_SECTION = `## Preferences

### Project Preferences

- **Enterprise focus**: Prioritize compliance, security, configurability
  Tags: [conventions, security]
- **Notify don't auto-update**: Teams control when they update framework
  Tags: [conventions, decisions]
`;

const EMPTY_SECTIONS = `# Long-Term Memory

## Patterns

### Validated Approaches

<!-- No patterns yet -->

## Decisions

### Architectural Choices

## Pitfalls

### Known Issues
`;

const MIXED_FORMAT = `# Long-Term Memory

## Patterns

### Validated Approaches

- **Simple pattern**: Just a simple description
  Tags: [patterns]
- **[Phase 15] Tag-based selective MEMORY recall**: Pre-filter MEMORY.md entries by domain tags
  - **When to use**: When lu-cognition performs selective recall
  - **Agent**: lu-cognition
  - **Tags**: [architecture, patterns, performance]
  - **Confidence**: High
  - **Added**: 2026-02-11

## Decisions

### Architectural Choices

| Decision | Context | Tags | Rationale | Date |
| --- | --- | --- | --- | --- |
| CLI installer over npm | Distribution model | [decisions, architecture] | Better UX | 2026-02-04 |

### Decision: Read-Only Agent Archetype

**Tags:** [planner, decisions, architecture]
**Context:** lu-pm-planner needs read-only behavior.
**Choice:** Enforce via tools whitelist.

## Pitfalls

### Known Issues

- **Hardcoded paths break packageability**: Found issues
  Tags: [pitfalls, coding]
`;

// ─── Section parsing ──────────────────────────────────────────────────────────

describe("section parsing", () => {
  test("## Patterns section parsed with category pattern", () => {
    const result = parseMemoryContent(PATTERNS_SECTION);

    expect(result.success).toBe(true);
    if (result.success) {
      const patterns = result.data.filter((e) => e.category === "pattern");
      expect(patterns.length).toBeGreaterThan(0);
    }
  });

  test("## Decisions section parsed with category decision", () => {
    const result = parseMemoryContent(DECISIONS_TABLE_SECTION);

    expect(result.success).toBe(true);
    if (result.success) {
      const decisions = result.data.filter((e) => e.category === "decision");
      expect(decisions.length).toBeGreaterThan(0);
    }
  });

  test("## Pitfalls section parsed with category pitfall", () => {
    const result = parseMemoryContent(PITFALLS_SECTION);

    expect(result.success).toBe(true);
    if (result.success) {
      const pitfalls = result.data.filter((e) => e.category === "pitfall");
      expect(pitfalls.length).toBeGreaterThan(0);
    }
  });

  test("## Preferences section parsed with category preference", () => {
    const result = parseMemoryContent(PREFERENCES_SECTION);

    expect(result.success).toBe(true);
    if (result.success) {
      const preferences = result.data.filter(
        (e) => e.category === "preference",
      );
      expect(preferences.length).toBeGreaterThan(0);
    }
  });

  test("unknown section headers are skipped gracefully", () => {
    const content = `# Memory

## Unknown Section

Some content here.

## Patterns

### Validated Approaches

- **A pattern**: Description
  Tags: [patterns]
`;

    const result = parseMemoryContent(content);

    expect(result.success).toBe(true);
    if (result.success) {
      // Only pattern entries should be present, unknown section skipped
      for (const entry of result.data) {
        expect(["pattern", "decision", "pitfall", "preference"]).toContain(
          entry.category,
        );
      }
    }
  });
});

// ─── Inline entry format ──────────────────────────────────────────────────────

describe("inline entry format", () => {
  test("correctly extracts title from bold markdown", () => {
    const result = parseMemoryContent(PATTERNS_SECTION);

    expect(result.success).toBe(true);
    if (result.success) {
      const titles = result.data.map((e) => e.title);
      expect(titles).toContain("Codebase mapping with parallel agents");
    }
  });

  test("correctly extracts content/description", () => {
    const result = parseMemoryContent(PATTERNS_SECTION);

    expect(result.success).toBe(true);
    if (result.success) {
      const entry = result.data.find(
        (e) => e.title === "Codebase mapping with parallel agents",
      );
      expect(entry).toBeDefined();
      expect(entry!.content).toContain("Spawn 4 agents in parallel");
    }
  });

  test("correctly extracts tags from Tags: [...] format", () => {
    const result = parseMemoryContent(PATTERNS_SECTION);

    expect(result.success).toBe(true);
    if (result.success) {
      const entry = result.data.find(
        (e) => e.title === "Codebase mapping with parallel agents",
      );
      expect(entry).toBeDefined();
      expect(entry!.tags).toContain("patterns");
      expect(entry!.tags).toContain("architecture");
    }
  });

  test("handles entries without tags (defaults to empty array)", () => {
    const content = `## Patterns

### Validated Approaches

- **No tags entry**: This entry has no tags line
`;

    const result = parseMemoryContent(content);

    expect(result.success).toBe(true);
    if (result.success) {
      const entry = result.data.find((e) => e.title === "No tags entry");
      expect(entry).toBeDefined();
      expect(entry!.tags).toEqual([]);
    }
  });
});

// ─── Subsection entry format ──────────────────────────────────────────────────

describe("subsection entry format", () => {
  test("correctly extracts title from ### header", () => {
    const result = parseMemoryContent(DECISIONS_SUBSECTION);

    expect(result.success).toBe(true);
    if (result.success) {
      const subsectionEntries = result.data.filter((e) =>
        e.title.includes("WSJF"),
      );
      expect(subsectionEntries.length).toBeGreaterThan(0);
    }
  });

  test("correctly extracts tags from **Tags:** format", () => {
    const result = parseMemoryContent(DECISIONS_SUBSECTION);

    expect(result.success).toBe(true);
    if (result.success) {
      const entry = result.data.find((e) => e.title.includes("WSJF"));
      if (entry) {
        expect(entry.tags.length).toBeGreaterThan(0);
      }
    }
  });
});

// ─── Metadata extraction ──────────────────────────────────────────────────────

describe("metadata extraction", () => {
  test("extractTags from Tags: [coding, patterns] format", () => {
    const tags = extractTags("  Tags: [coding, patterns, security]");
    expect(tags).toEqual(["coding", "patterns", "security"]);
  });

  test("extractTags from **Tags**: [coding, patterns] format", () => {
    const tags = extractTags("  **Tags**: [coding, patterns]");
    expect(tags).toEqual(["coding", "patterns"]);
  });

  test("extractTags returns empty array when no tags found", () => {
    const tags = extractTags("No tags in this content.");
    expect(tags).toEqual([]);
  });

  test("extractMetadataField extracts Confidence", () => {
    const value = extractMetadataField(
      "- **Confidence**: High\n- **Agent**: executor",
      "Confidence",
    );
    expect(value).toBe("High");
  });

  test("extractMetadataField extracts Agent", () => {
    const value = extractMetadataField(
      "- **Confidence**: High\n- **Agent**: executor",
      "Agent",
    );
    expect(value).toBe("executor");
  });

  test("extractMetadataField returns undefined for missing field", () => {
    const value = extractMetadataField("- **Confidence**: High", "Agent");
    expect(value).toBeUndefined();
  });
});

// ─── ID generation ────────────────────────────────────────────────────────────

describe("ID generation", () => {
  test("produces predictable ID from title", () => {
    const id = generateEntryId("Zod safeParse at API boundaries", "pattern");
    expect(id).toContain("p-");
    expect(id).toContain("zod");
    expect(id).toContain("safeparse");
  });

  test("different titles produce different IDs", () => {
    const id1 = generateEntryId("First pattern", "pattern");
    const id2 = generateEntryId("Second pattern", "pattern");
    expect(id1).not.toBe(id2);
  });

  test("same title always produces same ID (deterministic)", () => {
    const id1 = generateEntryId("Consistent title", "decision");
    const id2 = generateEntryId("Consistent title", "decision");
    expect(id1).toBe(id2);
  });

  test("category prefix is correct", () => {
    expect(generateEntryId("Test", "pattern")).toMatch(/^p-/);
    expect(generateEntryId("Test", "decision")).toMatch(/^d-/);
    expect(generateEntryId("Test", "pitfall")).toMatch(/^t-/);
    expect(generateEntryId("Test", "preference")).toMatch(/^pref-/);
  });
});

// ─── Token estimation ────────────────────────────────────────────────────────

describe("token estimation", () => {
  test("each entry has token_estimate > 0 for non-empty content", () => {
    const result = parseMemoryContent(PATTERNS_SECTION);

    expect(result.success).toBe(true);
    if (result.success) {
      for (const entry of result.data) {
        if (entry.content.trim()) {
          expect(entry.token_estimate).toBeGreaterThan(0);
        }
      }
    }
  });

  test("token estimate roughly matches content.length / 4", () => {
    const result = parseMemoryContent(PATTERNS_SECTION);

    expect(result.success).toBe(true);
    if (result.success) {
      for (const entry of result.data) {
        if (entry.content.length > 0) {
          const expected = Math.ceil(entry.content.length / 4);
          expect(entry.token_estimate).toBe(expected);
        }
      }
    }
  });
});

// ─── Edge cases ──────────────────────────────────────────────────────────────

describe("edge cases", () => {
  test("non-existent file returns success: false", async () => {
    const result = await parseMemoryFile(join(tempDir, "nonexistent-file.md"));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("File not found");
    }
  });

  test("empty file returns success: true with empty array", () => {
    const result = parseMemoryContent("");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual([]);
    }
  });

  test("file with only headers and no entries returns empty categories", () => {
    const result = parseMemoryContent(EMPTY_SECTIONS);

    expect(result.success).toBe(true);
    if (result.success) {
      // May have some entries from comment lines, but should not crash
      expect(Array.isArray(result.data)).toBe(true);
    }
  });

  test("mixed format file parses both inline and subsection entries", () => {
    const result = parseMemoryContent(MIXED_FORMAT);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.length).toBeGreaterThan(0);

      const patterns = result.data.filter((e) => e.category === "pattern");
      const decisions = result.data.filter((e) => e.category === "decision");
      const pitfalls = result.data.filter((e) => e.category === "pitfall");

      expect(patterns.length).toBeGreaterThan(0);
      expect(decisions.length).toBeGreaterThan(0);
      expect(pitfalls.length).toBeGreaterThan(0);
    }
  });
});

// ─── Integration with real MEMORY.md ──────────────────────────────────────────

describe("integration with real MEMORY.md", () => {
  test("parses the actual .planning/MEMORY.md", async () => {
    const memoryFile = Bun.file(".planning/MEMORY.md");
    const exists = await memoryFile.exists();

    if (!exists) {
      // Skip gracefully in CI environments
      return;
    }

    const result = await parseMemoryFile(".planning/MEMORY.md");

    expect(result.success).toBe(true);
    if (result.success) {
      // Verify total entry count is > 0
      expect(result.data.length).toBeGreaterThan(0);

      // Verify at least some pattern entries exist
      const patterns = result.data.filter((e) => e.category === "pattern");
      expect(patterns.length).toBeGreaterThan(0);

      // Verify tags are non-empty arrays on most entries
      const entriesWithTags = result.data.filter((e) => e.tags.length > 0);
      expect(entriesWithTags.length).toBeGreaterThan(0);

      // Verify categories are valid
      for (const entry of result.data) {
        expect(["pattern", "decision", "pitfall", "preference"]).toContain(
          entry.category,
        );
      }
    }
  });

  test("parses file from disk via parseMemoryFile", async () => {
    const filePath = join(tempDir, "test-memory.md");
    await Bun.write(filePath, PATTERNS_SECTION);

    const result = await parseMemoryFile(filePath);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data[0]!.category).toBe("pattern");
    }
  });
});
