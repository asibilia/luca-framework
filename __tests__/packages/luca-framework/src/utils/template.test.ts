import { describe, test, expect, afterEach } from 'bun:test';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import {
  processTemplate,
  processFilename,
  copyTemplates,
  getTemplatesDir,
} from '../../../../../packages/luca-framework/src/utils/template';
import { setupTempProject, cleanupTempDir, createTempDir } from '../../../../utils/temp-dir';
import { validLucaConfig, validBrandingConfig } from '../../../../utils/fixtures';

// ---------------------------------------------------------------------------
// processTemplate (pure EJS)
// ---------------------------------------------------------------------------

describe('processTemplate', () => {
  test('replaces simple EJS variable', async () => {
    const result = await processTemplate(
      'Use /<%= branding.commandPrefix %> to start',
      { branding: { commandPrefix: 'lu' } }
    );
    expect(result).toBe('Use /lu to start');
  });

  test('handles multiple variables in one template', async () => {
    const result = await processTemplate(
      '<%= name %> uses /<%= prefix %> commands',
      { name: 'Luca', prefix: 'lu' }
    );
    expect(result).toBe('Luca uses /lu commands');
  });

  test('handles nested object access', async () => {
    const result = await processTemplate(
      '<%= config.branding.frameworkName %>',
      { config: { branding: { frameworkName: 'TestBot' } } }
    );
    expect(result).toBe('TestBot');
  });

  test('handles EJS code blocks', async () => {
    const result = await processTemplate(
      '<% if (show) { %>visible<% } %>',
      { show: true }
    );
    expect(result).toBe('visible');
  });

  test('returns empty for false conditional', async () => {
    const result = await processTemplate(
      '<% if (show) { %>visible<% } %>',
      { show: false }
    );
    expect(result).toBe('');
  });

  test('handles unescaped output', async () => {
    const result = await processTemplate(
      '<%- raw %>',
      { raw: '<b>bold</b>' }
    );
    expect(result).toBe('<b>bold</b>');
  });

  test('preserves text with no EJS tags', async () => {
    const result = await processTemplate(
      'No variables here, just plain text.',
      {}
    );
    expect(result).toBe('No variables here, just plain text.');
  });
});

// ---------------------------------------------------------------------------
// processFilename (pure)
// ---------------------------------------------------------------------------

describe('processFilename', () => {
  test('replaces single __variable__ pattern', () => {
    const result = processFilename('__commandPrefix__-help.md', {
      commandPrefix: 'lu',
    });
    expect(result).toBe('lu-help.md');
  });

  test('replaces nested __a.b__ pattern', () => {
    const result = processFilename('__branding.commandPrefix__-skill.md', {
      branding: { commandPrefix: 'lu' },
    });
    expect(result).toBe('lu-skill.md');
  });

  test('replaces multiple patterns in one filename', () => {
    const result = processFilename('__name__-__prefix__.md', {
      name: 'luca',
      prefix: 'lu',
    });
    expect(result).toBe('luca-lu.md');
  });

  test('leaves unmatched patterns intact', () => {
    const result = processFilename('__missing__-file.md', {
      other: 'value',
    });
    expect(result).toBe('__missing__-file.md');
  });

  test('handles filename with no patterns', () => {
    const result = processFilename('plain-file.md', {
      commandPrefix: 'lu',
    });
    expect(result).toBe('plain-file.md');
  });

  test('handles deeply nested path context', () => {
    const result = processFilename('__a.b.c__-file.md', {
      a: { b: { c: 'deep' } },
    });
    expect(result).toBe('deep-file.md');
  });
});

// ---------------------------------------------------------------------------
// copyTemplates (I/O with temp dirs)
// ---------------------------------------------------------------------------

describe('copyTemplates', () => {
  let sourceDir: string | null = null;
  let destDir: string | null = null;

  afterEach(async () => {
    if (sourceDir) await cleanupTempDir(sourceDir);
    if (destDir) await cleanupTempDir(destDir);
    sourceDir = null;
    destDir = null;
  });

  test('processes template files with EJS substitution', async () => {
    sourceDir = await setupTempProject({
      'README.md': '# <%= branding.frameworkName %>\nUse /<%= branding.commandPrefix %>',
    });
    destDir = await createTempDir();

    const result = await copyTemplates({
      sourceDir,
      destDir,
      config: validLucaConfig,
    });

    expect(result.processed).toContain('README.md');
    const content = await readFile(join(destDir, 'README.md'), 'utf-8');
    expect(content).toBe('# Luca\nUse /lu');
  });

  test('copies binary files as-is (non-template extensions)', async () => {
    sourceDir = await setupTempProject({
      'image.png': 'fake-binary-data',
    });
    destDir = await createTempDir();

    const result = await copyTemplates({
      sourceDir,
      destDir,
      config: validLucaConfig,
    });

    expect(result.copied).toContain('image.png');
    const content = await readFile(join(destDir, 'image.png'), 'utf-8');
    expect(content).toBe('fake-binary-data');
  });

  test('processes filenames with __variable__ patterns', async () => {
    sourceDir = await setupTempProject({
      '__branding.commandPrefix__-help.md': '# Help for <%= branding.frameworkName %>',
    });
    destDir = await createTempDir();

    const result = await copyTemplates({
      sourceDir,
      destDir,
      config: validLucaConfig,
    });

    expect(result.processed).toContain('lu-help.md');
    expect(existsSync(join(destDir, 'lu-help.md'))).toBe(true);
    const content = await readFile(join(destDir, 'lu-help.md'), 'utf-8');
    expect(content).toBe('# Help for Luca');
  });

  test('handles nested directories', async () => {
    sourceDir = await setupTempProject({
      'rules/workflow.md': '# <%= branding.frameworkName %> workflow',
      'skills/help.md': 'Use /<%= branding.commandPrefix %>',
    });
    destDir = await createTempDir();

    const result = await copyTemplates({
      sourceDir,
      destDir,
      config: validLucaConfig,
    });

    expect(result.processed.length).toBe(2);
    expect(existsSync(join(destDir, 'rules', 'workflow.md'))).toBe(true);
    expect(existsSync(join(destDir, 'skills', 'help.md'))).toBe(true);
  });

  test('handles empty source directory', async () => {
    sourceDir = await createTempDir();
    destDir = await createTempDir();

    const result = await copyTemplates({
      sourceDir,
      destDir,
      config: validLucaConfig,
    });

    expect(result.processed).toEqual([]);
    expect(result.copied).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getTemplatesDir
// ---------------------------------------------------------------------------

describe('getTemplatesDir', () => {
  test('returns a string path', () => {
    const dir = getTemplatesDir();
    expect(typeof dir).toBe('string');
    expect(dir.length).toBeGreaterThan(0);
  });
});
