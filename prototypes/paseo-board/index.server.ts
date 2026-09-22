import type { PluginServerContext } from "@getpaseo/plugin/server";
import { advanceFeeds, startFeed, stopAllFeeds, stopFeed } from "./server/feed";
import { LOOP_LENGTH, snapshotAt } from "./server/fake-run";
import { TICK_MS, feedControlRpc, readBoardRpc } from "./shared/board";

/**
 * One fake Luca run lives in this daemon subprocess. A timer advances it one tick every
 * TICK_MS and it loops forever. A and B poll `board.read`; C's feeds are pushed from the timer.
 * No model calls, no agents or workspaces created, nothing sent to any agent.
 */
export default function contribute(server: PluginServerContext) {
  let tick = 0;
  // Ticks and feed commands run one at a time so timeline rows never interleave.
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = <Result>(work: () => Promise<Result>): Promise<Result> => {
    const result = queue.then(work);
    queue = result.catch(() => undefined);
    return result;
  };

  const timer = setInterval(() => {
    tick += 1;
    const current = tick;
    void enqueue(() => advanceFeeds(current)).catch((error: unknown) => {
      console.error("[luca-board-prototype] tick failed:", error);
    });
  }, TICK_MS);

  server.handle(readBoardRpc, () => snapshotAt(tick));

  server.handle(feedControlRpc, async ({ agentId, action }, { paseo }) => {
    try {
      const message = await enqueue(() =>
        action === "stop" ? stopFeed(agentId, tick) : startFeed(agentId, paseo, tick),
      );
      return { ok: true, message };
    } catch (error) {
      console.error(`[luca-board-prototype] feed ${action} failed for agent ${agentId}:`, error);
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  });

  console.log(
    `[luca-board-prototype] fake run started: one tick every ${TICK_MS} ms, ${LOOP_LENGTH} ticks per loop`,
  );

  return async () => {
    clearInterval(timer);
    await stopAllFeeds(tick);
    console.log(`[luca-board-prototype] fake run stopped at tick ${tick}`);
  };
}
