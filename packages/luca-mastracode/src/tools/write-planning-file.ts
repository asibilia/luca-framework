import { createTool } from '@mastra/core/tools';
import { readFileSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { join, resolve, dirname, sep } from 'node:path';
import { z } from 'zod';

export const writePlanningFileTool = createTool({
  id: 'write-planning-file',
  description: 'Read or write files inside the .planning/ directory. Allows read-only pipeline modes to persist planning artifacts (research captures, review notes, etc.) using direct filesystem access.',
  inputSchema: z.object({
    action: z.enum(['write', 'read']).describe('Operation to perform'),
    path: z.string().describe('File path relative to .planning/ directory (e.g., "RESEARCH.md" or "review-capture-dx-1.md")'),
    content: z.string().optional().describe('File content (REQUIRED for "write" action, ignored for "read")'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    content: z.string().optional(),
  }),
  execute: async (inputData) => {
    const { action, path: userPath, content } = inputData;

    // Reject null bytes (defense-in-depth — Node.js ≥18.17 rejects them in fs ops)
    if (userPath.includes('\0')) {
      return { success: false, message: 'Path contains null bytes' };
    }

    // Reject absolute paths
    if (userPath.startsWith('/')) {
      return { success: false, message: 'Absolute paths are not allowed — use a relative path within .planning/' };
    }

    // Reject empty or dot-only paths (must target a file, not a directory)
    if (!userPath || userPath === '.') {
      return { success: false, message: 'path must be a filename (e.g., "RESEARCH.md"), not empty or "."' };
    }

    // Canonical path containment check (lexical — catches ../ traversal)
    const planningDir = join(process.cwd(), '.planning');
    const resolved = resolve(planningDir, userPath);
    if (!resolved.startsWith(planningDir + sep)) {
      return { success: false, message: 'Path escapes .planning/ boundary' };
    }

    switch (action) {
      case 'write': {
        if (content === undefined) {
          return { success: false, message: `content is required when action is "write" — provide the file content to write to .planning/${userPath}` };
        }
        mkdirSync(dirname(resolved), { recursive: true });
        // Post-write symlink check: verify the parent directory resolves inside .planning/
        try {
          const realParent = realpathSync(dirname(resolved));
          const realPlanning = realpathSync(planningDir);
          if (realParent !== realPlanning && !realParent.startsWith(realPlanning + sep)) {
            return { success: false, message: 'Symlink escape detected — parent directory resolves outside .planning/' };
          }
        } catch {
          // realpathSync may fail if planningDir doesn't exist yet — safe to proceed
        }
        writeFileSync(resolved, content, 'utf-8');
        return { success: true, message: `Written to .planning/${userPath}` };
      }
      case 'read': {
        try {
          const fileContent = readFileSync(resolved, 'utf-8');
          return { success: true, message: `Read .planning/${userPath} (${fileContent.length} chars)`, content: fileContent };
        } catch (err: unknown) {
          const code = err instanceof Error && 'code' in err ? (err as NodeJS.ErrnoException).code : undefined;
          if (code === 'ENOENT') {
            return { success: false, message: `File not found: .planning/${userPath}` };
          }
          throw err;
        }
      }
      default:
        return { success: false, message: `Unknown action: ${action}` };
    }
  },
});
