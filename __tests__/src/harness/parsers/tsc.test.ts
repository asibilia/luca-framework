import { describe, test, expect } from 'bun:test';
import { parseTscOutput } from '../../../../src/harness/parsers/tsc';

describe('parseTscOutput', () => {
  test('parses a single error', () => {
    const output = `src/foo.ts(42,5): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.`;
    const errors = parseTscOutput(output);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toEqual({
      file: 'src/foo.ts',
      line: 42,
      column: 5,
      severity: 'error',
      code: 'TS2345',
      message: "Argument of type 'string' is not assignable to parameter of type 'number'.",
    });
  });

  test('parses multiple errors across files', () => {
    const output = [
      `src/foo.ts(10,3): error TS2322: Type 'string' is not assignable to type 'number'.`,
      `src/bar.ts(20,7): error TS2551: Property 'naem' does not exist on type 'User'. Did you mean 'name'?`,
      `src/baz.ts(5,1): error TS1005: ';' expected.`,
    ].join('\n');

    const errors = parseTscOutput(output);

    expect(errors).toHaveLength(3);
    expect(errors[0]!.file).toBe('src/foo.ts');
    expect(errors[0]!.line).toBe(10);
    expect(errors[0]!.code).toBe('TS2322');

    expect(errors[1]!.file).toBe('src/bar.ts');
    expect(errors[1]!.line).toBe(20);
    expect(errors[1]!.code).toBe('TS2551');

    expect(errors[2]!.file).toBe('src/baz.ts');
    expect(errors[2]!.line).toBe(5);
    expect(errors[2]!.code).toBe('TS1005');
  });

  test('returns empty array for clean output', () => {
    const output = '';
    const errors = parseTscOutput(output);
    expect(errors).toHaveLength(0);
  });

  test('ignores summary line "Found N errors"', () => {
    const output = [
      `src/foo.ts(10,3): error TS2322: Type 'string' is not assignable to type 'number'.`,
      ``,
      `Found 1 error in src/foo.ts:10`,
    ].join('\n');

    const errors = parseTscOutput(output);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.code).toBe('TS2322');
  });

  test('parses warnings', () => {
    const output = `src/foo.ts(15,1): warning TS6133: 'unusedVar' is declared but its value is never read.`;
    const errors = parseTscOutput(output);

    expect(errors).toHaveLength(1);
    expect(errors[0]!.severity).toBe('warning');
    expect(errors[0]!.code).toBe('TS6133');
  });

  test('handles mixed errors and non-error lines', () => {
    const output = [
      `tsc --noEmit`,
      ``,
      `src/foo.ts(10,3): error TS2322: Type 'string' is not assignable to type 'number'.`,
      ``,
      `Found 1 error.`,
    ].join('\n');

    const errors = parseTscOutput(output);
    expect(errors).toHaveLength(1);
  });

  test('handles paths with spaces or special characters', () => {
    const output = `src/my file.ts(1,1): error TS1005: ';' expected.`;
    const errors = parseTscOutput(output);

    expect(errors).toHaveLength(1);
    expect(errors[0]!.file).toBe('src/my file.ts');
  });
});
