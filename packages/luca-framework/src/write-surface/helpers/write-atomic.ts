import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/**
 * Write a file atomically: ensure the parent dir exists, write the content
 * to a sibling `<path>.tmp` file, then `rename()` it into place. The rename
 * is atomic on POSIX, so a reader never observes a half-written file and a
 * mid-write failure can't leave .luca/ holding truncated content.
 *
 * The temp file is a *sibling* of the destination on purpose — an atomic
 * rename requires the source and destination to be on the same filesystem,
 * so the temp cannot be relocated to the OS temp dir without risking EXDEV.
 * On any failure the temp file is removed so a stray `.tmp` is not left
 * behind. (A hard crash between write and rename is inherent to this
 * pattern; `luca repair` is the recovery path for that rare case.)
 *
 * Used by every luca_phase_write_* MCP tool.
 */
export async function writeAtomicFile(
    absPath: string,
    content: string
): Promise<void> {
    await mkdir(dirname(absPath), { recursive: true })
    const tmp = `${absPath}.tmp`
    try {
        await writeFile(tmp, content)
        await rename(tmp, absPath)
    } catch (err) {
        await rm(tmp, { force: true })
        throw err
    }
}
