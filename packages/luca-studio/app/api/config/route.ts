/**
 * GET /api/config -- Read `.planning/config.json` and return with ETag.
 *
 * Serves the Luca project configuration for the Studio frontend.
 * Missing config files return `{}` with 200 (not 500).
 *
 * Response headers:
 * - `Content-Type: application/json`
 * - `ETag: <16-char hex sha256 prefix>`
 */
import { createHash } from "node:crypto";
import { join } from "node:path";

import { NextResponse } from "next/server";

import { resolveProjectRoot } from "~/lib/project-root";
import { safeJsonParse } from "~/lib/safe-json-parse";

/**
 * Compute a short ETag from raw file contents.
 *
 * Uses the first 16 hex characters of the SHA-256 digest.
 * Kept inline so this route has no external dependency on a shared ETag
 * utility that may not exist yet (Plan 1 runs in parallel).
 *
 * @param contents - Raw file contents as a string.
 * @returns 16-character hex string suitable for an ETag header value.
 */
function computeETag(contents: string): string {
  return createHash("sha256").update(contents).digest("hex").substring(0, 16);
}

export async function GET() {
  try {
    const root = await resolveProjectRoot();
    const configPath = join(root, ".planning", "config.json");
    const file = Bun.file(configPath);
    const exists = await file.exists();

    if (!exists) {
      return NextResponse.json({});
    }

    const raw = await file.text();
    const parsed = safeJsonParse(raw, {});
    const etag = computeETag(raw);

    return NextResponse.json(parsed, {
      headers: { ETag: etag },
    });
  } catch {
    // Graceful degradation -- return empty config on any unexpected error
    return NextResponse.json({});
  }
}
