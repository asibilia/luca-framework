import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  estimateTokens,
  estimateFileTokens,
  estimateMemoryBudget,
} from "../../../src/memory/__helpers/token-estimator.ts";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

// ─── Test Fixtures ─────────────────────────────────────────────────────────────

let tempDir: string;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "token-estimator-test-"));
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

// ─── estimateTokens ────────────────────────────────────────────────────────────

describe("estimateTokens", () => {
  test("empty string returns 0", () => {
    expect(estimateTokens("")).toBe(0);
  });

  test("'hello world' (11 chars) returns 3 tokens", () => {
    // 11 / 4 = 2.75, ceil = 3
    expect(estimateTokens("hello world")).toBe(3);
  });

  test("single character returns 1", () => {
    // 1 / 4 = 0.25, ceil = 1
    expect(estimateTokens("a")).toBe(1);
  });

  test("exactly 4 chars returns 1 token", () => {
    // 4 / 4 = 1, ceil = 1
    expect(estimateTokens("abcd")).toBe(1);
  });

  test("5 chars returns 2 tokens", () => {
    // 5 / 4 = 1.25, ceil = 2
    expect(estimateTokens("abcde")).toBe(2);
  });

  test("long text (~1000 chars) returns ~250 tokens", () => {
    const longText = "a".repeat(1000);
    // 1000 / 4 = 250 exactly
    expect(estimateTokens(longText)).toBe(250);
  });

  test("unicode text estimates based on string length, not byte length", () => {
    // Each emoji is 1-2 chars in JS string length but more bytes in UTF-8
    const emoji = "\u{1F600}"; // grinning face, 2 chars in JS
    const text = emoji.repeat(10); // 20 chars in JS
    // 20 / 4 = 5
    expect(estimateTokens(text)).toBe(5);
  });

  test("null-ish input returns 0", () => {
    // The function checks !text, so empty string or undefined-coerced values
    expect(estimateTokens("")).toBe(0);
  });
});

// ─── estimateFileTokens ────────────────────────────────────────────────────────

describe("estimateFileTokens", () => {
  test("existing file returns token count matching content length / 4", async () => {
    const content = "This is a test file with some content for estimation.";
    const filePath = join(tempDir, "test-file.txt");
    await Bun.write(filePath, content);

    const result = await estimateFileTokens(filePath);

    expect(result.success).toBe(true);
    if (result.success) {
      const expectedTokens = Math.ceil(content.length / 4);
      expect(result.data.tokens).toBe(expectedTokens);
      expect(result.data.bytes).toBeGreaterThan(0);
    }
  });

  test("non-existent file returns success: false with error message", async () => {
    const result = await estimateFileTokens(
      join(tempDir, "nonexistent-file.txt"),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("File not found");
    }
  });

  test("empty file returns tokens: 0 and bytes: 0", async () => {
    const filePath = join(tempDir, "empty-file.txt");
    await Bun.write(filePath, "");

    const result = await estimateFileTokens(filePath);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tokens).toBe(0);
      expect(result.data.bytes).toBe(0);
    }
  });

  test("file byte count reflects content encoding", async () => {
    const content = "Hello, world!"; // 13 chars, 13 bytes in UTF-8
    const filePath = join(tempDir, "ascii-file.txt");
    await Bun.write(filePath, content);

    const result = await estimateFileTokens(filePath);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.bytes).toBe(13);
    }
  });
});

// ─── estimateMemoryBudget ──────────────────────────────────────────────────────

describe("estimateMemoryBudget", () => {
  test("multiple existing files aggregates correctly", async () => {
    const file1Content = "First file content here.";
    const file2Content = "Second file with different content.";
    const file1Path = join(tempDir, "budget-file1.txt");
    const file2Path = join(tempDir, "budget-file2.txt");
    await Bun.write(file1Path, file1Content);
    await Bun.write(file2Path, file2Content);

    const result = await estimateMemoryBudget([file1Path, file2Path]);

    expect(result.success).toBe(true);
    if (result.success) {
      const expected1 = Math.ceil(file1Content.length / 4);
      const expected2 = Math.ceil(file2Content.length / 4);

      expect(result.data.total_tokens).toBe(expected1 + expected2);
      expect(result.data.breakdown).toHaveLength(2);
      expect(result.data.breakdown[0]!.source).toBe(file1Path);
      expect(result.data.breakdown[0]!.tokens).toBe(expected1);
      expect(result.data.breakdown[1]!.source).toBe(file2Path);
      expect(result.data.breakdown[1]!.tokens).toBe(expected2);
      expect(result.data.timestamp).toBeDefined();
    }
  });

  test("mix of existing and missing files skips missing in breakdown", async () => {
    const fileContent = "Existing file content.";
    const existingPath = join(tempDir, "budget-existing.txt");
    const missingPath = join(tempDir, "budget-missing.txt");
    await Bun.write(existingPath, fileContent);

    const result = await estimateMemoryBudget([existingPath, missingPath]);

    expect(result.success).toBe(true);
    if (result.success) {
      // Only the existing file should be in the breakdown
      expect(result.data.breakdown).toHaveLength(1);
      expect(result.data.breakdown[0]!.source).toBe(existingPath);
      expect(result.data.total_tokens).toBe(Math.ceil(fileContent.length / 4));
    }
  });

  test("empty path array returns total_tokens: 0 with empty breakdown", async () => {
    const result = await estimateMemoryBudget([]);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.total_tokens).toBe(0);
      expect(result.data.breakdown).toHaveLength(0);
      expect(result.data.timestamp).toBeDefined();
    }
  });

  test("breakdown entries include source, tokens, and bytes", async () => {
    const content = "Test content for breakdown verification.";
    const filePath = join(tempDir, "budget-breakdown.txt");
    await Bun.write(filePath, content);

    const result = await estimateMemoryBudget([filePath]);

    expect(result.success).toBe(true);
    if (result.success) {
      const entry = result.data.breakdown[0]!;
      expect(entry.source).toBe(filePath);
      expect(entry.tokens).toBeGreaterThan(0);
      expect(entry.bytes).toBeGreaterThan(0);
    }
  });
});
