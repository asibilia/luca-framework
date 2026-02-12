import { describe, test, expect } from "bun:test";
import {
  sanitizeTagName,
  buildTagName,
  metadataPath,
  getCurrentCommitHash,
} from "./checkpoint";

describe("sanitizeTagName", () => {
  test("converts 'iter/17/harness/1' to 'iter-17-harness-1'", () => {
    expect(sanitizeTagName("iter/17/harness/1")).toBe("iter-17-harness-1");
  });

  test("handles tags without slashes (returns unchanged)", () => {
    expect(sanitizeTagName("no-slashes")).toBe("no-slashes");
  });

  test("handles multiple consecutive slashes", () => {
    expect(sanitizeTagName("a//b///c")).toBe("a--b---c");
  });
});

describe("buildTagName", () => {
  test("produces correct format for harness loop", () => {
    expect(buildTagName(17, "harness", 1)).toBe("iter/17/harness/1");
  });

  test("produces correct format for verify loop", () => {
    expect(buildTagName(17, "verify", 3)).toBe("iter/17/verify/3");
  });

  test("handles various phase numbers and iteration counts", () => {
    expect(buildTagName(1, "harness", 10)).toBe("iter/1/harness/10");
    expect(buildTagName(99, "verify", 1)).toBe("iter/99/verify/1");
  });
});

describe("metadataPath", () => {
  test("produces correct path with default directory", () => {
    expect(metadataPath("iter/17/harness/1")).toBe(
      ".planning/checkpoints/iter-17-harness-1.json",
    );
  });

  test("produces correct path with custom directory", () => {
    expect(metadataPath("iter/17/harness/1", "/tmp/checkpoints")).toBe(
      "/tmp/checkpoints/iter-17-harness-1.json",
    );
  });

  test("sanitizes the tag name in the path", () => {
    expect(metadataPath("iter/5/verify/2")).toBe(
      ".planning/checkpoints/iter-5-verify-2.json",
    );
  });
});

describe("getCurrentCommitHash", () => {
  test("returns a non-empty string", async () => {
    const hash = await getCurrentCommitHash();
    expect(hash.length).toBeGreaterThan(0);
    expect(hash).not.toBe("unknown");
  });
});
