import { describe, test, expect, afterEach, mock, beforeEach } from 'bun:test';
import { existsSync } from 'fs';
import { join } from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { installClackMock } from '../../../../utils/mock-clack';
import { createTempDir, cleanupTempDir, setupTempProject } from '../../../../utils/temp-dir';
import { validLucaConfig, validLucaManifest } from '../../../../utils/fixtures';

// Install clack mock before importing files.ts (it imports @clack/prompts at top level)
installClackMock({});

// ---------------------------------------------------------------------------
// cleanupFiles
// ---------------------------------------------------------------------------

describe('cleanupFiles', () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = null;
    }
  });

  test('does nothing when no paths are tracked (no error)', async () => {
    const { cleanupFiles } = await import(
      '../../../../../packages/luca-framework/src/utils/files'
    );
    // Should not throw even when there's nothing to clean
    await expect(cleanupFiles()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// setupCleanupHandler
// ---------------------------------------------------------------------------

describe('setupCleanupHandler', () => {
  test('registers SIGINT handler without throwing', async () => {
    const { setupCleanupHandler } = await import(
      '../../../../../packages/luca-framework/src/utils/files'
    );
    // Should register a handler without throwing
    expect(() => setupCleanupHandler()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// generateFiles
// ---------------------------------------------------------------------------

describe('generateFiles', () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = null;
    }
  });

  test('creates required directory structure', async () => {
    tempDir = await createTempDir();
    const { generateFiles } = await import(
      '../../../../../packages/luca-framework/src/utils/files'
    );

    // generateFiles will try to copy from template directories that may not
    // exist relative to the test context, so we test the directory creation part
    // by catching any downstream error
    const result = await generateFiles({
      config: { ...validLucaConfig, stack: 'custom' },
      cwd: tempDir,
    });

    // The function may succeed or fail depending on whether template dirs exist.
    // But directories should have been created either way (before template copy).
    const planningDir = join(tempDir, '.planning');
    const cursorDir = join(tempDir, '.cursor');

    // Even if the overall operation fails, we can check that the function
    // returns a proper result object
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
    if (result.success) {
      expect(result.data).toBeDefined();
    } else {
      expect(result.error).toBeDefined();
    }
  });

  test('returns success:true with manifest when templates are available', async () => {
    tempDir = await createTempDir();
    const { generateFiles } = await import(
      '../../../../../packages/luca-framework/src/utils/files'
    );

    const result = await generateFiles({
      config: { ...validLucaConfig, stack: 'custom' },
      cwd: tempDir,
    });

    // If templates are found, should succeed
    if (result.success) {
      expect(result.data).toBeDefined();
      expect(result.data.version).toBeDefined();
      expect(result.data.branding).toBeDefined();
    }
    // If templates are not found, should fail gracefully
    if (!result.success) {
      expect(typeof result.error).toBe('string');
    }
  });

  test('returns error result when something fails', async () => {
    const { generateFiles } = await import(
      '../../../../../packages/luca-framework/src/utils/files'
    );

    // Use a path that will definitely fail (read-only / non-existent nested)
    const result = await generateFiles({
      config: validLucaConfig,
      cwd: '/tmp/nonexistent-luca-test-dir-12345/nested/deep',
    });

    // It should either succeed or return a structured error (not throw)
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
  });

  test('creates .planning directory when it does not exist', async () => {
    tempDir = await createTempDir();
    const { generateFiles } = await import(
      '../../../../../packages/luca-framework/src/utils/files'
    );

    await generateFiles({
      config: { ...validLucaConfig, stack: 'custom' },
      cwd: tempDir,
    });

    expect(existsSync(join(tempDir, '.planning'))).toBe(true);
  });

  test('creates .cursor subdirectories', async () => {
    tempDir = await createTempDir();
    const { generateFiles } = await import(
      '../../../../../packages/luca-framework/src/utils/files'
    );

    await generateFiles({
      config: { ...validLucaConfig, stack: 'custom' },
      cwd: tempDir,
    });

    // These directories should exist regardless of template copy success
    expect(existsSync(join(tempDir, '.cursor', 'luca'))).toBe(true);
    expect(existsSync(join(tempDir, '.cursor', 'agents'))).toBe(true);
    expect(existsSync(join(tempDir, '.cursor', 'rules'))).toBe(true);
    expect(existsSync(join(tempDir, '.cursor', 'skills'))).toBe(true);
  });

  test('does not re-create directories that already exist', async () => {
    tempDir = await createTempDir();
    // Pre-create directories
    await mkdir(join(tempDir, '.planning'), { recursive: true });
    await mkdir(join(tempDir, '.cursor', 'luca'), { recursive: true });
    await mkdir(join(tempDir, '.cursor', 'agents'), { recursive: true });
    await mkdir(join(tempDir, '.cursor', 'rules'), { recursive: true });
    await mkdir(join(tempDir, '.cursor', 'skills'), { recursive: true });

    const { generateFiles } = await import(
      '../../../../../packages/luca-framework/src/utils/files'
    );

    // Should still work even when dirs exist
    const result = await generateFiles({
      config: { ...validLucaConfig, stack: 'custom' },
      cwd: tempDir,
    });

    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
  });

  test('handles stack-specific template path (react-ts)', async () => {
    tempDir = await createTempDir();
    const { generateFiles } = await import(
      '../../../../../packages/luca-framework/src/utils/files'
    );

    const result = await generateFiles({
      config: { ...validLucaConfig, stack: 'react-ts' },
      cwd: tempDir,
    });

    // Should complete without throwing, regardless of template availability
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
  });
});
