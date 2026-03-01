import { describe, test, expect, afterEach, beforeEach } from "bun:test";
import {
  installClackMock,
  createWizardResponses,
  createCancelledWizardResponses,
} from "../../../../utils/mock-clack";
import { setupTempProject, cleanupTempDir } from "../../../../utils/temp-dir";
import { validProjectContext } from "../../../../utils/fixtures";
import type { ProjectContext } from "../../../../../packages/luca-framework/src/types";

// ---------------------------------------------------------------------------
// createConfigFromArgs (pure)
// ---------------------------------------------------------------------------

describe("createConfigFromArgs", () => {
  test("returns defaults when given empty args", async () => {
    const { createConfigFromArgs } =
      await import("../../../../../packages/luca-framework/src/utils/wizard");
    const config = createConfigFromArgs({});
    expect(config.branding.frameworkName).toBe("Luca");
    expect(config.branding.commandPrefix).toBe("lu");
    expect(config.stack).toBe("custom");
    // Default preset is "standard" which defaults workTracker to "github"
    expect(config.workTracker).toBe("github");
  });

  test("overrides values when provided", async () => {
    const { createConfigFromArgs } =
      await import("../../../../../packages/luca-framework/src/utils/wizard");
    const config = createConfigFromArgs({
      name: "MyBot",
      prefix: "mb",
      stack: "react-ts",
      tracker: "github",
    });
    expect(config.branding.frameworkName).toBe("MyBot");
    expect(config.branding.commandPrefix).toBe("mb");
    expect(config.stack).toBe("react-ts");
    expect(config.workTracker).toBe("github");
  });

  test("merges partial branding with defaults", async () => {
    const { createConfigFromArgs } =
      await import("../../../../../packages/luca-framework/src/utils/wizard");
    const config = createConfigFromArgs({ name: "TestBot" });
    expect(config.branding.frameworkName).toBe("TestBot");
    // commandPrefix should fall back to default
    expect(config.branding.commandPrefix).toBe("lu");
  });
});

// ---------------------------------------------------------------------------
// loadConfigFromFile (I/O)
// ---------------------------------------------------------------------------

describe("loadConfigFromFile", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = null;
    }
  });

  test("loads complete config from JSON file", async () => {
    const configData = {
      branding: {
        frameworkName: "MyBot",
        commandPrefix: "mb",
        ticketPattern: "[A-Z]+-\\d+",
        placeholderTicket: "MB-0000",
      },
      stack: "react-ts",
      workTracker: "github",
    };
    tempDir = await setupTempProject({
      "luca.config.json": JSON.stringify(configData),
    });

    const { loadConfigFromFile } =
      await import("../../../../../packages/luca-framework/src/utils/wizard");
    const config = await loadConfigFromFile(`${tempDir}/luca.config.json`);
    expect(config.branding.frameworkName).toBe("MyBot");
    expect(config.branding.commandPrefix).toBe("mb");
    expect(config.stack).toBe("react-ts");
    expect(config.workTracker).toBe("github");
  });

  test("merges partial config with defaults", async () => {
    const configData = {
      branding: { frameworkName: "Partial" },
    };
    tempDir = await setupTempProject({
      "partial.json": JSON.stringify(configData),
    });

    const { loadConfigFromFile } =
      await import("../../../../../packages/luca-framework/src/utils/wizard");
    const config = await loadConfigFromFile(`${tempDir}/partial.json`);
    expect(config.branding.frameworkName).toBe("Partial");
    expect(config.branding.commandPrefix).toBe("lu"); // default
    expect(config.stack).toBe("custom"); // default
    expect(config.workTracker).toBe("none"); // default
  });

  test("handles missing branding key (uses all defaults)", async () => {
    const configData = { stack: "react-ts" };
    tempDir = await setupTempProject({
      "minimal.json": JSON.stringify(configData),
    });

    const { loadConfigFromFile } =
      await import("../../../../../packages/luca-framework/src/utils/wizard");
    const config = await loadConfigFromFile(`${tempDir}/minimal.json`);
    expect(config.branding.frameworkName).toBe("Luca");
    expect(config.stack).toBe("react-ts");
  });

  test("throws for non-existent file", async () => {
    const { loadConfigFromFile } =
      await import("../../../../../packages/luca-framework/src/utils/wizard");
    expect(
      loadConfigFromFile("/tmp/nonexistent-luca-config-12345.json"),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// runWizard (I/O with mocked @clack/prompts)
// ---------------------------------------------------------------------------

describe("runWizard", () => {
  const emptyContext: ProjectContext = {
    hasPackageJson: false,
    hasGit: false,
    hasLuca: false,
    detectedStack: "unknown",
    hasTypeScript: false,
    projectName: null,
  };

  test("returns config on successful completion with defaults", async () => {
    installClackMock(createWizardResponses({}));
    // Re-import to pick up mock
    const { runWizard } =
      await import("../../../../../packages/luca-framework/src/utils/wizard");
    const config = await runWizard(emptyContext);
    expect(config).not.toBeNull();
    expect(config!.branding.frameworkName).toBe("Luca");
    expect(config!.branding.commandPrefix).toBe("lu");
    expect(config!.stack).toBe("custom");
    expect(config!.workTracker).toBe("none");
  });

  test("returns config with custom values", async () => {
    installClackMock(
      createWizardResponses({
        frameworkName: "MyBot",
        commandPrefix: "mb",
        stack: "react-ts",
        workTracker: "github",
      }),
    );
    const { runWizard } =
      await import("../../../../../packages/luca-framework/src/utils/wizard");
    const config = await runWizard(validProjectContext);
    expect(config).not.toBeNull();
    expect(config!.branding.frameworkName).toBe("MyBot");
    expect(config!.stack).toBe("react-ts");
    expect(config!.workTracker).toBe("github");
  });

  test("returns null when group is cancelled", async () => {
    installClackMock(createCancelledWizardResponses("group"));
    const { runWizard } =
      await import("../../../../../packages/luca-framework/src/utils/wizard");
    const config = await runWizard(emptyContext);
    expect(config).toBeNull();
  });

  test("returns null when stack selection is cancelled", async () => {
    installClackMock(createCancelledWizardResponses("stack"));
    const { runWizard } =
      await import("../../../../../packages/luca-framework/src/utils/wizard");
    const config = await runWizard(emptyContext);
    expect(config).toBeNull();
  });

  test("returns null when tracker selection is cancelled", async () => {
    installClackMock(createCancelledWizardResponses("tracker"));
    const { runWizard } =
      await import("../../../../../packages/luca-framework/src/utils/wizard");
    const config = await runWizard(emptyContext);
    expect(config).toBeNull();
  });

  test("returns null when confirmation is cancelled", async () => {
    installClackMock(createCancelledWizardResponses("confirm"));
    const { runWizard } =
      await import("../../../../../packages/luca-framework/src/utils/wizard");
    const config = await runWizard(emptyContext);
    expect(config).toBeNull();
  });
});
