/**
 * Unit tests for notify Pi extension helper.
 *
 * Tests that notifySafe and confirmSafe handle missing/broken ctx gracefully
 * without throwing.
 */
import { describe, test, expect } from "bun:test";

import {
  notifySafe,
  confirmSafe,
} from "~/hooks/pi-extensions/__helpers/notify";

// ─── notifySafe ──────────────────────────────────────────────

describe("notifySafe", () => {
  test("calls ctx.ui.notify with message and level", () => {
    const calls: Array<{ message: string; level: string | undefined }> = [];
    const ctx = {
      ui: {
        notify: (message: string, level?: string) => {
          calls.push({ message, level });
        },
      },
    };

    notifySafe(ctx, "Deploy complete", "info");

    expect(calls).toHaveLength(1);
    expect(calls[0]!.message).toBe("Deploy complete");
    expect(calls[0]!.level).toBe("info");
  });

  test("silent when ctx is null", () => {
    expect(() => notifySafe(null, "msg")).not.toThrow();
  });

  test("silent when ctx is undefined", () => {
    expect(() => notifySafe(undefined, "msg")).not.toThrow();
  });

  test("silent when ctx.ui is undefined", () => {
    expect(() => notifySafe({} as any, "msg")).not.toThrow();
  });

  test("silent when ctx.ui.notify throws", () => {
    const ctx = {
      ui: {
        notify: () => {
          throw new Error("UI crashed");
        },
      },
    };

    expect(() => notifySafe(ctx, "msg", "error")).not.toThrow();
  });
});

// ─── confirmSafe ─────────────────────────────────────────────

describe("confirmSafe", () => {
  test("calls ctx.ui.confirm and returns true when confirmed", async () => {
    const ctx = {
      ui: {
        confirm: async (_title: string, _body: string) => true,
      },
    };

    const result = await confirmSafe(ctx, "Delete?", "This is permanent.");
    expect(result).toBe(true);
  });

  test("returns false when ctx is null", async () => {
    const result = await confirmSafe(null, "Delete?", "Body");
    expect(result).toBe(false);
  });

  test("returns false when ctx.ui is undefined", async () => {
    const result = await confirmSafe({} as any, "Delete?", "Body");
    expect(result).toBe(false);
  });

  test("returns false when ctx.ui.confirm is undefined", async () => {
    const result = await confirmSafe({ ui: {} } as any, "Delete?", "Body");
    expect(result).toBe(false);
  });

  test("returns false when ctx.ui.confirm rejects", async () => {
    const ctx = {
      ui: {
        confirm: async () => {
          throw new Error("Dialog failed");
        },
      },
    };

    const result = await confirmSafe(ctx, "Delete?", "Body");
    expect(result).toBe(false);
  });
});
