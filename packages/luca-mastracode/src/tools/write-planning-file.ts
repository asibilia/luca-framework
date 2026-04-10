import { createTool } from '@mastra/core/tools';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname, sep } from 'node:path';
import { z } from 'zod';

export const writePlanningFileTool = createTool({
  id: 'write-planning-file',
  description: 'Read or write files inside the .planning/ directory. Allows read-only pipeline modes to persist planning artifacts (research captures, review notes, etc.) using direct filesystem access.',
  inputSchema: z.object({
    action: z.enum(['write', 'read']).describe('Operation to perform'),
    path: z.string().describe('File path relative to .planning/ directory (e.g., "RESEARCH.md" or "review-capture-dx-1.md")'),
    content: z.string().optional().describe('File content to write (required for write action)'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    content: z.string().optional(),
  }),
  execute: async (inputData) => {
    const { action, path: userPath, content } = inputData;

    // Reject absolute paths
    if (userPath.startsWith('/')) {
      return { success: false, message: 'Absolute paths are not allowed — use a relative path within .planning/' };
    }

    // Canonical path containment check
    const planningDir = join(process.cwd(), '.planning');
    const resolved = resolve(planningDir, userPath);
    if (!resolved.startsWith(planningDir + sep)) {
      return { success: false, message: 'Path escapes .planning/ boundary' };
    }

    switch (action) {
      case 'write': {
        if (content === undefined) {
          return { success: false, message: 'content is required for write action' };
        }
        mkdirSync(dirname(resolved), { recursive: true });
        writeFileSync(resolved, content, 'utf-8');
        return { success: true, message: `Written to .planning/${userPath}` };
      }
      case 'read': {
        if (!existsSync(resolved)) {
          return { success: false, message: `File not found: .planning/${userPath}` };
        }
        const fileContent = readFileSync(resolved, 'utf-8');
        return { success: true, message: `Read .planning/${userPath} (${fileContent.length} chars)`, content: fileContent };
      }
      default:
        return { success: false, message: `Unknown action: ${action}` };
    }
  },
});
