/**
 * Parser for `bun test` output.
 *
 * Handles failure markers, assertion details, stack traces, compile errors,
 * and file header lines from bun test output.
 */

import type { ParsedError, OutputParser } from '~/harness/harness.schemas';

// Match failed test name: "✗ test name [timing]" or "✘ test name [timing]"
const FAIL_MARKER_REGEX = /^\s*[✗✘×]\s+(.+?)(?:\s+\[[\d.]+(?:ms|s)\])?\s*$/;

// Match stack trace location: "at /path/file.ts:line:col" or "at file.ts:line:col"
const STACK_LOCATION_REGEX = /^\s+at\s+(.+?):(\d+):(\d+)\s*$/;

// Match compile/parse error: "error: <message>" at start of line or "SyntaxError: ..."
const COMPILE_ERROR_REGEX = /^(?:error|SyntaxError|TypeError|ReferenceError):\s+(.+)$/;

// Match file header line: "path/to/file.test.ts:" (indicates which test file)
const FILE_HEADER_REGEX = /^(\S+\.(?:test|spec)\.\w+):$/;

export const parseBunTestOutput: OutputParser = (output: string): ParsedError[] => {
  const errors: ParsedError[] = [];
  const lines = output.split('\n');

  let currentTestName = '';
  let currentFile = '';
  let assertionDetails: string[] = [];
  let foundLocation = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Track current test file from header line
    const fileMatch = line.match(FILE_HEADER_REGEX);
    if (fileMatch) {
      currentFile = fileMatch[1]!;
      continue;
    }

    // Detect failed test
    const failMatch = line.match(FAIL_MARKER_REGEX);
    if (failMatch) {
      // If we had a previous failure without a location, emit it
      if (currentTestName && !foundLocation) {
        errors.push({
          file: currentFile || 'unknown',
          message: currentTestName + (assertionDetails.length ? ': ' + assertionDetails.join(' ') : ''),
          severity: 'error',
        });
      }

      currentTestName = failMatch[1]!;
      assertionDetails = [];
      foundLocation = false;
      continue;
    }

    // If inside a failure block, collect assertion details
    if (currentTestName && !foundLocation) {
      // Collect Expected/Received lines
      const trimmed = line.trim();
      if (trimmed.startsWith('Expected:') || trimmed.startsWith('Received:') ||
          trimmed.startsWith('error:') || trimmed.startsWith('expect(')) {
        assertionDetails.push(trimmed);
      }

      // Look for stack trace location
      const locMatch = line.match(STACK_LOCATION_REGEX);
      if (locMatch) {
        foundLocation = true;
        errors.push({
          file: locMatch[1]!,
          line: parseInt(locMatch[2]!, 10),
          column: parseInt(locMatch[3]!, 10),
          message: currentTestName + (assertionDetails.length ? ': ' + assertionDetails.join(' ') : ''),
          severity: 'error',
        });
        currentTestName = '';
        assertionDetails = [];
      }
    }

    // Detect compile errors (file fails to parse)
    const compileMatch = line.match(COMPILE_ERROR_REGEX);
    if (compileMatch && !currentTestName) {
      // Look ahead for file location
      const nextLine = lines[i + 1] ?? '';
      const locMatch = nextLine.match(STACK_LOCATION_REGEX);
      errors.push({
        file: locMatch ? locMatch[1]! : currentFile || 'unknown',
        line: locMatch ? parseInt(locMatch[2]!, 10) : undefined,
        column: locMatch ? parseInt(locMatch[3]!, 10) : undefined,
        message: compileMatch[1]!,
        severity: 'error',
      });
    }
  }

  // Flush any remaining failure without location
  if (currentTestName && !foundLocation) {
    errors.push({
      file: currentFile || 'unknown',
      message: currentTestName + (assertionDetails.length ? ': ' + assertionDetails.join(' ') : ''),
      severity: 'error',
    });
  }

  return errors;
};
