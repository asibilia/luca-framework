import { join } from "pathe";

/**
 * Package version — injected at build time by unbuild's replace plugin.
 *
 * At build time, `__LUCA_VERSION__` is replaced with the real version string
 * from package.json (e.g., `"6.0.0"`). When running from source (dev mode),
 * the sentinel is not replaced and the typeof check falls through to read
 * package.json directly.
 */
declare const __LUCA_VERSION__: string | undefined;

/**
 * Resolve the package version. At build time, __LUCA_VERSION__ is injected.
 * In dev mode, reads package.json via Bun.file (async, cached via top-level await).
 */
async function resolveVersion(): Promise<string> {
  if (typeof __LUCA_VERSION__ !== "undefined") return __LUCA_VERSION__;
  try {
    const pkgPath = join(import.meta.dir ?? ".", "..", "..", "package.json");
    const pkg = JSON.parse(await Bun.file(pkgPath).text());
    return pkg.version ?? "0.0.0-dev";
  } catch {
    return "0.0.0-dev";
  }
}

export const LUCA_VERSION: string = await resolveVersion();
