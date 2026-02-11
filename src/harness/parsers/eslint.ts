/**
 * Parser for ESLint output.
 *
 * Supports two formats:
 * 1. JSON output from `eslint --format json` (primary)
 * 2. Default human-readable ESLint output (regex fallback)
 */

import type { ParsedError, OutputParser } from '../types';

const ESLINT_DEFAULT_REGEX = /^\s+(\d+):(\d+)\s+(error|warning)\s+(.+?)\s{2,}(\S+)\s*$/;
const ESLINT_FILE_REGEX = /^(\/\S+|\S+\.\w+)$/;

interface EslintJsonMessage {
  line: number;
  column: number;
  message: string;
  ruleId: string | null;
  severity: 1 | 2;
}

interface EslintJsonResult {
  filePath: string;
  messages: EslintJsonMessage[];
}

export const parseEslintOutput: OutputParser = (output: string): ParsedError[] => {
  const errors: ParsedError[] = [];
  const trimmed = output.trim();

  // Attempt JSON parse first (eslint --format json)
  if (trimmed.startsWith('[')) {
    try {
      const results: EslintJsonResult[] = JSON.parse(trimmed);
      for (const result of results) {
        for (const msg of result.messages) {
          errors.push({
            file: result.filePath,
            line: msg.line,
            column: msg.column,
            message: msg.message,
            code: msg.ruleId ?? undefined,
            severity: msg.severity === 2 ? 'error' : 'warning',
          });
        }
      }
      return errors;
    } catch {
      // Not valid JSON — fall through to regex
    }
  }

  // Fallback: regex-based parsing of default ESLint output
  const lines = output.split('\n');
  let currentFile = '';

  for (const line of lines) {
    const fileMatch = line.match(ESLINT_FILE_REGEX);
    if (fileMatch) {
      currentFile = fileMatch[1]!;
      continue;
    }

    const msgMatch = line.match(ESLINT_DEFAULT_REGEX);
    if (msgMatch && currentFile) {
      errors.push({
        file: currentFile,
        line: parseInt(msgMatch[1]!, 10),
        column: parseInt(msgMatch[2]!, 10),
        severity: msgMatch[3] as 'error' | 'warning',
        message: msgMatch[4]!.trim(),
        code: msgMatch[5],
      });
    }
  }

  return errors;
};
