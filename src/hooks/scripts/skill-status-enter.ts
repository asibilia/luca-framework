/**
 * skill-status-enter — Deterministic PreToolUse hook for Skill invocations.
 *
 * Writes the active skill name to the statusline bus so the HUD shows
 * which skill is currently executing. Handles nesting via a depth file
 * so inner skills don't overwrite the outer skill's identity.
 *
 * Always exits 0 — status bus writes must never fail visibly.
 *
 * @module skill-status-enter
 */

import { readStdinJson, exitSuccess } from "../__helpers/hook-io.ts";
import { writeStatusBus } from "../../shared/__helpers/status-bus.ts";

const DEPTH_PATH = ".planning/.skill-depth";
const SKILL_NAME_RE = /^[a-z0-9-]+$/;

// ─── Main ────────────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  try {
    const data = await readStdinJson();

    // Only act on Skill invocations
    if (!data || data.tool_name !== "Skill") return exitSuccess();

    // Extract skill name from tool_input.skill
    const toolInput = data.tool_input as Record<string, unknown> | undefined;
    const skillName = toolInput?.skill;
    if (typeof skillName !== "string" || skillName.length === 0)
      return exitSuccess();

    // Sanitize: only allow kebab-case alphanumeric names
    if (!SKILL_NAME_RE.test(skillName)) return exitSuccess();

    // Read nesting depth (default 0 if missing)
    const depthFile = Bun.file(DEPTH_PATH);
    let depth = 0;
    try {
      if (await depthFile.exists()) {
        const raw = (await depthFile.text()).trim();
        const parsed = parseInt(raw, 10);
        if (!Number.isNaN(parsed) && parsed >= 0) depth = parsed;
      }
    } catch {
      // Ignore read errors — treat as depth 0
    }

    if (depth > 0) {
      // Nested skill: increment depth, don't overwrite outer skill's status
      await Bun.write(DEPTH_PATH, String(depth + 1));
      return exitSuccess();
    }

    // Top-level skill: set depth=1, write status bus
    await Bun.write(DEPTH_PATH, "1");
    await writeStatusBus({ skill: skillName, stage: "ACTIVE" });
  } catch {
    // Hooks must never fail visibly
  }

  return exitSuccess();
};

await main();
