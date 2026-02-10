import { describe, test, expect } from 'bun:test';
import { parseEslintOutput } from '../../../../src/harness/parsers/eslint';

describe('parseEslintOutput', () => {
  test('parses JSON format with errors', () => {
    const json = JSON.stringify([
      {
        filePath: '/project/src/foo.ts',
        messages: [
          { line: 10, column: 5, message: 'Unexpected console statement', ruleId: 'no-console', severity: 2 },
          { line: 20, column: 1, message: 'Missing semicolon', ruleId: 'semi', severity: 2 },
        ],
      },
    ]);

    const errors = parseEslintOutput(json);

    expect(errors).toHaveLength(2);
    expect(errors[0]).toEqual({
      file: '/project/src/foo.ts',
      line: 10,
      column: 5,
      message: 'Unexpected console statement',
      code: 'no-console',
      severity: 'error',
    });
    expect(errors[1]!.code).toBe('semi');
  });

  test('parses JSON format with warnings', () => {
    const json = JSON.stringify([
      {
        filePath: 'src/bar.ts',
        messages: [
          { line: 5, column: 3, message: 'Unused variable', ruleId: 'no-unused-vars', severity: 1 },
        ],
      },
    ]);

    const errors = parseEslintOutput(json);

    expect(errors).toHaveLength(1);
    expect(errors[0]!.severity).toBe('warning');
  });

  test('handles null ruleId in JSON', () => {
    const json = JSON.stringify([
      {
        filePath: 'src/foo.ts',
        messages: [
          { line: 1, column: 1, message: 'Parsing error: something', ruleId: null, severity: 2 },
        ],
      },
    ]);

    const errors = parseEslintOutput(json);

    expect(errors).toHaveLength(1);
    expect(errors[0]!.code).toBeUndefined();
  });

  test('returns empty array for clean JSON output', () => {
    const json = JSON.stringify([
      { filePath: 'src/foo.ts', messages: [] },
    ]);

    const errors = parseEslintOutput(json);
    expect(errors).toHaveLength(0);
  });

  test('parses JSON format across multiple files', () => {
    const json = JSON.stringify([
      {
        filePath: 'src/a.ts',
        messages: [
          { line: 1, column: 1, message: 'Error in a', ruleId: 'rule-a', severity: 2 },
        ],
      },
      {
        filePath: 'src/b.ts',
        messages: [
          { line: 2, column: 2, message: 'Error in b', ruleId: 'rule-b', severity: 2 },
        ],
      },
    ]);

    const errors = parseEslintOutput(json);

    expect(errors).toHaveLength(2);
    expect(errors[0]!.file).toBe('src/a.ts');
    expect(errors[1]!.file).toBe('src/b.ts');
  });

  test('falls back to regex for default ESLint output', () => {
    const output = [
      'src/foo.ts',
      '  10:5  error  Unexpected console statement  no-console',
      '  20:1  warning  Missing return type  @typescript-eslint/explicit-function-return-type',
      '',
      '2 problems (1 error, 1 warning)',
    ].join('\n');

    const errors = parseEslintOutput(output);

    expect(errors).toHaveLength(2);
    expect(errors[0]).toEqual({
      file: 'src/foo.ts',
      line: 10,
      column: 5,
      severity: 'error',
      message: 'Unexpected console statement',
      code: 'no-console',
    });
    expect(errors[1]!.severity).toBe('warning');
  });

  test('returns empty array for empty output', () => {
    const errors = parseEslintOutput('');
    expect(errors).toHaveLength(0);
  });

  test('falls through to regex on invalid JSON', () => {
    const output = [
      '[invalid json here',
      'src/foo.ts',
      '  5:3  error  Something wrong  some-rule',
    ].join('\n');

    const errors = parseEslintOutput(output);

    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toBe('Something wrong');
  });
});
