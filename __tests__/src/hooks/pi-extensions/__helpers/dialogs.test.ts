/**
 * Unit tests for dialogs Pi extension helper.
 *
 * Tests that selectSafe and inputSafe return null on error/cancel/unavailable
 * and return values on success.
 */
import { describe, test, expect } from "bun:test";

import { selectSafe, inputSafe } from "~/hooks/pi-extensions/__helpers/dialogs";

// ─── selectSafe ───────────────────────────────────────────────

describe("selectSafe", () => {
  const options = [
    { label: "Haiku", value: "haiku" },
    { label: "Sonnet", value: "sonnet" },
    { label: "Opus", value: "opus" },
  ];

  test("returns selected value on success", async () => {
    const ctx = {
      ui: {
        select: async (_title: string, _opts: any[]) => "sonnet",
      },
    };
    const result = await selectSafe(ctx, "Pick model", options);
    expect(result).toBe("sonnet");
  });

  test("returns null when ctx is null", async () => {
    const result = await selectSafe(null, "Pick model", options);
    expect(result).toBeNull();
  });

  test("returns null when ctx is undefined", async () => {
    const result = await selectSafe(undefined, "Pick model", options);
    expect(result).toBeNull();
  });

  test("returns null when ctx.ui is missing", async () => {
    const result = await selectSafe({}, "Pick model", options);
    expect(result).toBeNull();
  });

  test("returns null when ctx.ui.select is missing", async () => {
    const result = await selectSafe({ ui: {} }, "Pick model", options);
    expect(result).toBeNull();
  });

  test("returns null when select returns undefined", async () => {
    const ctx = {
      ui: {
        select: async () => undefined as any,
      },
    };
    const result = await selectSafe(ctx as any, "Pick model", options);
    expect(result).toBeNull();
  });

  test("returns null when select throws", async () => {
    const ctx = {
      ui: {
        select: async () => {
          throw new Error("UI unavailable");
        },
      },
    };
    const result = await selectSafe(ctx, "Pick model", options);
    expect(result).toBeNull();
  });
});

// ─── inputSafe ────────────────────────────────────────────────

describe("inputSafe", () => {
  test("returns entered value on success", async () => {
    const ctx = {
      ui: {
        input: async (_prompt: string, _def?: string) => "79",
      },
    };
    const result = await inputSafe(ctx, "Enter phase", "78");
    expect(result).toBe("79");
  });

  test("returns null when ctx is null", async () => {
    const result = await inputSafe(null, "Enter phase");
    expect(result).toBeNull();
  });

  test("returns null when ctx.ui.input is missing", async () => {
    const result = await inputSafe({ ui: {} }, "Enter phase");
    expect(result).toBeNull();
  });

  test("returns null when input returns undefined (cancelled)", async () => {
    const ctx = {
      ui: {
        input: async () => undefined as any,
      },
    };
    const result = await inputSafe(ctx as any, "Enter phase");
    expect(result).toBeNull();
  });

  test("returns null when input throws", async () => {
    const ctx = {
      ui: {
        input: async () => {
          throw new Error("UI unavailable");
        },
      },
    };
    const result = await inputSafe(ctx, "Enter phase");
    expect(result).toBeNull();
  });
});
