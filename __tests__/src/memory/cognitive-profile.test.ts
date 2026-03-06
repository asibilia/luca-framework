/**
 * Tests for cognitive profile export/import.
 */
import { test, expect, describe } from "bun:test";
import {
  CognitiveProfileSchema,
  exportCognitiveProfile,
  importCognitiveProfile,
} from "../../../src/memory/__helpers/cognitive-profile";
import {
  brainSchema,
  memoryEntrySchema,
} from "../../../src/memory/__schemas/memory.schemas";

import type {
  Brain,
  MemoryEntry,
} from "../../../src/memory/__schemas/memory.schemas";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const makeBrain = (overrides: Partial<Brain> = {}): Brain =>
  brainSchema.parse({
    project_name: "TestProject",
    domain: "testing",
    purpose: "Unit test fixture",
    stack: {
      language: "TypeScript",
      framework: "Bun",
      build: "bun",
      testing: "bun:test",
    },
    development_preferences: { runtime: "bun", style: "functional" },
    updated_at: "2024-01-01T00:00:00Z",
    ...overrides,
  });

const makeEntry = (overrides: Partial<MemoryEntry> = {}): MemoryEntry =>
  memoryEntrySchema.parse({
    id: "entry-1",
    category: "pattern",
    title: "Test Pattern",
    content: "Always use bun:test",
    tags: ["testing"],
    agent: "general",
    confidence: "high",
    added_at: "2024-01-01T00:00:00Z",
    recall_count: 3,
    token_estimate: 20,
    ...overrides,
  });

// ─── Schema Tests ────────────────────────────────────────────────────────────

describe("CognitiveProfileSchema", () => {
  test("validates a well-formed profile", () => {
    const brain = makeBrain();
    const profile = {
      version: 1,
      exported_at: "2024-01-01T00:00:00Z",
      source_project: "TestProject",
      brain,
      entries: [makeEntry()],
      domain_tags: ["testing"],
    };

    const result = CognitiveProfileSchema.safeParse(profile);
    expect(result.success).toBe(true);
  });

  test("rejects invalid version", () => {
    const result = CognitiveProfileSchema.safeParse({
      version: 2,
      exported_at: "2024-01-01T00:00:00Z",
      source_project: "X",
      brain: makeBrain(),
      entries: [],
      domain_tags: [],
    });
    expect(result.success).toBe(false);
  });
});

// ─── Export Tests ────────────────────────────────────────────────────────────

describe("exportCognitiveProfile", () => {
  test("includes high-confidence entries", () => {
    const brain = makeBrain();
    const entries = [
      makeEntry({ id: "e1", confidence: "high", category: "pattern" }),
      makeEntry({ id: "e2", confidence: "low", category: "pattern" }),
    ];

    const profile = exportCognitiveProfile(brain, entries);
    expect(profile.entries).toHaveLength(1);
    expect(profile.entries[0]!.id).toBe("e1");
  });

  test("includes medium-confidence patterns and decisions", () => {
    const brain = makeBrain();
    const entries = [
      makeEntry({ id: "e1", confidence: "medium", category: "pattern" }),
      makeEntry({ id: "e2", confidence: "medium", category: "decision" }),
      makeEntry({ id: "e3", confidence: "medium", category: "pitfall" }),
    ];

    const profile = exportCognitiveProfile(brain, entries);
    expect(profile.entries).toHaveLength(2);
    expect(profile.entries.map((e) => e.id).sort()).toEqual(["e1", "e2"]);
  });

  test("collects domain tags from included entries", () => {
    const brain = makeBrain();
    const entries = [
      makeEntry({ id: "e1", confidence: "high", tags: ["testing", "bun"] }),
      makeEntry({ id: "e2", confidence: "high", tags: ["bun", "memory"] }),
    ];

    const profile = exportCognitiveProfile(brain, entries);
    expect(profile.domain_tags).toEqual(["bun", "memory", "testing"]);
  });

  test("sets source_project from brain", () => {
    const brain = makeBrain({ project_name: "MyProject" });
    const profile = exportCognitiveProfile(brain, []);
    expect(profile.source_project).toBe("MyProject");
  });

  test("returns empty entries when none qualify", () => {
    const brain = makeBrain();
    const entries = [makeEntry({ confidence: "low" })];
    const profile = exportCognitiveProfile(brain, entries);
    expect(profile.entries).toHaveLength(0);
  });
});

// ─── Import Tests ────────────────────────────────────────────────────────────

describe("importCognitiveProfile", () => {
  test("adds non-duplicate entries", () => {
    const profile = exportCognitiveProfile(
      makeBrain({ project_name: "Source" }),
      [makeEntry({ id: "new-1", confidence: "high", title: "New Pattern" })],
    );

    const existingBrain = makeBrain({ project_name: "Target" });
    const existingMemory = [makeEntry({ id: "existing-1", title: "Existing" })];

    const { entries, result } = importCognitiveProfile(
      profile,
      existingBrain,
      existingMemory,
    );
    expect(result.entries_added).toBe(1);
    expect(result.entries_skipped).toBe(0);
    expect(entries).toHaveLength(2);
  });

  test("skips entries with duplicate ids", () => {
    const profile = exportCognitiveProfile(makeBrain(), [
      makeEntry({ id: "dup-id", confidence: "high", title: "Dup" }),
    ]);

    const existingMemory = [makeEntry({ id: "dup-id", title: "Already Here" })];

    const { result } = importCognitiveProfile(
      profile,
      makeBrain(),
      existingMemory,
    );
    expect(result.entries_added).toBe(0);
    expect(result.entries_skipped).toBe(1);
  });

  test("skips entries with duplicate titles (case-insensitive)", () => {
    const profile = exportCognitiveProfile(makeBrain(), [
      makeEntry({ id: "unique-id", confidence: "high", title: "Same Title" }),
    ]);

    const existingMemory = [makeEntry({ id: "other-id", title: "same title" })];

    const { result } = importCognitiveProfile(
      profile,
      makeBrain(),
      existingMemory,
    );
    expect(result.entries_added).toBe(0);
    expect(result.entries_skipped).toBe(1);
  });

  test("merges development preferences without overwriting", () => {
    const sourceBrain = makeBrain({
      development_preferences: { runtime: "node", newPref: "imported" },
    });
    const profile = exportCognitiveProfile(sourceBrain, []);

    const existingBrain = makeBrain({
      development_preferences: { runtime: "bun", style: "functional" },
    });

    const { brain, result } = importCognitiveProfile(
      profile,
      existingBrain,
      [],
    );
    expect(brain.development_preferences.runtime).toBe("bun"); // not overwritten
    expect(brain.development_preferences.newPref).toBe("imported"); // filled gap
    expect(brain.development_preferences.style).toBe("functional"); // preserved
    expect(result.brain_updated).toBe(true);
  });

  test("marks brain_updated false when no new preferences", () => {
    const sourceBrain = makeBrain({
      development_preferences: { runtime: "bun" },
    });
    const profile = exportCognitiveProfile(sourceBrain, []);

    const existingBrain = makeBrain({
      development_preferences: { runtime: "bun" },
    });

    const { result } = importCognitiveProfile(profile, existingBrain, []);
    expect(result.brain_updated).toBe(false);
  });

  test("tags imported entries with source project", () => {
    const profile = exportCognitiveProfile(
      makeBrain({ project_name: "SourceProj" }),
      [makeEntry({ id: "imp-1", confidence: "high", title: "Imported" })],
    );

    const { entries } = importCognitiveProfile(profile, makeBrain(), []);
    const imported = entries.find((e) => e.id === "imp-1");
    expect(imported?.agent).toBe("imported:SourceProj");
  });
});
