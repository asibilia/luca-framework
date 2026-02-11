#!/usr/bin/env bun

/**
 * build-utils.ts — Shared build utilities for stale file cleanup and directory management
 *
 * Used by build-cursor.ts, build-claude.ts, and build-all.ts to ensure
 * clean output directories before writing generated files.
 */
import { readdir, unlink, rm, lstat, mkdir } from 'fs/promises';
import path from 'path';

/**
 * Remove all files matching extensions from a directory.
 * Also removes symlinks and subdirectories (to handle special cases).
 * Does NOT remove the directory itself.
 */
export async function cleanDirectory(dir: string, extensions: string[]): Promise<string[]> {
  const removed: string[] = [];
  let entries: string[];

  try {
    entries = await readdir(dir);
  } catch {
    return removed;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    try {
      const stat = await lstat(fullPath);

      if (stat.isSymbolicLink()) {
        await unlink(fullPath);
        removed.push(fullPath);
      } else if (stat.isDirectory()) {
        await rm(fullPath, { recursive: true });
        removed.push(fullPath);
      } else if (extensions.some(ext => entry.endsWith(ext))) {
        await unlink(fullPath);
        removed.push(fullPath);
      }
    } catch (error) {
      console.warn(`⚠ Failed to clean ${fullPath}:`, error);
    }
  }

  return removed;
}

/**
 * Clean all skill subdirectories from a skills output directory.
 * Skills live in subdirectories (e.g., .cursor/skills/code-lint/SKILL.md).
 */
export async function cleanSkillsDirectory(dir: string): Promise<string[]> {
  const removed: string[] = [];
  let entries: string[];

  try {
    entries = await readdir(dir);
  } catch {
    return removed;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    try {
      const stat = await lstat(fullPath);
      if (stat.isDirectory()) {
        await rm(fullPath, { recursive: true });
        removed.push(fullPath);
      }
    } catch (error) {
      console.warn(`⚠ Failed to clean ${fullPath}:`, error);
    }
  }

  return removed;
}

/**
 * Ensure a directory exists, creating it if needed.
 */
export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}
