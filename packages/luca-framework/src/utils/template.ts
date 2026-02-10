import { readFile, writeFile, readdir, copyFile, mkdir } from 'fs/promises';
import { join, dirname, relative, resolve } from 'pathe';
import { render } from 'ejs';
import { fileURLToPath } from 'url';
import { createBrandingContext } from './branding';
import type { LucaConfig } from '../types';

/**
 * Sanitize EJS template content to only allow safe output tags.
 *
 * - Converts <%- %> (unescaped output) to <%= %> (escaped output)
 * - Strips <% %> (code execution) tags entirely
 * - Leaves <%= %> (safe output) unchanged
 */
function sanitizeTemplate(content: string): string {
  // Step 1: Convert <%- (unescaped) to <%= (escaped)
  let sanitized = content.replace(/<%-([\s\S]*?)%>/g, '<%=$1%>')
  // Step 2: Strip <% %> code execution tags (NOT <%= output tags)
  sanitized = sanitized.replace(/<%(?!=)([\s\S]*?)%>/g, '')
  return sanitized
}

/**
 * Process template content - replace EJS variables.
 *
 * Uses EJS syntax for variable substitution:
 * - `<%= var %>` - Output escaped value (safe, HTML-escaped)
 *
 * For security, only `<%= %>` output tags are supported:
 * - `<%- %>` (unescaped output) is automatically converted to `<%= %>`
 * - `<% %>` (code execution) tags are stripped entirely
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
  const safeContent = sanitizeTemplate(templateContent)
  return render(safeContent, context, {
    strict: false,
  })
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
export async function getAllFiles(dir: string, baseDir: string = dir): Promise<string[]> {
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
export function isTemplateFile(filename: string): boolean {
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
 * Verify that a resolved path is within the expected base directory.
 * Prevents path traversal via '../' in variable values.
 */
function assertWithinDirectory(filePath: string, baseDir: string): void {
  const resolved = resolve(filePath)
  const base = resolve(baseDir)
  const rel = relative(base, resolved)
  if (rel.startsWith('..') || resolve(base, rel) !== resolved) {
    throw new Error(`Path traversal detected: ${filePath} escapes ${baseDir}`)
  }
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
    assertWithinDirectory(destPath, destDir);

    // Ensure destination directory exists
    await mkdir(dirname(destPath), { recursive: true });

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
 * In source: src/utils/ → ../../templates
 * In bundle: dist/ → ../templates
 *
 * @returns Absolute path to templates directory
 */
export function getTemplatesDir(): string {
  // In ES modules, use import.meta.url to get current file path
  const currentDir = dirname(fileURLToPath(import.meta.url));

  // Check if we're in bundled context (dist/) or source context (src/utils/)
  if (currentDir.endsWith('dist')) {
    // Bundled: dist/ → ../templates
    return join(currentDir, '..', 'templates');
  }

  // Source: src/utils/ → ../../templates
  return join(currentDir, '..', '..', 'templates');
}
