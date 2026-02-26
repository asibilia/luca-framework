/**
 * Parser registry for the verification harness.
 *
 * Maps parser names (used in CheckConfig.parser) to their implementation
 * functions. Follows the registry pattern used by agents/skills/rules/hooks.
 */

import type { OutputParser } from "~/harness/harness.schemas";
import { parseTscOutput } from "./tsc";
import { parseBunTestOutput } from "./bun-test";
import { parseEslintOutput } from "./eslint";
import { parseGenericOutput } from "./generic";

export const parserRegistry: Record<string, () => OutputParser> = {
  tsc: () => parseTscOutput,
  "bun-test": () => parseBunTestOutput,
  eslint: () => parseEslintOutput,
  generic: () => parseGenericOutput,
};

export { parseTscOutput } from "./tsc";
export { parseBunTestOutput } from "./bun-test";
export { parseEslintOutput } from "./eslint";
export { parseGenericOutput } from "./generic";
