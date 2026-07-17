/**
 * Generic JSONL corpus loader: one JSON object per line, each validated
 * against a Zod schema. Path is resolved relative to this module.
 */
import type { z } from 'zod'

export async function loadJsonl<T>(
    relativePath: string,
    schema: z.ZodType<T>
): Promise<T[]> {
    const url = new URL(relativePath, import.meta.url)
    const text = await Bun.file(url).text()
    const out: T[] = []
    for (const line of text.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed) continue
        const parsed = schema.safeParse(JSON.parse(trimmed))
        if (!parsed.success) {
            throw new Error(`corpus row invalid: ${trimmed} — ${parsed.error.message}`)
        }
        out.push(parsed.data)
    }
    return out
}
