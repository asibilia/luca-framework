/**
 * skill-status-enter — Deterministic PreToolUse hook for Skill invocations.
 *
 * Writes the active skill name to the statusline bus so the HUD shows
 * which skill is currently executing.
 *
 * Always exits 0 — status bus writes must never fail visibly.
 *
 * @module skill-status-enter
 */

import {
  readStdinJson,
  exitSuccess,
  projectDir,
  extractToolInput,
} from "../__helpers/hook-io.ts";
import { writeStatusBus, STATUS_BUS_PATH } from "../../shared";

const SKILL_NAME_RE = /^[a-z0-9-]+$/;

// ─── Main ────────────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  try {
    const data = await readStdinJson();

    // Only act on Skill invocations
    if (!data || data.tool_name !== "Skill") return exitSuccess();

    // Extract skill name from tool_input.skill
    const toolInput = extractToolInput(data);
    const skillName = toolInput?.skill;
    if (typeof skillName !== "string" || skillName.length === 0)
      return exitSuccess();

    // Sanitize: only allow kebab-case alphanumeric names
    if (!SKILL_NAME_RE.test(skillName)) return exitSuccess();

    const busPath = `${projectDir()}/${STATUS_BUS_PATH}`;
    await writeStatusBus({ skill: skillName, stage: "EXECUTING" }, busPath);
  } catch {
    // Hooks must never fail visibly
  }

  return exitSuccess();
};

await main();
