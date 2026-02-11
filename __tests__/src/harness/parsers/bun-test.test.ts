import { describe, test, expect } from 'bun:test';
import { parseBunTestOutput } from '../../../../src/harness/parsers/bun-test';

describe('parseBunTestOutput', () => {
  test('parses a single test failure with stack trace', () => {
    const output = [
      'bun test v1.2.0',
      '',
      'src/foo.test.ts:',
      '\u2713 passing test [1.23ms]',
      '\u2717 failing test [2.34ms]',
      '  error: expect(received).toBe(expected)',
      '    Expected: "foo"',
      '    Received: "bar"',
      '      at src/foo.test.ts:15:3',
      '',
      ' 1 pass',
      ' 1 fail',
    ].join('\n');

    const errors = parseBunTestOutput(output);

    expect(errors).toHaveLength(1);
    expect(errors[0]!.file).toBe('src/foo.test.ts');
    expect(errors[0]!.line).toBe(15);
    expect(errors[0]!.column).toBe(3);
    expect(errors[0]!.severity).toBe('error');
    expect(errors[0]!.message).toContain('failing test');
  });

  test('parses multiple test failures', () => {
    const output = [
      'src/bar.test.ts:',
      '\u2717 first failure [1ms]',
      '  error: expect(received).toBe(expected)',
      '    Expected: 1',
      '    Received: 2',
      '      at src/bar.test.ts:10:5',
      '\u2717 second failure [2ms]',
      '  error: expect(received).toBe(expected)',
      '    Expected: "a"',
      '    Received: "b"',
      '      at src/bar.test.ts:20:5',
    ].join('\n');

    const errors = parseBunTestOutput(output);

    expect(errors).toHaveLength(2);
    expect(errors[0]!.message).toContain('first failure');
    expect(errors[0]!.line).toBe(10);
    expect(errors[1]!.message).toContain('second failure');
    expect(errors[1]!.line).toBe(20);
  });

  test('returns empty array for clean output', () => {
    const output = [
      'bun test v1.2.0',
      '',
      'src/foo.test.ts:',
      '\u2713 test one [1.23ms]',
      '\u2713 test two [0.50ms]',
      '',
      ' 2 pass',
      ' 0 fail',
    ].join('\n');

    const errors = parseBunTestOutput(output);
    expect(errors).toHaveLength(0);
  });

  test('handles test failure without stack trace location', () => {
    const output = [
      'src/baz.test.ts:',
      '\u2717 mystery failure [3ms]',
      '',
      ' 0 pass',
      ' 1 fail',
    ].join('\n');

    const errors = parseBunTestOutput(output);

    expect(errors).toHaveLength(1);
    expect(errors[0]!.file).toBe('src/baz.test.ts');
    expect(errors[0]!.message).toContain('mystery failure');
    expect(errors[0]!.line).toBeUndefined();
  });

  test('parses compile errors', () => {
    const output = [
      'SyntaxError: Unexpected token',
      '      at src/broken.ts:5:10',
    ].join('\n');

    const errors = parseBunTestOutput(output);

    expect(errors).toHaveLength(1);
    expect(errors[0]!.file).toBe('src/broken.ts');
    expect(errors[0]!.line).toBe(5);
    expect(errors[0]!.column).toBe(10);
    expect(errors[0]!.message).toBe('Unexpected token');
  });

  test('handles failure with assertion details in message', () => {
    const output = [
      'src/foo.test.ts:',
      '\u2717 should equal [1ms]',
      '  error: expect(received).toBe(expected)',
      '    Expected: "hello"',
      '    Received: "world"',
      '      at src/foo.test.ts:8:7',
    ].join('\n');

    const errors = parseBunTestOutput(output);

    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain('should equal');
    expect(errors[0]!.message).toContain('Expected: "hello"');
    expect(errors[0]!.message).toContain('Received: "world"');
  });

  test('handles cross mark variant character', () => {
    const output = [
      'src/foo.test.ts:',
      '\u2718 also fails [1ms]',
      '      at src/foo.test.ts:3:1',
    ].join('\n');

    const errors = parseBunTestOutput(output);

    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain('also fails');
  });

  test('handles empty output', () => {
    const errors = parseBunTestOutput('');
    expect(errors).toHaveLength(0);
  });

  test('handles output with only pass summary', () => {
    const output = [
      'bun test v1.2.0',
      '',
      ' 5 pass',
      ' 0 fail',
    ].join('\n');

    const errors = parseBunTestOutput(output);
    expect(errors).toHaveLength(0);
  });
});
