import { describe, test, expect, afterEach } from 'bun:test';
import { detectProjectContext, formatStack } from '../../../../../packages/luca-framework/src/utils/detect';
import { setupTempProject, cleanupTempDir } from '../../../../utils/temp-dir';

// ---------------------------------------------------------------------------
// detectProjectContext
// ---------------------------------------------------------------------------

describe('detectProjectContext', () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = null;
    }
  });

  test('detects empty directory as unknown with no features', async () => {
    tempDir = await setupTempProject({});
    const ctx = await detectProjectContext(tempDir);
    expect(ctx.hasPackageJson).toBe(false);
    expect(ctx.hasGit).toBe(false);
    expect(ctx.hasLuca).toBe(false);
    expect(ctx.detectedStack).toBe('unknown');
    expect(ctx.hasTypeScript).toBe(false);
    expect(ctx.projectName).toBeNull();
  });

  test('detects bare Node.js project', async () => {
    tempDir = await setupTempProject({
      'package.json': JSON.stringify({ name: 'my-app', dependencies: {} }),
    });
    const ctx = await detectProjectContext(tempDir);
    expect(ctx.hasPackageJson).toBe(true);
    expect(ctx.detectedStack).toBe('node');
    expect(ctx.projectName).toBe('my-app');
    expect(ctx.hasTypeScript).toBe(false);
  });

  test('detects Node.js + TypeScript project', async () => {
    tempDir = await setupTempProject({
      'package.json': JSON.stringify({
        name: 'ts-project',
        devDependencies: { typescript: '^5.0.0' },
      }),
    });
    const ctx = await detectProjectContext(tempDir);
    expect(ctx.detectedStack).toBe('node-ts');
    expect(ctx.hasTypeScript).toBe(true);
  });

  test('detects TypeScript via tsconfig.json when not in dependencies', async () => {
    tempDir = await setupTempProject({
      'package.json': JSON.stringify({ name: 'ts-project', dependencies: {} }),
      'tsconfig.json': JSON.stringify({ compilerOptions: {} }),
    });
    const ctx = await detectProjectContext(tempDir);
    expect(ctx.hasTypeScript).toBe(true);
    // Stack detection is based on dependencies, so this is still 'node'
    expect(ctx.detectedStack).toBe('node');
  });

  test('detects React project (no TypeScript)', async () => {
    tempDir = await setupTempProject({
      'package.json': JSON.stringify({
        name: 'react-app',
        dependencies: { react: '^18.0.0' },
      }),
    });
    const ctx = await detectProjectContext(tempDir);
    expect(ctx.detectedStack).toBe('react');
  });

  test('detects React + TypeScript project via react dependency', async () => {
    tempDir = await setupTempProject({
      'package.json': JSON.stringify({
        name: 'react-ts-app',
        dependencies: { react: '^18.0.0' },
        devDependencies: { typescript: '^5.0.0' },
      }),
    });
    const ctx = await detectProjectContext(tempDir);
    expect(ctx.detectedStack).toBe('react-ts');
    expect(ctx.hasTypeScript).toBe(true);
  });

  test('detects React + TypeScript via @types/react', async () => {
    tempDir = await setupTempProject({
      'package.json': JSON.stringify({
        name: 'react-ts-app',
        devDependencies: { '@types/react': '^18.0.0', typescript: '^5.0.0' },
      }),
    });
    const ctx = await detectProjectContext(tempDir);
    expect(ctx.detectedStack).toBe('react-ts');
  });

  test('detects .git directory', async () => {
    tempDir = await setupTempProject({
      '.git/HEAD': 'ref: refs/heads/main',
    });
    const ctx = await detectProjectContext(tempDir);
    expect(ctx.hasGit).toBe(true);
  });

  test('detects existing Luca installation', async () => {
    tempDir = await setupTempProject({
      '.cursor/luca/placeholder': '',
    });
    const ctx = await detectProjectContext(tempDir);
    expect(ctx.hasLuca).toBe(true);
  });

  test('returns null projectName when package.json has no name', async () => {
    tempDir = await setupTempProject({
      'package.json': JSON.stringify({ version: '1.0.0' }),
    });
    const ctx = await detectProjectContext(tempDir);
    expect(ctx.hasPackageJson).toBe(true);
    expect(ctx.projectName).toBeNull();
  });

  test('detects full project with all features', async () => {
    tempDir = await setupTempProject({
      'package.json': JSON.stringify({
        name: 'full-project',
        dependencies: { react: '^18.0.0' },
        devDependencies: { typescript: '^5.0.0' },
      }),
      '.git/HEAD': 'ref: refs/heads/main',
      '.cursor/luca/placeholder': '',
    });
    const ctx = await detectProjectContext(tempDir);
    expect(ctx.hasPackageJson).toBe(true);
    expect(ctx.hasGit).toBe(true);
    expect(ctx.hasLuca).toBe(true);
    expect(ctx.detectedStack).toBe('react-ts');
    expect(ctx.hasTypeScript).toBe(true);
    expect(ctx.projectName).toBe('full-project');
  });

  test('handles invalid package.json gracefully', async () => {
    tempDir = await setupTempProject({
      'package.json': 'not valid json!',
    });
    // readPackageJSON from pkg-types may still find and parse parent package.json,
    // or may handle the error. Either way, the function should not throw.
    const ctx = await detectProjectContext(tempDir);
    expect(ctx).toBeDefined();
    expect(typeof ctx.hasPackageJson).toBe('boolean');
  });

  test('defaults to process.cwd() when no cwd argument provided', async () => {
    // Just ensure the function can be called without arguments and not throw
    const ctx = await detectProjectContext();
    expect(ctx).toBeDefined();
    expect(typeof ctx.hasPackageJson).toBe('boolean');
  });
});

// ---------------------------------------------------------------------------
// formatStack
// ---------------------------------------------------------------------------

describe('formatStack', () => {
  test('formats react-ts', () => {
    expect(formatStack('react-ts')).toBe('React + TypeScript');
  });

  test('formats react', () => {
    expect(formatStack('react')).toBe('React');
  });

  test('formats node-ts', () => {
    expect(formatStack('node-ts')).toBe('Node.js + TypeScript');
  });

  test('formats node', () => {
    expect(formatStack('node')).toBe('Node.js');
  });

  test('formats unknown', () => {
    expect(formatStack('unknown')).toBe('Unknown');
  });
});
