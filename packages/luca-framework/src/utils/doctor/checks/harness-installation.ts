import { existsSync } from "fs";
import { join } from "pathe";
import type { CheckResult, DoctorCheck } from "../types";
import { readManifest } from "../../manifest";
import type { HarnessId } from "../../../types";

/**
 * Expected subdirectories per harness.
 * Each harness should have at least these directories installed.
 */
const HARNESS_DIRS: Record<HarnessId, string[]> = {
  claude: ["hooks", "agents", "rules", "skills"],
  cursor: ["hooks", "agents", "rules", "skills"],
  pi: ["hooks"],
};

export const harnessInstallationCheck: DoctorCheck = {
  name: "Harness Installation",

  async run(): Promise<CheckResult> {
    const cwd = process.cwd();
    const manifest = await readManifest(cwd);

    if (!manifest) {
      return {
        name: this.name,
        status: "warning",
        message: "No manifest found — cannot verify harness installation",
        fixCommand: "bunx luca init",
        details: "Run `bunx luca init` to create a Luca project.",
      };
    }

    const harnesses: HarnessId[] = manifest.harnesses ?? ["claude", "cursor"];
    const issues: string[] = [];
    const passed: string[] = [];

    for (const harnessId of harnesses) {
      const harnessDir = join(cwd, `.${harnessId}`);

      if (!existsSync(harnessDir)) {
        issues.push(`  .${harnessId}/ directory missing`);
        continue;
      }

      const expectedDirs = HARNESS_DIRS[harnessId] ?? [];
      const missingDirs: string[] = [];

      for (const subdir of expectedDirs) {
        if (!existsSync(join(harnessDir, subdir))) {
          missingDirs.push(subdir);
        }
      }

      if (missingDirs.length > 0) {
        issues.push(
          `  .${harnessId}/ missing subdirs: ${missingDirs.join(", ")}`,
        );
      } else {
        passed.push(harnessId);
      }
    }

    if (issues.length === 0) {
      return {
        name: this.name,
        status: "pass",
        message: `All ${harnesses.length} harness(es) installed: ${passed.join(", ")}`,
        fixCommand: null,
        details: null,
      };
    }

    return {
      name: this.name,
      status: "fail",
      message: `${issues.length} harness issue(s) found`,
      fixCommand: "bunx luca update --force",
      details: issues.join("\n"),
    };
  },
};
