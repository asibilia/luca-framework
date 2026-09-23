import { execFileSync, spawn } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { z } from "zod";
import { PLUGIN_ID } from "../shared/board";

/**
 * PROTOTYPE (#353): `/luca-run` spawns the stand-in engine as a detached Bun process and
 * returns at once. The engine then pushes events back through `engine.event`.
 */

const paseoConfigSchema = z.looseObject({
  plugins: z.record(z.string(), z.looseObject({ path: z.string() })),
});

/** Inside the plugin process `import.meta.url` is undefined and cwd is "/", so ask Paseo's config. */
function pluginPath(): string {
  const home = process.env.PASEO_HOME ?? `${homedir()}/.paseo`;
  const config = paseoConfigSchema.parse(JSON.parse(readFileSync(`${home}/config.json`, "utf8")));
  const entry = config.plugins[PLUGIN_ID];
  if (!entry) {
    throw new Error(`${home}/config.json has no plugins["${PLUGIN_ID}"].path`);
  }
  return entry.path;
}

/** An absolute path, because Paseo swaps a bare `bun` or `node` for its own Node. */
function findBun(): string {
  const candidates = [process.env.LUCA_BUN, `${homedir()}/.bun/bin/bun`, "/opt/homebrew/bin/bun", "/usr/local/bin/bun"];
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }
  try {
    const found = execFileSync("/bin/zsh", ["-lc", "command -v bun"], { timeout: 3000, encoding: "utf8" }).trim();
    if (found && existsSync(found)) {
      return found;
    }
  } catch {
    // Fall through to the error below.
  }
  throw new Error("Couldn't find Bun. Set LUCA_BUN to its absolute path, or install it in ~/.bun/bin.");
}

function newRunId(): string {
  const now = new Date();
  const two = (value: number) => String(value).padStart(2, "0");
  const stamp = `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}-${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`;
  return `luca-run-${stamp}-${Math.random().toString(36).slice(2, 6).padEnd(4, "0")}`;
}

export function startEngine(agentId: string, _args: string): { ok: boolean; message: string } {
  try {
    const root = pluginPath();
    const script = `${root}/engine-replay/replay.ts`;
    if (!existsSync(script)) {
      throw new Error(`The engine script is missing: ${script}`);
    }
    const bun = findBun();
    const replayId = newRunId();
    const log = `/tmp/${replayId}.log`;
    const fd = openSync(log, "a");
    const before = Date.now();
    try {
      const child = spawn(bun, [script, "--agent-id", agentId, "--plugin-id", PLUGIN_ID, "--replay-id", replayId], {
        detached: true,
        stdio: ["ignore", fd, fd],
        cwd: root,
        env: process.env,
      });
      // Spawn failures arrive as an async event; without a listener they would crash the plugin.
      child.on("error", (error) => console.error("[luca-board-prototype] /luca-run engine process error:", error));
      child.unref();
      const ms = Date.now() - before;
      console.log(`[luca-board-prototype] /luca-run spawned bun pid=${child.pid} in ${ms} ms, log ${log}`);
      console.log(`[luca-board-prototype] /luca-run bun=${bun} script=${script}`);
      return {
        ok: true,
        message: `Started the stand-in engine (Bun pid ${child.pid}). Rows appear here in a few seconds; log: ${log}`,
      };
    } finally {
      closeSync(fd);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[luca-board-prototype] /luca-run failed:", error);
    return { ok: false, message };
  }
}
