import { writeFileSync, renameSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

/**
 * Atomic write — writes to a temporary file then renames.
 * Prevents corrupted state if the process crashes mid-write.
 */
export function atomicWriteSync(filePath: string, data: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.tmp`;
  writeFileSync(tmp, data, 'utf-8');
  renameSync(tmp, filePath);
}
