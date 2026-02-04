import { readFile, writeFile, readdir, copyFile } from 'fs/promises';
import { join, dirname, relative } from 'pathe';
import { render } from 'ejs';
import { ensureDir } from 'fs-extra';
import { fileURLToPath } from 'url';
import { createBrandingContext } from './branding';
import type { LucaConfig } from '../types';

/**
 * Process template content - replace EJS variables.
 *
 * Uses EJS syntax for variable substitution:
 * - `<%= var %>` - Output escaped value
 * - `<%- var %>` - Output unescaped value
 * - `<% code %>` - Execute code
 *
 * @param templateContent - Raw template string with EJS syntax
 * @param context - Context object with variables to substitute
 * @returns Processed template string
 *
 * @example
 * ```typescript
 * const result = await processTemplate(
 *   'Use /<%= branding.commandPrefix %> to start',
 *   { branding: { commandPrefix: 'lu' } }
 * );
 * // Returns: 'Use /lu to start'
 * ```
 */
export async function processTemplate(
  templateContent: string,
  context: Record<string, unknown>
): Promise<string> {
  return render(templateContent, context, {
    // Strict mode - throw on undefined variables
    strict: false,
  });
}

/**
 * Process filename - replace __variable__ patterns.
 *
 * Supports nested paths like `__branding.commandPrefix__`.
 *
 * @param filename - Filename with __variable__ patterns
 * @param context - Context object with variables to substitute
 * @returns Processed filename
 *
 * @example
 * ```typescript
 * const result = processFilename(
 *   '__commandPrefix__-help.md',
 *   { commandPrefix: 'lu' }
 * );
 * // Returns: 'lu-help.md'
 * ```
 */
export function processFilename(
  filename: string,
  context: Record<string, unknown>
): string {
  return filename.replace(/__(\w+(?:\.\w+)*)__/g, (match, key) => {
    // Support nested paths like branding.commandPrefix
    const parts = key.split('.');
    let value: unknown = context;

    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = (value as Record<string, unknown>)[part];
      } else {
        // Return original if path not found
        return match;
      }
    }

    return String(value);
  });
}

/**
 * Recursively get all files in a directory.
 *
 * @param dir - Directory to scan
 * @param baseDir - Base directory for relative path calculation
 * @returns Array of relative file paths
 */
async function getAllFiles(dir: string, baseDir: string = dir): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await getAllFiles(fullPath, baseDir));
    } else {
      files.push(relative(baseDir, fullPath));
    }
  }

  return files;
}

/**
 * Check if file should be processed as template (vs binary copy).
 *
 * Template files are text-based files that can contain EJS syntax.
 * Binary files (images, fonts, etc.) are copied as-is.
 *
 * @param filename - Filename to check
 * @returns true if file should be processed as template
 */
function isTemplateFile(filename: string): boolean {
  const templateExtensions = [
    '.md',
    '.json',
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mdc',
    '.yaml',
    '.yml',
    '.txt',
    '.html',
    '.css',
    '.gitkeep',
    '.gitignore',
  ];
  return templateExtensions.some(ext => filename.endsWith(ext));
}

/**
 * Copy and process templates from source to destination.
 *
 * Processes template files with EJS substitution and copies
 * binary files as-is. Also handles filename variable substitution.
 *
 * @param options - Copy options
 * @param options.sourceDir - Source template directory
 * @param options.destDir - Destination directory
 * @param options.config - Luca configuration for template context
 * @returns Result with lists of copied and processed files
 *
 * @example
 * ```typescript
 * const result = await copyTemplates({
 *   sourceDir: '/path/to/templates',
 *   destDir: '/path/to/output',
 *   config: {
 *     branding: defaultBranding,
 *     stack: 'react-ts',
 *     workTracker: 'github'
 *   }
 * });
 * console.log(`Processed: ${result.processed.length} files`);
 * ```
 */
export async function copyTemplates(options: {
  sourceDir: string;
  destDir: string;
  config: LucaConfig;
}): Promise<{ copied: string[]; processed: string[] }> {
  const { sourceDir, destDir, config } = options;
  const context = {
    ...createBrandingContext(config.branding),
    config,
  };

  const files = await getAllFiles(sourceDir);
  const copied: string[] = [];
  const processed: string[] = [];

  for (const relPath of files) {
    const sourcePath = join(sourceDir, relPath);
    const processedRelPath = processFilename(relPath, context);
    const destPath = join(destDir, processedRelPath);

    // Ensure destination directory exists
    await ensureDir(dirname(destPath));

    if (isTemplateFile(relPath)) {
      // Process as template
      const content = await readFile(sourcePath, 'utf-8');
      const processedContent = await processTemplate(content, context);
      await writeFile(destPath, processedContent);
      processed.push(processedRelPath);
    } else {
      // Copy binary file as-is
      await copyFile(sourcePath, destPath);
      copied.push(processedRelPath);
    }
  }

  return { copied, processed };
}

/**
 * Get the templates directory path from package.
 *
 * Works both in development (src/) and production (dist/) contexts.
 *
 * @returns Absolute path to templates directory
 */
export function getTemplatesDir(): string {
  // In ES modules, use import.meta.url to get current file path
  const currentDir = dirname(fileURLToPath(import.meta.url));
  // Templates are sibling to src/dist at package root
  return join(currentDir, '..', '..', 'templates');
}
