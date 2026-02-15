import { describe, test, expect, afterEach } from 'bun:test';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { createHash } from 'crypto';
import {
  hashContent,
  hashFile,
  readManifest,
  writeManifest,
  createManifest,
  compareFiles,
} from '../../../../../packages/luca-framework/src/utils/manifest';
import { setupTempProject, cleanupTempDir, createTempDir } from '../../../../utils/temp-dir';
import { validLucaConfig, validLucaManifest, validBrandingConfig } from '../../../../utils/fixtures';
import type { LucaManifest } from '../../../../../packages/luca-framework/src/types';

// ---------------------------------------------------------------------------
// hashContent (pure)
// ---------------------------------------------------------------------------

describe('hashContent', () => {
  test('returns SHA-256 hex string', () => {
    const hash = hashContent('Hello, World!');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  test('returns consistent hash for same input', () => {
    const hash1 = hashContent('test content');
    const hash2 = hashContent('test content');
    expect(hash1).toBe(hash2);
  });

  test('returns different hashes for different inputs', () => {
    const hash1 = hashContent('content A');
    const hash2 = hashContent('content B');
    expect(hash1).not.toBe(hash2);
  });

  test('matches Node.js crypto directly', () => {
    const content = 'verify against native crypto';
    const expected = createHash('sha256').update(content).digest('hex');
    expect(hashContent(content)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// hashFile (I/O)
// ---------------------------------------------------------------------------

describe('hashFile', () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = null;
    }
  });

  test('hashes file content from disk', async () => {
    tempDir = await setupTempProject({
      'test.txt': 'file content here',
    });
    const hash = await hashFile(join(tempDir, 'test.txt'));
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    // Should match hashContent of same text (but hashFile reads as Buffer)
    const expected = createHash('sha256').update(Buffer.from('file content here')).digest('hex');
    expect(hash).toBe(expected);
  });

  test('throws for non-existent file', async () => {
    expect(hashFile('/tmp/nonexistent-file-12345.txt')).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// readManifest
// ---------------------------------------------------------------------------

describe('readManifest', () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = null;
    }
  });

  test('reads and parses existing manifest', async () => {
    const manifest: LucaManifest = {
      ...validLucaManifest,
    };
    tempDir = await setupTempProject({
      '.planning/manifest.json': JSON.stringify(manifest),
    });
    const result = await readManifest(tempDir);
    expect(result).not.toBeNull();
    expect(result!.version).toBe('0.0.1');
    expect(result!.branding.frameworkName).toBe('Luca');
  });

  test('returns null when manifest does not exist', async () => {
    tempDir = await createTempDir();
    const result = await readManifest(tempDir);
    expect(result).toBeNull();
  });

  test('returns null for invalid JSON in manifest', async () => {
    tempDir = await setupTempProject({
      '.planning/manifest.json': 'not valid json!',
    });
    const result = await readManifest(tempDir);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// writeManifest
// ---------------------------------------------------------------------------

describe('writeManifest', () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = null;
    }
  });

  test('writes manifest to .planning/manifest.json', async () => {
    tempDir = await setupTempProject({
      '.planning/.gitkeep': '',
    });
    const manifest: LucaManifest = { ...validLucaManifest };
    await writeManifest(manifest, tempDir);

    const content = await readFile(join(tempDir, '.planning', 'manifest.json'), 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.version).toBe('0.0.1');
    expect(parsed.branding.frameworkName).toBe('Luca');
  });
});

// ---------------------------------------------------------------------------
// createManifest
// ---------------------------------------------------------------------------

describe('createManifest', () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = null;
    }
  });

  test('creates manifest from config and file list', async () => {
    tempDir = await setupTempProject({
      'file1.md': '# Hello',
      'file2.md': '# World',
    });

    const manifest = await createManifest({
      config: validLucaConfig,
      cwd: tempDir,
      createdFiles: [join(tempDir, 'file1.md'), join(tempDir, 'file2.md')],
    });

    expect(manifest.version).toBe('0.0.1');
    expect(manifest.branding).toEqual(validBrandingConfig);
    expect(manifest.stack).toBe('node-ts');
    expect(manifest.workTracker).toBe('none');
    expect(Object.keys(manifest.files)).toHaveLength(2);
    expect(manifest.files['file1.md']).toBeDefined();
    expect(manifest.files['file1.md']?.originalHash).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.files['file1.md']?.source).toBe('framework');
  });

  test('skips files that cannot be hashed (e.g., directories)', async () => {
    tempDir = await setupTempProject({
      'file1.md': '# Hello',
    });
    // Include a directory path that can't be hashed as a file
    await mkdir(join(tempDir, 'subdir'), { recursive: true });

    const manifest = await createManifest({
      config: validLucaConfig,
      cwd: tempDir,
      createdFiles: [join(tempDir, 'file1.md'), join(tempDir, 'subdir')],
    });

    // Only the file should be in the manifest, directory should be skipped
    expect(Object.keys(manifest.files)).toHaveLength(1);
    expect(manifest.files['file1.md']).toBeDefined();
  });

  test('includes ISO timestamp', async () => {
    tempDir = await createTempDir();
    const manifest = await createManifest({
      config: validLucaConfig,
      cwd: tempDir,
      createdFiles: [],
    });

    expect(manifest.installedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(manifest.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(manifest.installedAt).toBe(manifest.updatedAt);
  });
});

// ---------------------------------------------------------------------------
// compareFiles
// ---------------------------------------------------------------------------

describe('compareFiles', () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = null;
    }
  });

  test('detects unchanged files', async () => {
    const content = '# Original content';
    const hash = hashContent(content);
    tempDir = await setupTempProject({
      'test.md': content,
    });

    const manifest: LucaManifest = {
      ...validLucaManifest,
      files: {
        'test.md': { originalHash: hash, source: 'framework' },
      },
    };

    const newFiles = new Map([['test.md', 'new content']]);
    const comparisons = await compareFiles(manifest, newFiles, tempDir);

    expect(comparisons).toHaveLength(1);
    expect(comparisons[0]?.status).toBe('unchanged');
    expect(comparisons[0]?.path).toBe('test.md');
    expect(comparisons[0]?.originalHash).toBe(hash);
  });

  test('detects user-modified files', async () => {
    const originalContent = '# Original';
    const originalHash = hashContent(originalContent);

    tempDir = await setupTempProject({
      'test.md': '# User modified this',
    });

    const manifest: LucaManifest = {
      ...validLucaManifest,
      files: {
        'test.md': { originalHash, source: 'framework' },
      },
    };

    const newFiles = new Map([['test.md', 'new framework content']]);
    const comparisons = await compareFiles(manifest, newFiles, tempDir);

    expect(comparisons).toHaveLength(1);
    expect(comparisons[0]?.status).toBe('user-modified');
  });

  test('detects new files (not in manifest)', async () => {
    tempDir = await createTempDir();
    const manifest: LucaManifest = {
      ...validLucaManifest,
      files: {},
    };

    const newFiles = new Map([['brand-new.md', '# Brand new file']]);
    const comparisons = await compareFiles(manifest, newFiles, tempDir);

    expect(comparisons).toHaveLength(1);
    expect(comparisons[0]?.status).toBe('new');
    expect(comparisons[0]?.originalHash).toBeNull();
    expect(comparisons[0]?.currentHash).toBeNull();
  });

  test('detects deleted files', async () => {
    tempDir = await createTempDir();
    // File in manifest but NOT on disk
    const manifest: LucaManifest = {
      ...validLucaManifest,
      files: {
        'deleted.md': { originalHash: 'abc123', source: 'framework' },
      },
    };

    const newFiles = new Map([['deleted.md', '# Updated content']]);
    const comparisons = await compareFiles(manifest, newFiles, tempDir);

    expect(comparisons).toHaveLength(1);
    expect(comparisons[0]?.status).toBe('deleted');
    expect(comparisons[0]?.currentHash).toBeNull();
  });

  test('handles multiple files with mixed statuses', async () => {
    const unchangedContent = '# Unchanged';
    const unchangedHash = hashContent(unchangedContent);

    tempDir = await setupTempProject({
      'unchanged.md': unchangedContent,
      'modified.md': '# User changed this',
    });

    const manifest: LucaManifest = {
      ...validLucaManifest,
      files: {
        'unchanged.md': { originalHash: unchangedHash, source: 'framework' },
        'modified.md': { originalHash: hashContent('# Original'), source: 'framework' },
        'deleted.md': { originalHash: 'somehash', source: 'framework' },
      },
    };

    const newFiles = new Map([
      ['unchanged.md', 'new unchanged'],
      ['modified.md', 'new modified'],
      ['deleted.md', 'new deleted'],
      ['new-file.md', 'brand new'],
    ]);

    const comparisons = await compareFiles(manifest, newFiles, tempDir);

    expect(comparisons).toHaveLength(4);

    const statusMap = Object.fromEntries(comparisons.map((c) => [c.path, c.status]));
    expect(statusMap['unchanged.md']).toBe('unchanged');
    expect(statusMap['modified.md']).toBe('user-modified');
    expect(statusMap['deleted.md']).toBe('deleted');
    expect(statusMap['new-file.md']).toBe('new');
  });

  test('handles empty newFiles map', async () => {
    tempDir = await createTempDir();
    const comparisons = await compareFiles(validLucaManifest, new Map(), tempDir);
    expect(comparisons).toHaveLength(0);
  });
});
