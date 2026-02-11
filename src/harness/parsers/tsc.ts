/**
 * Parser for TypeScript compiler (tsc) output.
 *
 * Handles the standard tsc error format:
 *   src/foo.ts(42,5): error TS2345: Argument of type 'string' is not assignable ...
 */

import type { ParsedError, OutputParser } from '../types';

const TSC_ERROR_REGEX = /^(.+)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/;

export const parseTscOutput: OutputParser = (output: string): ParsedError[] => {
  const errors: ParsedError[] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    const match = line.match(TSC_ERROR_REGEX);
    if (match) {
      errors.push({
        file: match[1]!.trim(),
        line: parseInt(match[2]!, 10),
        column: parseInt(match[3]!, 10),
        severity: match[4] as 'error' | 'warning',
        code: match[5],
        message: match[6]!.trim(),
      });
    }
  }

  return errors;
};
