import { describe, test, expect } from "bun:test";
import {
  installClackMock,
  createWizardResponses,
} from "../../../../utils/mock-clack";
import { validProjectContext } from "../../../../utils/fixtures";
import type { ProjectContext } from "../../../../../packages/luca-framework/src/types";

// ---------------------------------------------------------------------------
// createConfigFromArgs — harness parsing
// ---------------------------------------------------------------------------

describe("createConfigFromArgs — harness parsing", () => {
  test("defaults to claude and cursor when --harness not provided", async () => {
    const { createConfigFromArgs } =
      await import("../../../../../packages/luca-framework/src/utils/wizard");
    const config = createConfigFromArgs({});
    expect(config.harnesses).toEqual(["claude", "cursor"]);
  });

  test("parses single harness from --harness argument", async () => {
    const { createConfigFromArgs } =
      await import("../../../../../packages/luca-framework/src/utils/wizard");
    const config = createConfigFromArgs({ harness: "claude" });
    expect(config.harnesses).toEqual(["claude"]);
  });

  test("parses multiple comma-separated harnesses", async () => {
    const { createConfigFromArgs } =
      await import("../../../../../packages/luca-framework/src/utils/wizard");
    const config = createConfigFromArgs({ harness: "claude,pi,cursor" });
    expect(config.harnesses).toEqual(["claude", "pi", "cursor"]);
  });

  test("trims whitespace in harness values", async () => {
    const { createConfigFromArgs } =
      await import("../../../../../packages/luca-framework/src/utils/wizard");
    const config = createConfigFromArgs({ harness: " claude , pi " });
    expect(config.harnesses).toEqual(["claude", "pi"]);
  });

  test("throws for invalid harness name", async () => {
    const { createConfigFromArgs } =
      await import("../../../../../packages/luca-framework/src/utils/wizard");
    expect(() => createConfigFromArgs({ harness: "invalid" })).toThrow(
      "Invalid --harness value",
    );
  });

  test("throws for mix of valid and invalid harness names", async () => {
    const { createConfigFromArgs } =
      await import("../../../../../packages/luca-framework/src/utils/wizard");
    expect(() => createConfigFromArgs({ harness: "claude,bad" })).toThrow(
      "Invalid --harness value",
    );
  });

  test("parses pi as a valid harness", async () => {
    const { createConfigFromArgs } =
      await import("../../../../../packages/luca-framework/src/utils/wizard");
    const config = createConfigFromArgs({ harness: "pi" });
    expect(config.harnesses).toEqual(["pi"]);
  });
});

// ---------------------------------------------------------------------------
// VALID_HARNESSES / DEFAULT_HARNESSES constants
// ---------------------------------------------------------------------------

describe("harness constants", () => {
  test("VALID_HARNESSES includes claude, cursor, pi", async () => {
    const { VALID_HARNESSES } =
      await import("../../../../../packages/luca-framework/src/utils/wizard");
    expect(VALID_HARNESSES).toContain("claude");
    expect(VALID_HARNESSES).toContain("cursor");
    expect(VALID_HARNESSES).toContain("pi");
    expect(VALID_HARNESSES).toHaveLength(3);
  });

  test("DEFAULT_HARNESSES is claude and cursor", async () => {
    const { DEFAULT_HARNESSES } =
      await import("../../../../../packages/luca-framework/src/utils/wizard");
    expect(DEFAULT_HARNESSES).toEqual(["claude", "cursor"]);
  });
});

// ---------------------------------------------------------------------------
// runWizard — harness selection via multiselect
// ---------------------------------------------------------------------------

describe("runWizard — harness multiselect", () => {
  const emptyContext: ProjectContext = {
    hasPackageJson: false,
    hasGit: false,
    hasLuca: false,
    detectedStack: "unknown",
    hasTypeScript: false,
    projectName: null,
  };

  test("returns config with harnesses from multiselect", async () => {
    installClackMock({
      ...createWizardResponses({}),
      multiselectResponse: ["claude", "pi"],
    });
    const { runWizard } =
      await import("../../../../../packages/luca-framework/src/utils/wizard");
    const config = await runWizard(emptyContext);
    expect(config).not.toBeNull();
    expect(config!.harnesses).toEqual(["claude", "pi"]);
  });

  test("returns config with all three harnesses selected", async () => {
    installClackMock({
      ...createWizardResponses({}),
      multiselectResponse: ["claude", "cursor", "pi"],
    });
    const { runWizard } =
      await import("../../../../../packages/luca-framework/src/utils/wizard");
    const config = await runWizard(validProjectContext);
    expect(config).not.toBeNull();
    expect(config!.harnesses).toEqual(["claude", "cursor", "pi"]);
  });

  test("returns null when harness multiselect is cancelled", async () => {
    const CANCEL_SYMBOL = Symbol.for("cancel");
    installClackMock({
      ...createWizardResponses({}),
      multiselectResponse: CANCEL_SYMBOL as unknown as string[],
    });
    const { runWizard } =
      await import("../../../../../packages/luca-framework/src/utils/wizard");
    const config = await runWizard(emptyContext);
    expect(config).toBeNull();
  });
});
