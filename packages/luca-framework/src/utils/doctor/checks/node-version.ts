import type { CheckResult, DoctorCheck } from "../types";

export const nodeVersionCheck: DoctorCheck = {
  name: "Node.js Version",

  async run(): Promise<CheckResult> {
    const currentVersion = process.version;
    const majorVersion = parseInt(
      currentVersion.slice(1).split(".")[0] ?? "0",
      10,
    );

    if (majorVersion >= 18) {
      return {
        name: this.name,
        status: "pass",
        message: `Node.js ${currentVersion} (18+ required)`,
        fixCommand: null,
        details: null,
      };
    }

    return {
      name: this.name,
      status: "fail",
      message: `Node.js ${currentVersion} (18+ required)`,
      fixCommand:
        "brew install node@20  # macOS\nnvm install 20  # or use nvm\nhttps://nodejs.org/  # download manually",
      details: "Luca requires Node.js 18 or later",
    };
  },
};
