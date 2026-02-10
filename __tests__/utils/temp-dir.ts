import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

export async function createTempDir(prefix = 'luca-test-'): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

export async function cleanupTempDir(dirPath: string): Promise<void> {
  try {
    await rm(dirPath, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

export async function setupTempProject(files: Record<string, string>): Promise<string> {
  const dir = await createTempDir();

  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = join(dir, relativePath);
    const parentDir = fullPath.substring(0, fullPath.lastIndexOf('/'));
    await mkdir(parentDir, { recursive: true });
    await writeFile(fullPath, content, 'utf-8');
  }

  return dir;
}
