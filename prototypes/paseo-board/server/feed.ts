import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import {
  ROW_KIND,
  ROW_VERSION,
  TICK_MS,
  lensStateSchema,
  ticketStateSchema,
  type EventRow,
  type LimitRow,
  type RunRow,
  type RunSnapshot,
  type StuckRow,
} from "../shared/board";
import { LOOP_LENGTH, formatClock, snapshotAt } from "./fake-run";

/**
 * Variant C: plugin-owned rows in one agent's timeline. A feed follows the fake run for one
 * loop, appends a row per stage move, and updates the header, stuck, and limit-wait rows in
 * place by re-appending them with the same id. Rows are UI rows; nothing is sent to the agent.
 */

type Paseo = PluginHandlerContext["paseo"];
type RowData = RunRow | EventRow | StuckRow | LimitRow;
type RunStatus = RunRow["status"];

interface FeedSession {
  agentId: string;
  session: number;
  paseo: Paseo;
  startTick: number;
  events: number;
  openStuck: Map<string, StuckRow>;
  limitRowId: string | null;
  lastLimit: LimitRow | null;
}

const sessions = new Map<string, FeedSession>();
let nextSession = 1;

function rowId(session: FeedSession, name: string): string {
  return `s${session.session}-${name}`;
}

async function append(session: FeedSession, id: string, kind: string, data: RowData) {
  await session.paseo.agents.ref(session.agentId).timeline.append({
    type: "plugin",
    id,
    kind,
    version: ROW_VERSION,
    data,
  });
}

async function appendEvent(session: FeedSession, event: EventRow) {
  session.events += 1;
  await append(session, rowId(session, `event-${session.events}`), ROW_KIND.event, event);
}

function describeFinalReview(snapshot: RunSnapshot): string {
  const review = snapshot.finalReview;
  const lenses = lensStateSchema.options
    .map((state) => ({ state, count: review.lenses.filter((lens) => lens.state === state).length }))
    .filter((entry) => entry.count > 0)
    .map((entry) => `${entry.count} ${entry.state}`)
    .join(", ");
  switch (review.state) {
    case "waiting":
      return "waits until every ticket is done or skipped";
    case "reviewing":
      return `round ${review.round}/3 · lenses: ${lenses}`;
    case "fixing":
      return `round ${review.round}/3, fix ${review.fix}/3 running · lenses: ${lenses}`;
    case "escalated":
      return "fix loop hit its cap, a stronger model has one more round";
    case "stuck":
      return "stuck, waits for your reply";
    case "passed":
      return "passed, pull request opens";
  }
}

function runRow(session: FeedSession, snapshot: RunSnapshot, status: RunStatus): RunRow {
  const ticksLeft = Math.max(0, LOOP_LENGTH - (snapshot.tick - session.startTick));
  const footer =
    status === "live"
      ? `Live: updates in place every ${TICK_MS / 1000}s for ${ticksLeft} more ticks. \`/luca-board-demo stop\` ends it.`
      : status === "ended"
        ? "Feed ended after one loop. Run `/luca-board-demo` again to replay it."
        : "Feed stopped.";
  return {
    status,
    specNumber: snapshot.spec.number,
    specTitle: snapshot.spec.title,
    clock: formatClock(snapshot.elapsedSeconds),
    agentsRunning: snapshot.agentsRunning,
    counts: ticketStateSchema.options.map((state) => ({
      state,
      count: snapshot.tickets.filter((ticket) => ticket.state === state).length,
    })),
    finalReview: describeFinalReview(snapshot),
    usage: snapshot.usage,
    limitWait: snapshot.limitWait !== null,
    debug: `tick ${snapshot.tick} · loop ${snapshot.loop} · ${snapshot.loopTick}/${snapshot.loopLength} · scene ${snapshot.scene} · feed ${session.session}`,
    footer,
  };
}

function stuckRows(snapshot: RunSnapshot): Map<string, StuckRow> {
  const rows = new Map<string, StuckRow>();
  for (const ticket of snapshot.tickets) {
    if (ticket.stuck) {
      rows.set(`loop${snapshot.loop}-ticket-${ticket.number}`, {
        status: "waiting",
        subject: `Ticket #${ticket.number} is stuck: ${ticket.title}`,
        specNumber: snapshot.spec.number,
        reason: ticket.stuck.reason,
        tried: ticket.stuck.tried,
        replies: ticket.stuck.replies,
        waitingSeconds: ticket.stuck.waitingSeconds,
        resolution: null,
      });
    }
  }
  const review = snapshot.finalReview;
  if (review.stuck) {
    rows.set(`loop${snapshot.loop}-final-review`, {
      status: "waiting",
      subject: "The final review is stuck",
      specNumber: snapshot.spec.number,
      reason: review.stuck.reason,
      tried: review.stuck.tried,
      replies: review.stuck.replies,
      waitingSeconds: review.stuck.waitingSeconds,
      resolution: null,
    });
  }
  return rows;
}

function resolution(key: string, snapshot: RunSnapshot): string {
  const skipped = snapshot.tickets.find(
    (ticket) => key.endsWith(`-ticket-${ticket.number}`) && ticket.state === "skipped",
  );
  if (skipped) {
    return `You replied \`skip #${skipped.number}\` (a fake reply). It stays open for a later run.`;
  }
  return "The fake run looped back to its start, so this one is gone.";
}

/** Append new stuck and limit-wait rows, update open ones in place, and close finished ones. */
async function syncStateRows(session: FeedSession, snapshot: RunSnapshot) {
  const current = stuckRows(snapshot);
  for (const [key, row] of current) {
    await append(session, rowId(session, `stuck-${key}`), ROW_KIND.stuck, row);
    session.openStuck.set(key, row);
  }
  for (const [key, last] of [...session.openStuck]) {
    if (!current.has(key)) {
      session.openStuck.delete(key);
      await append(session, rowId(session, `stuck-${key}`), ROW_KIND.stuck, {
        ...last,
        status: "resolved",
        resolution: resolution(key, snapshot),
      });
    }
  }

  const planUsage = (plan: string) => snapshot.usage.find((entry) => entry.plan === plan)?.fiveHour ?? 0;
  if (snapshot.limitWait) {
    const id = session.limitRowId ?? rowId(session, `limit-loop${snapshot.loop}-${snapshot.loopTick}`);
    session.limitRowId = id;
    session.lastLimit = {
      status: "waiting",
      plan: snapshot.limitWait.plan,
      window: snapshot.limitWait.window,
      fiveHour: planUsage(snapshot.limitWait.plan),
      resetsInSeconds: snapshot.limitWait.resetsInSeconds,
      pausedAgents: snapshot.tickets.flatMap((ticket) => ticket.agents).filter((agent) => agent.state === "paused").length,
    };
    await append(session, id, ROW_KIND.limit, session.lastLimit);
  } else if (session.limitRowId && session.lastLimit) {
    await append(session, session.limitRowId, ROW_KIND.limit, {
      ...session.lastLimit,
      status: "over",
      fiveHour: planUsage(session.lastLimit.plan),
      resetsInSeconds: 0,
    });
    session.limitRowId = null;
    session.lastLimit = null;
  }
}

async function finish(session: FeedSession, snapshot: RunSnapshot, status: RunStatus) {
  sessions.delete(session.agentId);
  // Rows still open would otherwise keep claiming to wait; mark them as no longer updating.
  for (const [key, last] of session.openStuck) {
    await append(session, rowId(session, `stuck-${key}`), ROW_KIND.stuck, { ...last, status: "ended" });
  }
  session.openStuck.clear();
  if (session.limitRowId && session.lastLimit) {
    await append(session, session.limitRowId, ROW_KIND.limit, { ...session.lastLimit, status: "ended" });
    session.limitRowId = null;
  }
  await append(session, rowId(session, "run"), ROW_KIND.run, runRow(session, snapshot, status));
}

export async function startFeed(agentId: string, paseo: Paseo, tick: number): Promise<string> {
  const snapshot = snapshotAt(tick);
  const previous = sessions.get(agentId);
  if (previous) {
    await finish(previous, snapshot, "stopped");
  }
  const session: FeedSession = {
    agentId,
    session: nextSession,
    paseo,
    startTick: tick,
    events: 0,
    openStuck: new Map(),
    limitRowId: null,
    lastLimit: null,
  };
  nextSession += 1;
  sessions.set(agentId, session);
  try {
    await append(session, rowId(session, "run"), ROW_KIND.run, runRow(session, snapshot, "live"));
    await appendEvent(session, {
      clock: formatClock(snapshot.elapsedSeconds),
      ticket: null,
      text: `Feed started at run time ${formatClock(snapshot.elapsedSeconds)} (tick ${tick}). It follows the fake run for one loop, about ${Math.round((LOOP_LENGTH * TICK_MS) / 60000)} minutes.`,
      tone: "info",
    });
    await syncStateRows(session, snapshot);
  } catch (error) {
    sessions.delete(agentId);
    throw error;
  }
  console.log(`[luca-board-prototype] feed ${session.session} started in agent ${agentId} at tick ${tick}`);
  return `Streaming the fake Luca run into this agent's timeline for one loop (${LOOP_LENGTH} ticks).`;
}

export async function stopFeed(agentId: string, tick: number): Promise<string> {
  const session = sessions.get(agentId);
  if (!session) {
    return "No Luca board feed is running in this agent.";
  }
  await finish(session, snapshotAt(tick), "stopped");
  console.log(`[luca-board-prototype] feed ${session.session} stopped in agent ${agentId}`);
  return "Stopped the Luca board feed.";
}

/** Called once per tick by the server timer. */
export async function advanceFeeds(tick: number) {
  if (sessions.size === 0) {
    return;
  }
  const snapshot = snapshotAt(tick);
  const moves = snapshot.journal.filter((entry) => entry.loopTick === snapshot.loopTick);
  for (const session of [...sessions.values()]) {
    try {
      if (snapshot.loopTick === 0) {
        await appendEvent(session, {
          clock: formatClock(snapshot.elapsedSeconds),
          ticket: null,
          text: "The fake run loops back to its start (prototype).",
          tone: "info",
        });
      }
      for (const move of moves) {
        await appendEvent(session, { clock: move.clock, ticket: move.ticket, text: move.text, tone: move.tone });
      }
      await syncStateRows(session, snapshot);
      const done = tick - session.startTick >= LOOP_LENGTH;
      if (done) {
        await finish(session, snapshot, "ended");
        console.log(`[luca-board-prototype] feed ${session.session} ended after one loop`);
      } else {
        await append(session, rowId(session, "run"), ROW_KIND.run, runRow(session, snapshot, "live"));
      }
    } catch (error) {
      sessions.delete(session.agentId);
      console.error(`[luca-board-prototype] feed ${session.session} in agent ${session.agentId} failed and stopped:`, error);
    }
  }
}

/** Best effort on plugin stop: mark open feeds stopped, but never hold up the shutdown. */
export async function stopAllFeeds(tick: number) {
  const open = [...sessions.values()];
  sessions.clear();
  if (open.length === 0) {
    return;
  }
  const snapshot = snapshotAt(tick);
  const marks = Promise.allSettled(
    open.map((session) => append(session, rowId(session, "run"), ROW_KIND.run, runRow(session, snapshot, "stopped"))),
  );
  await Promise.race([marks, new Promise((resolve) => setTimeout(() => resolve(undefined), 1500))]);
}
