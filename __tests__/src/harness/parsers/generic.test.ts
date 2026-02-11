import { describe, test, expect } from 'bun:test';
import { parseGenericOutput } from '../../../../src/harness/parsers/generic';

describe('parseGenericOutput', () => {
  test('parses structured error with file, line, column', () => {
    const output = 'src/foo.ts:42:5: error: Something went wrong';
    const errors = parseGenericOutput(output);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toEqual({
      file: 'src/foo.ts',
      line: 42,
      column: 5,
      message: 'Something went wrong',
      severity: 'error',
    });
  });

  test('parses structured error without column', () => {
    const output = 'src/foo.ts:42: Error: Something went wrong';
    const errors = parseGenericOutput(output);

    expect(errors).toHaveLength(1);
    expect(errors[0]!.file).toBe('src/foo.ts');
    expect(errors[0]!.line).toBe(42);
    expect(errors[0]!.column).toBeUndefined();
  });

  test('parses bare error without file location', () => {
    const output = 'error: Build failed with 3 errors';
    const errors = parseGenericOutput(output);

    expect(errors).toHaveLength(1);
    expect(errors[0]!.file).toBe('unknown');
    expect(errors[0]!.message).toBe('Build failed with 3 errors');
  });

  test('parses multiple errors', () => {
    const output = [
      'src/a.ts:10:1: error: Missing import',
      'src/b.ts:20:5: Error: Invalid syntax',
      'Error: Module not found',
    ].join('\n');

    const errors = parseGenericOutput(output);

    expect(errors).toHaveLength(3);
    expect(errors[0]!.file).toBe('src/a.ts');
    expect(errors[1]!.file).toBe('src/b.ts');
    expect(errors[2]!.file).toBe('unknown');
  });

  test('returns empty array for clean output', () => {
    const output = [
      'Build complete.',
      'All checks passed.',
      '0 errors, 0 warnings',
    ].join('\n');

    const errors = parseGenericOutput(output);
    expect(errors).toHaveLength(0);
  });

  test('returns empty array for empty output', () => {
    const errors = parseGenericOutput('');
    expect(errors).toHaveLength(0);
  });

  test('handles ERROR (uppercase)', () => {
    const output = 'src/foo.ts:1:1: ERROR: Something bad';
    const errors = parseGenericOutput(output);

    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toBe('Something bad');
  });

  test('ignores non-error lines', () => {
    const output = [
      'Starting build...',
      'Compiling 42 files...',
      'src/broken.ts:5:3: error: Unexpected token',
      'Build time: 1.23s',
    ].join('\n');

    const errors = parseGenericOutput(output);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.file).toBe('src/broken.ts');
  });
});
