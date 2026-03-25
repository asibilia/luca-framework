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
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

import { NextResponse } from "next/server";

import { computeETag } from "~/lib/etag";
import { resolveProjectRoot } from "~/lib/project-root";
import { safeJsonParse } from "~/lib/safe-json-parse";

export async function GET() {
  try {
    const root = await resolveProjectRoot();
    const configPath = join(root, ".planning", "config.json");
    const exists = await access(configPath).then(
      () => true,
      () => false,
    );

    if (!exists) {
      return NextResponse.json({});
    }

    const raw = await readFile(configPath, "utf-8");
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
