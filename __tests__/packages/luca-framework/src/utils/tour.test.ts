import { describe, test, expect, mock, beforeEach } from "bun:test";

import type {
  LucaConfig,
  ProjectContext,
} from "../../../../../packages/luca-framework/src/types";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const defaultConfig: LucaConfig = {
  branding: {
    frameworkName: "Luca",
    commandPrefix: "lu",
    ticketPattern: "[A-Z]+-\\d+",
    placeholderTicket: "PROJ-0000",
  },
  stack: "custom",
  workTracker: "none",
  harnesses: ["claude", "cursor"],
};

const defaultContext: ProjectContext = {
  hasPackageJson: true,
  hasGit: true,
  hasLuca: false,
  detectedStack: "node-ts",
  hasTypeScript: true,
  projectName: "test-project",
  detectedHarnesses: ["claude", "cursor"],
  suggestedFirstCommand: "/lu",
};

// ---------------------------------------------------------------------------
// Mock tracking
// ---------------------------------------------------------------------------

let noteCalls: Array<{ body: string; title: string }> = [];
let confirmCalls: Array<{ message: string }> = [];
let outroCalls: string[] = [];
let confirmResponses: Array<boolean | symbol> = [];
let confirmCallIndex = 0;

const CANCEL_SYMBOL = Symbol.for("cancel");

function resetMockState() {
  noteCalls = [];
  confirmCalls = [];
  outroCalls = [];
  confirmResponses = [];
  confirmCallIndex = 0;
}

// ---------------------------------------------------------------------------
// Install @clack/prompts mock before any imports of tour.ts
// ---------------------------------------------------------------------------

mock.module("@clack/prompts", () => ({
  note: (body: string, title: string) => {
    noteCalls.push({ body, title });
  },
  confirm: async (opts: { message: string }) => {
    confirmCalls.push({ message: opts.message });
    const response = confirmResponses[confirmCallIndex] ?? true;
    confirmCallIndex++;
    return response;
  },
  outro: (message: string) => {
    outroCalls.push(message);
  },
  isCancel: (value: unknown) => typeof value === "symbol",
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runTour", () => {
  beforeEach(() => {
    resetMockState();
  });

  test("happy path: runs through all 4 steps and completes", async () => {
    // All confirms return true (want tour + 3 continue prompts)
    confirmResponses = [true, true, true, true];

    const { runTour } =
      await import("../../../../../packages/luca-framework/src/utils/tour");
    await runTour(defaultConfig, defaultContext);

    // Should have 4 note calls (one per step)
    expect(noteCalls.length).toBe(4);
    expect(noteCalls[0]!.title).toBe("Step 1: Project Identity");
    expect(noteCalls[1]!.title).toBe("Step 2: What Was Generated");
    expect(noteCalls[2]!.title).toBe("Step 3: Getting Started");
    expect(noteCalls[3]!.title).toBe("Step 4: Your First Command");

    // 1 initial confirm (want tour) + 3 continue confirms = 4 total
    expect(confirmCalls.length).toBe(4);

    // Tour complete outro
    expect(outroCalls.length).toBe(1);
    expect(outroCalls[0]).toContain("Tour complete");
  });

  test("user declines tour at the initial prompt", async () => {
    confirmResponses = [false]; // Decline tour

    const { runTour } =
      await import("../../../../../packages/luca-framework/src/utils/tour");
    await runTour(defaultConfig, defaultContext);

    // No notes should be shown
    expect(noteCalls.length).toBe(0);

    // Only 1 confirm call (the initial "want tour?" prompt)
    expect(confirmCalls.length).toBe(1);

    // No outro (early return before any steps)
    expect(outroCalls.length).toBe(0);
  });

  test("user cancels (Ctrl+C) at initial prompt", async () => {
    confirmResponses = [CANCEL_SYMBOL as unknown as boolean];

    const { runTour } =
      await import("../../../../../packages/luca-framework/src/utils/tour");
    await runTour(defaultConfig, defaultContext);

    expect(noteCalls.length).toBe(0);
    expect(confirmCalls.length).toBe(1);
    expect(outroCalls.length).toBe(0);
  });

  test("user exits at step 2 continue prompt", async () => {
    // Accept tour, view step 1, then decline continue
    confirmResponses = [true, false];

    const { runTour } =
      await import("../../../../../packages/luca-framework/src/utils/tour");
    await runTour(defaultConfig, defaultContext);

    // Only step 1 note shown
    expect(noteCalls.length).toBe(1);
    expect(noteCalls[0]!.title).toBe("Step 1: Project Identity");

    // 1 initial + 1 continue = 2 confirms
    expect(confirmCalls.length).toBe(2);

    // Early exit outro
    expect(outroCalls.length).toBe(1);
    expect(outroCalls[0]).toContain("Tour ended");
  });

  test("user cancels (Ctrl+C) at step 2 continue prompt", async () => {
    confirmResponses = [true, CANCEL_SYMBOL as unknown as boolean];

    const { runTour } =
      await import("../../../../../packages/luca-framework/src/utils/tour");
    await runTour(defaultConfig, defaultContext);

    expect(noteCalls.length).toBe(1);
    expect(confirmCalls.length).toBe(2);
    expect(outroCalls.length).toBe(1);
    expect(outroCalls[0]).toContain("Tour ended");
  });

  test("step content adapts to config harness names", async () => {
    confirmResponses = [true, true, true, true];

    const piOnlyConfig: LucaConfig = {
      ...defaultConfig,
      harnesses: ["pi"],
    };

    const { runTour } =
      await import("../../../../../packages/luca-framework/src/utils/tour");
    await runTour(piOnlyConfig, defaultContext);

    // Step 2 should mention .pi/
    const step2 = noteCalls[1]!;
    expect(step2.body).toContain(".pi/");
    expect(step2.body).not.toContain(".claude/");

    // Step 3 should mention Pi startup
    const step3 = noteCalls[2]!;
    expect(step3.body).toContain("Pi");
  });

  test("step 4 uses suggestedFirstCommand from context", async () => {
    confirmResponses = [true, true, true, true];

    const customContext: ProjectContext = {
      ...defaultContext,
      suggestedFirstCommand: "/custom-command",
    };

    const { runTour } =
      await import("../../../../../packages/luca-framework/src/utils/tour");
    await runTour(defaultConfig, customContext);

    const step4 = noteCalls[3]!;
    expect(step4.body).toContain("/custom-command");
  });

  test("step 4 falls back to commandPrefix when no suggestedFirstCommand", async () => {
    confirmResponses = [true, true, true, true];

    const contextNoSuggestion: ProjectContext = {
      ...defaultContext,
      suggestedFirstCommand: undefined,
    };

    const { runTour } =
      await import("../../../../../packages/luca-framework/src/utils/tour");
    await runTour(defaultConfig, contextNoSuggestion);

    const step4 = noteCalls[3]!;
    expect(step4.body).toContain("/lu");
  });

  test("tour never throws even when internals fail", async () => {
    // Force an error by passing bad data that would cause issues
    // The tour wraps everything in try/catch, so this should not throw
    confirmResponses = [true, true, true, true];

    const { runTour } =
      await import("../../../../../packages/luca-framework/src/utils/tour");

    // Even with minimal/broken config, tour should not throw
    const minimalConfig: LucaConfig = {
      branding: {
        frameworkName: "",
        commandPrefix: "",
        ticketPattern: "",
        placeholderTicket: "",
      },
      stack: "",
      workTracker: "none",
    };

    // Should resolve without error
    await expect(
      runTour(minimalConfig, defaultContext),
    ).resolves.toBeUndefined();
  });

  test("step 1 mentions BRAIN.md", async () => {
    confirmResponses = [true, true, true, true];

    const { runTour } =
      await import("../../../../../packages/luca-framework/src/utils/tour");
    await runTour(defaultConfig, defaultContext);

    const step1 = noteCalls[0]!;
    expect(step1.body).toContain("BRAIN.md");
    expect(step1.body).toContain("project's personality");
  });

  test("step 2 mentions generated file categories", async () => {
    confirmResponses = [true, true, true, true];

    const { runTour } =
      await import("../../../../../packages/luca-framework/src/utils/tour");
    await runTour(defaultConfig, defaultContext);

    const step2 = noteCalls[1]!;
    expect(step2.body).toContain("Agents");
    expect(step2.body).toContain("Skills");
    expect(step2.body).toContain("Rules");
    expect(step2.body).toContain("Hooks");
    expect(step2.body).toContain("bun run build:all");
  });
});
