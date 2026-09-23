import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import type { z } from "zod";
import {
  ROW_KIND,
  ROW_VERSION,
  ticketStateSchema,
  type EventRow,
  type RunRow,
  type RunSnapshot,
  type engineEventRpc,
} from "../shared/board";
import { formatClock } from "./fake-run";

/**
 * PROTOTYPE (#353): the plugin end of `/luca-run`. The stand-in engine (a Bun process) calls
 * `engine.event` once per board event. The latest snapshot feeds B's `board.read`, and each
 * event becomes C rows in the agent the command ran in.
 */

type Paseo = PluginHandlerContext["paseo"];
type EngineEventInput = z.infer<typeof engineEventRpc.input>;

/** Keep showing a finished replay on B for this long before falling back to the fake run. */
const SHOW_ENDED_MS = 10 * 60 * 1000;

interface LatestReplay {
  runId: string;
  agentId: string;
  snapshot: RunSnapshot;
  done: boolean;
  receivedAt: number;
  lastSeq: number;
}

let latest: LatestReplay | null = null;

/** Row ids need only the replay id part, without spaces. */
function rowKey(runId: string): string {
  return runId.split(" ")[0] ?? runId;
}

export function currentReplaySnapshot(): RunSnapshot | null {
  if (!latest) {
    return null;
  }
  if (latest.done && Date.now() - latest.receivedAt > SHOW_ENDED_MS) {
    return null;
  }
  return latest.snapshot;
}

function runRow(input: EngineEventInput): RunRow {
  const { snapshot, event, runId, done } = input;
  return {
    status: done ? "ended" : "live",
    specNumber: snapshot.spec.number,
    specTitle: snapshot.spec.title,
    clock: formatClock(snapshot.elapsedSeconds),
    agentsRunning: snapshot.agentsRunning,
    counts: ticketStateSchema.options.map((state) => ({
      state,
      count: snapshot.tickets.filter((ticket) => ticket.state === state).length,
    })),
    finalReview: "not part of the tracer run",
    usage: snapshot.usage,
    limitWait: false,
    debug: `replay ${runId} · event ${event.seq}/${event.total} · sent by a Bun process via invokePluginRpc`,
    footer: done
      ? "Replay finished. Run `/luca-run` again to replay it."
      : "Live: replaying the tracer bullet's real Opus run from its journal.",
  };
}

export async function handleEngineEvent(
  input: EngineEventInput,
  paseo: Paseo,
): Promise<{ ok: boolean; message: string }> {
  const { runId, agentId, event, snapshot, done } = input;
  latest = { runId, agentId, snapshot, done, receivedAt: Date.now(), lastSeq: event.seq };

  const states = snapshot.tickets.map((ticket) => `#${ticket.number}:${ticket.state}`).join(",");
  const usage = snapshot.usage.map((plan) => `${plan.fiveHour}%/${plan.weekly}%`).join(",");
  console.log(
    `[luca-board-prototype] engine.event run=${runId} seq=${event.seq}/${event.total} kind=${event.kind} ticket=${event.ticket ?? "-"} state=${states} agentsRunning=${snapshot.agentsRunning} usage=${usage}`,
  );
  console.log(JSON.stringify(snapshot));

  try {
    const timeline = paseo.agents.ref(agentId).timeline;
    await timeline.append({
      type: "plugin",
      id: `${rowKey(runId)}-run`,
      kind: ROW_KIND.run,
      version: ROW_VERSION,
      data: runRow(input),
    });
    const row: EventRow = { clock: event.clock, ticket: event.ticket, text: event.text, tone: event.tone };
    await timeline.append({
      type: "plugin",
      id: `${rowKey(runId)}-event-${event.seq}`,
      kind: ROW_KIND.event,
      version: ROW_VERSION,
      data: row,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[luca-board-prototype] engine.event: appending rows to agent ${agentId} failed:`, error);
    return { ok: false, message: `Snapshot kept, but appending timeline rows failed: ${message}` };
  }
  return { ok: true, message: `Event ${event.seq}/${event.total} (${event.kind}) shown.` };
}
