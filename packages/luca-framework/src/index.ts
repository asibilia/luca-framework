import { defineCommand, runMain as cittyRunMain } from "citty";

import { LUCA_VERSION } from "./utils/manifest";

const main = defineCommand({
  meta: {
    name: "luca",
    version: LUCA_VERSION,
    description:
      "Luca CLI — scaffold and manage AI-powered development workflows",
  },
  subCommands: {
    init: () => import("./commands/init").then((m) => m.initCommand),
    update: () => import("./commands/update").then((m) => m.updateCommand),
    doctor: () => import("./commands/doctor").then((m) => m.default),
    "run:claude": () =>
      import("./commands/run").then((m) => m.runClaudeCommand),
    "run:cursor": () =>
      import("./commands/run").then((m) => m.runCursorCommand),
  },
});

export const runMain = () => {
  // Non-blocking version check runs in background
  import("./utils/version-check").then((m) => m.checkForUpdates());
  return cittyRunMain(main);
};

export const runInit = () => import("./commands/init").then((m) => m.runInit());

// Re-export types for consumers
export type {
  ProjectContext,
  BrandingConfig,
  LucaConfig,
  LucaManifest,
  FileComparison,
  FileSource,
  ApprovalConfig,
  HarnessId,
} from "./types";

// Re-export version for consumers
export { LUCA_VERSION } from "./utils/manifest";
