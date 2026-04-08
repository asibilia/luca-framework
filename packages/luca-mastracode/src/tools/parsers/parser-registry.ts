/**
 * Parser registry for the verification checks.
 *
 * Maps parser names (used in CheckConfig.parser) to their implementation
 * functions. Follows the registry pattern used by agents/skills/rules/hooks.
 */

import type { OutputParser } from "../__schemas/checks.schemas";

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
