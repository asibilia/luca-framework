import { homedir } from "node:os";
import { parseArgs } from "node:util";
import { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { z } from "zod";
import {
  PLUGIN_ID,
  engineEventRpc,
  lensNameSchema,
  runSnapshotSchema,
  type Agent,
  type BoardEvent,
  type BoardEventKind,
  type Findings,
  type RunSnapshot,
  type Ticket,
  type Tone,
} from "../shared/board";
import { formatClock } from "../server/fake-run";

/**
 * PROTOTYPE (#353): a stand-in for the Luca engine. It replays a real run journal (JSONL),
 * reduces it into board events plus a full RunSnapshot after each one, and pushes them into
 * the plugin with `invokePluginRpc(…, "engine.event", …)`. Runs under Bun, not Node.
 *
 *   bun engine-replay/replay.ts --agent-id <id> [--plugin-id …] [--journal …] [--seconds 90] [--dry-run]
 */

const optionsSchema = z.object({
  agentId: z.string().min(1),
  pluginId: z.string().min(1).default(PLUGIN_ID),
  /** One id per replay, so a second replay into the same chat gets fresh rows. */
  replayId: z.string().min(1).default(`replay-${Date.now().toString(36)}`),
  journal: z.string().min(1).default(`${import.meta.dir}/tracer-run-l47v.jsonl`),
  seconds: z.coerce.number().positive().default(90),
  dryRun: z.boolean().default(false),
});
type Options = z.infer<typeof optionsSchema>;

function readOptions(): Options {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      "agent-id": { type: "string" },
      "plugin-id": { type: "string" },
      "replay-id": { type: "string" },
      journal: { type: "string" },
      seconds: { type: "string" },
      "dry-run": { type: "boolean" },
    },
  });
  const parsed = optionsSchema.safeParse({
    agentId: values["agent-id"],
    pluginId: values["plugin-id"],
    replayId: values["replay-id"],
    journal: values.journal,
    seconds: values.seconds,
    dryRun: values["dry-run"],
  });
  if (!parsed.success) {
    console.error(`[engine-replay] bad options: ${parsed.error.message}`);
    process.exit(1);
  }
  return parsed.data;
}

// ---------- journal lines (only the fields we read) ----------

const utilization = z.object({ utilization: z.number() });
const usageShape = z.looseObject({ five_hour: utilization, seven_day: utilization });
const tokenUsage = z.looseObject({
  input_tokens: z.number().default(0),
  output_tokens: z.number().default(0),
  cache_read_input_tokens: z.number().default(0),
  cache_creation_input_tokens: z.number().default(0),
});
const ticketRef = z.union([z.number(), z.string()]).transform((value) => Number(String(value).replace("#", "")));

const lineSchema = z.discriminatedUnion("kind", [
  z.looseObject({ kind: z.literal("run_start"), ts: z.string(), run_id: z.string(), spec: z.number(), model: z.string() }),
  z.looseObject({ kind: z.literal("preflight"), ts: z.string(), account: z.looseObject({ subscriptionType: z.string() }), usage: usageShape }),
  z.looseObject({
    kind: z.literal("intake_snapshot"),
    ts: z.string(),
    spec: z.looseObject({ number: z.number(), title: z.string() }),
    tickets: z.array(z.looseObject({ number: z.number(), title: z.string() })),
  }),
  z.looseObject({ kind: z.literal("intake"), ts: z.string(), ok: z.boolean() }),
  z.looseObject({ kind: z.literal("worktree"), ts: z.string(), branch: z.string() }),
  z.looseObject({
    kind: z.literal("gate_run"),
    ts: z.string(),
    label: z.string(),
    ok: z.boolean(),
    tests: z.looseObject({ cases: z.array(z.looseObject({ status: z.string() })) }),
  }),
  z.looseObject({
    kind: z.literal("agent_start"),
    ts: z.string(),
    agent: z.string(),
    role: z.string(),
    ticket: ticketRef,
    options: z.looseObject({ model: z.string() }),
  }),
  z.looseObject({ kind: z.literal("prompt"), ts: z.string(), agent: z.string(), turn: z.number() }),
  z.looseObject({ kind: z.literal("state"), ts: z.string(), step: z.string() }),
  z.looseObject({
    kind: z.literal("agent_result"),
    ts: z.string(),
    agent: z.string(),
    turn: z.number(),
    ok: z.boolean(),
    output: z.looseObject({ outcome: z.string().nullish(), verdict: z.string().nullish() }).nullish(),
    usage: tokenUsage.nullish(),
  }),
  z.looseObject({ kind: z.literal("red_check"), ts: z.string(), ticket: ticketRef, round: z.number(), ok: z.boolean(), notes: z.array(z.string()) }),
  z.looseObject({ kind: z.literal("commit"), ts: z.string(), ticket: ticketRef, sha: z.string(), subject: z.string() }),
  z.looseObject({ kind: z.literal("usage_snapshot"), ts: z.string(), snapshot: usageShape }),
  z.looseObject({ kind: z.literal("agent_end"), ts: z.string(), agent: z.string() }),
  z.looseObject({
    kind: z.literal("agent_summary"),
    ts: z.string(),
    name: z.string(),
    role: z.string(),
    ticket: ticketRef,
    model: z.string(),
    tokens: z.object({ input: z.number(), output: z.number(), cache_read: z.number(), cache_creation: z.number() }),
  }),
  z.looseObject({
    kind: z.literal("review"),
    ts: z.string(),
    ticket: ticketRef,
    round: z.number(),
    verdict: z.string(),
    findings: z.array(z.looseObject({ id: z.string(), severity: z.string(), title: z.string() })),
  }),
  z.looseObject({ kind: z.literal("pr"), ts: z.string(), url: z.string(), title: z.string() }),
  z.looseObject({ kind: z.literal("cleanup"), ts: z.string() }),
]);
type Line = z.infer<typeof lineSchema>;

// ---------- reducer ----------

interface DraftAgent extends Agent {
  name: string;
  ticket: number;
  ended: boolean;
}

interface ReplayState {
  runId: string;
  startMs: number;
  model: string;
  plan: string;
  spec: { number: number; title: string };
  branch: string;
  scene: string;
  usage: { fiveHour: number; weekly: number } | null;
  tickets: Omit<Ticket, "agents">[];
  agents: DraftAgent[];
  commits: number;
  prUrl: string | null;
}

type DraftEvent = Omit<BoardEvent, "seq" | "total" | "clock"> & { elapsedSeconds: number; state: ReplayState };

const initialState: ReplayState = {
  runId: "unknown",
  startMs: 0,
  model: "unknown",
  plan: "Claude plan",
  spec: { number: 0, title: "" },
  branch: "",
  scene: "starting",
  usage: null,
  tickets: [],
  agents: [],
  commits: 0,
  prUrl: null,
};

const ROLE: Record<string, Agent["role"]> = {
  "test-writer": "test-writer",
  implementer: "implementer",
  "ticket-reviewer": "reviewer",
};

function shortTokens(tokens: number): string {
  return tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens);
}

function reduce(previous: ReplayState, line: Line): { state: ReplayState; events: Omit<DraftEvent, "state" | "elapsedSeconds" | "ts">[] } {
  const state: ReplayState = structuredClone(previous);
  const events: Omit<DraftEvent, "state" | "elapsedSeconds" | "ts">[] = [];
  const emit = (kind: BoardEventKind, ticket: number | null, text: string, tone: Tone = "info") => {
    events.push({ kind, ticket, text, tone });
  };
  const ticketOf = (number: number) => state.tickets.find((ticket) => ticket.number === number);
  const agentOf = (name: string) => state.agents.find((agent) => agent.name === name);
  const setUsage = (fiveHour: number, weekly: number, announce: boolean) => {
    const changed = !state.usage || state.usage.fiveHour !== fiveHour || state.usage.weekly !== weekly;
    const first = state.usage === null;
    state.usage = { fiveHour, weekly };
    if (changed && (announce || !first)) {
      emit("usage", null, `${state.plan} usage: ${fiveHour}% of the 5-hour window, ${weekly}% of the week`);
    }
  };

  switch (line.kind) {
    case "run_start":
      state.runId = line.run_id;
      state.startMs = Date.parse(line.ts);
      state.model = line.model;
      state.spec = { number: line.spec, title: "" };
      state.scene = "preflight";
      emit("run_start", null, `Run ${line.run_id} started on spec #${line.spec} with ${line.model}`);
      break;
    case "preflight":
      state.plan = line.account.subscriptionType;
      setUsage(line.usage.five_hour.utilization, line.usage.seven_day.utilization, state.usage === null);
      break;
    case "intake_snapshot":
      state.spec = { number: line.spec.number, title: line.spec.title };
      state.tickets = line.tickets.map((ticket) => ({
        number: ticket.number,
        title: ticket.title,
        refactor: false,
        state: "building",
        dependsOn: [],
        activity: "queued",
        step: -1,
        fix: 0,
        review: 0,
        tests: null,
        findings: null,
        stuck: null,
        note: null,
      }));
      break;
    case "intake":
      emit(
        "intake",
        null,
        `Intake ${line.ok ? "OK" : "failed"}: ${state.tickets.map((ticket) => `#${ticket.number} ${ticket.title}`).join(", ")}`,
        line.ok ? "success" : "danger",
      );
      break;
    case "worktree":
      state.branch = line.branch;
      emit("worktree", null, `Worktree ready on ${line.branch}`);
      break;
    case "state":
      state.scene = line.step;
      break;
    case "gate_run": {
      const cases = line.tests.cases;
      const failing = cases.filter((entry) => entry.status !== "passed").length;
      const active = state.tickets.find((ticket) => ticket.step >= 0 && ticket.state !== "done");
      if (line.label !== "baseline" && active) {
        active.step = 3;
        active.activity = "checks";
        active.tests = { failing: line.ok ? 0 : failing, total: cases.length };
      }
      const what = cases.length > 0 ? `${cases.length - failing}/${cases.length} tests pass, types clean` : "no tests yet, types clean";
      emit(
        "gates",
        line.label === "baseline" ? null : (active?.number ?? null),
        `Gates (${line.label}) ${line.ok ? "pass" : "fail"}: ${what}`,
        line.ok ? "success" : "danger",
      );
      break;
    }
    case "agent_start": {
      const role = ROLE[line.role] ?? "implementer";
      state.agents.push({
        name: line.agent,
        ticket: line.ticket,
        ended: false,
        role,
        family: "claude",
        model: line.options.model,
        state: "running",
        tokens: 0,
        note: line.agent,
      });
      const ticket = ticketOf(line.ticket);
      if (ticket) {
        if (role === "test-writer") {
          ticket.state = "building";
          ticket.step = 0;
          ticket.activity = "tests";
        } else if (role === "implementer") {
          ticket.state = "building";
          ticket.step = 2;
          ticket.activity = "code";
        } else {
          ticket.state = "reviewing";
          ticket.step = 4;
          ticket.activity = "review";
          ticket.review += 1;
        }
      }
      emit("agent_start", line.ticket, `${line.agent} started (${line.options.model})`);
      break;
    }
    case "prompt": {
      // Later turns of a long-lived agent have no agent_start; the prompt marks them.
      const agent = agentOf(line.agent);
      if (agent && line.turn > 1) {
        agent.state = "running";
        const ticket = ticketOf(agent.ticket);
        if (ticket && agent.role === "implementer") {
          ticket.state = "building";
          ticket.step = 2;
          ticket.activity = "code";
        }
        emit("agent_start", agent.ticket, `${line.agent} turn ${line.turn} started (fixing review findings)`);
      }
      break;
    }
    case "agent_result": {
      const agent = agentOf(line.agent);
      const usage = line.usage;
      const tokens = usage
        ? usage.input_tokens + usage.output_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
        : 0;
      if (agent) {
        agent.tokens += tokens;
        if (!agent.ended) {
          agent.state = line.ok ? "idle" : "failed";
        }
      }
      const outcome = line.output?.verdict ?? line.output?.outcome ?? (line.ok ? "ok" : "failed");
      emit(
        "agent_result",
        agent?.ticket ?? null,
        `${line.agent} turn ${line.turn}: ${outcome.replaceAll("_", " ")} · ${shortTokens(tokens)} tokens`,
        line.ok ? "info" : "danger",
      );
      break;
    }
    case "red_check": {
      const ticket = ticketOf(line.ticket);
      if (ticket) {
        ticket.step = 1;
        ticket.activity = "red check";
        ticket.tests = { failing: line.notes.length, total: line.notes.length };
      }
      emit(
        "red_check",
        line.ticket,
        line.ok
          ? `Red check round ${line.round} passed: all ${line.notes.length} new tests fail first`
          : `Red check round ${line.round} failed`,
        line.ok ? "success" : "danger",
      );
      break;
    }
    case "commit":
      state.commits += 1;
      emit("commit", line.ticket, `Commit ${line.sha.slice(0, 7)}: ${line.subject}`);
      break;
    case "usage_snapshot":
      setUsage(line.snapshot.five_hour.utilization, line.snapshot.seven_day.utilization, false);
      break;
    case "agent_end": {
      const agent = agentOf(line.agent);
      if (agent) {
        agent.ended = true;
        agent.state = "done";
      }
      break;
    }
    case "agent_summary": {
      const agent = agentOf(line.name);
      const total = line.tokens.input + line.tokens.output + line.tokens.cache_read + line.tokens.cache_creation;
      if (agent) {
        agent.ended = true;
        agent.state = "done";
        agent.tokens = total;
      }
      emit("agent_end", line.ticket, `${line.name} finished · ${shortTokens(total)} tokens in total`);
      break;
    }
    case "review": {
      const ticket = ticketOf(line.ticket);
      const count = (severity: string) => line.findings.filter((finding) => finding.severity === severity).length;
      const findings: Findings = { blocker: count("blocker"), shouldFix: count("should_fix"), nit: count("nit") };
      const approved = line.verdict === "approve";
      if (ticket) {
        ticket.review = line.round;
        ticket.findings = findings;
        if (approved) {
          ticket.state = "done";
          ticket.step = 5;
          ticket.activity = "done";
          ticket.note = `Approved in review round ${line.round}`;
        } else {
          ticket.state = "building";
          ticket.activity = "fix pass";
          ticket.note = `Review round ${line.round}: ${line.findings.map((finding) => finding.id).join(", ")}`;
        }
      }
      emit(
        "review",
        line.ticket,
        approved
          ? `Ticket review round ${line.round}: approved`
          : `Ticket review round ${line.round}: ${line.verdict.replaceAll("_", " ")} (${findings.blocker} blockers, ${findings.shouldFix} should-fix, ${findings.nit} nits)`,
        approved ? "success" : "warning",
      );
      if (approved) {
        emit("ticket_stage", line.ticket, `#${line.ticket} is done: every step passed`, "success");
      }
      break;
    }
    case "pr":
      state.prUrl = line.url;
      emit("pr", null, `Draft PR opened: ${line.url}`, "success");
      break;
    case "cleanup":
      emit("cleanup", null, "Cleanup: worktree removed, local branch deleted");
      break;
  }
  return { state, events };
}

function draftEvents(lines: Line[]): DraftEvent[] {
  const out: DraftEvent[] = [];
  let state = initialState;
  for (const line of lines) {
    const next = reduce(state, line);
    state = next.state;
    const elapsedSeconds = Math.max(0, Math.round((Date.parse(line.ts) - state.startMs) / 1000));
    for (const event of next.events) {
      out.push({ ...event, ts: line.ts, elapsedSeconds, state });
    }
  }
  const last = out[out.length - 1];
  if (last) {
    const done = last.state.tickets.filter((ticket) => ticket.state === "done").length;
    const endState: ReplayState = { ...structuredClone(last.state), scene: "run finished" };
    out.push({
      kind: "run_end",
      ticket: null,
      text: `Run finished in ${formatClock(last.elapsedSeconds)}: ${done}/${endState.tickets.length} tickets done, ${endState.commits} commits${endState.prUrl ? `, ${endState.prUrl}` : ""}`,
      tone: "success",
      ts: last.ts,
      elapsedSeconds: last.elapsedSeconds,
      state: endState,
    });
  }
  return out;
}

function toSnapshot(event: BoardEvent, draft: DraftEvent, journal: BoardEvent[]): RunSnapshot {
  const { state } = draft;
  return {
    tick: event.seq,
    loop: 1,
    loopTick: event.seq,
    loopLength: event.total,
    scene: state.scene,
    spec: state.spec,
    branch: state.branch,
    elapsedSeconds: draft.elapsedSeconds,
    agentsRunning: state.agents.filter((agent) => agent.state === "running").length,
    limitWait: null,
    usage: state.usage ? [{ plan: state.plan, family: "claude", ...state.usage }] : [],
    tickets: state.tickets.map((ticket) => ({
      ...ticket,
      agents: state.agents
        .filter((agent) => agent.ticket === ticket.number)
        .map(({ role, family, model, state: agentState, tokens, note }) => ({ role, family, model, state: agentState, tokens, note })),
    })),
    finalReview: {
      state: "waiting",
      round: 0,
      fix: 0,
      lenses: lensNameSchema.options.map((name) => ({
        name,
        state: "waiting" as const,
        activity: "not run",
        findings: { blocker: 0, shouldFix: 0, nit: 0 },
        note: "The tracer run had no final review",
        model: "none",
        family: "gpt" as const,
        tokens: 0,
      })),
      agents: [],
      stuck: null,
    },
    journal: journal.slice(-12).map((entry) => ({
      loopTick: entry.seq,
      clock: entry.clock,
      ticket: entry.ticket,
      text: entry.text,
      tone: entry.tone,
    })),
    source: `replay · ${state.runId} · event ${event.seq}/${event.total}`,
  };
}

// ---------- sending ----------

async function connect(): Promise<DaemonClient> {
  const password = process.env.PASEO_PASSWORD;
  let endpoint = process.env.PASEO_HOST;
  if (!endpoint) {
    const home = process.env.PASEO_HOME ?? `${homedir()}/.paseo`;
    const pid = z.object({ listen: z.string() }).parse(JSON.parse(await Bun.file(`${home}/paseo.pid`).text()));
    endpoint = pid.listen;
  }
  const client = new DaemonClient({
    url: `ws://${endpoint}/ws`,
    clientId: "luca-engine-replay",
    clientType: "cli",
    appVersion: "0.9.1",
    reconnect: { enabled: false },
    connectTimeoutMs: 5000,
    ...(password ? { password } : {}),
  });
  await client.connect();
  console.log(`[engine-replay] connected to ${endpoint}`);
  return client;
}

async function main() {
  const options = readOptions();
  const text = await Bun.file(options.journal).text();
  const raws = text.split("\n").filter((raw) => raw.trim());
  const known = new Set<string>(lineSchema.options.map((option) => option.shape.kind.value));
  const lines: Line[] = [];
  for (const raw of raws) {
    const json: unknown = JSON.parse(raw);
    const parsed = lineSchema.safeParse(json);
    if (parsed.success) {
      lines.push(parsed.data);
    } else {
      const kind = z.object({ kind: z.string() }).safeParse(json);
      if (kind.success && known.has(kind.data.kind)) {
        console.warn(`[engine-replay] skipped a ${kind.data.kind} line: ${parsed.error.message}`);
      }
    }
  }

  const drafts = draftEvents(lines);
  const total = drafts.length;
  const events: BoardEvent[] = drafts.map((draft, index) => ({
    seq: index + 1,
    total,
    kind: draft.kind,
    ts: draft.ts,
    clock: formatClock(draft.elapsedSeconds),
    ticket: draft.ticket,
    text: draft.text,
    tone: draft.tone,
  }));
  const runId = drafts[0]?.state.runId ?? "unknown";
  console.log(`[engine-replay] ${options.journal}: ${raws.length} journal lines (${lines.length} used) → ${total} board events (run ${runId})`);

  const client = options.dryRun ? null : await connect();
  const delayMs = options.dryRun ? 0 : (options.seconds * 1000) / total;
  try {
    for (const [index, event] of events.entries()) {
      const draft = drafts[index]!;
      const parsed = runSnapshotSchema.safeParse(toSnapshot(event, draft, events.slice(0, index + 1)));
      if (!parsed.success) {
        console.error(`[engine-replay] snapshot ${event.seq} is invalid: ${parsed.error.message}`);
        process.exit(1);
      }
      console.log(`[engine-replay] ${event.seq}/${total} ${event.kind}: ${event.text}`);
      console.log(JSON.stringify(parsed.data));
      if (client) {
        const output = engineEventRpc.output.parse(
          await client.invokePluginRpc(options.pluginId, engineEventRpc.name, {
            runId: `${options.replayId} (journal ${runId})`,
            agentId: options.agentId,
            event,
            snapshot: parsed.data,
            done: index === total - 1,
          }),
        );
        if (!output.ok) {
          throw new Error(`plugin said: ${output.message}`);
        }
        if (index < total - 1) {
          await Bun.sleep(delayMs);
        }
      }
    }
  } catch (error) {
    console.error(`[engine-replay] failed: ${error instanceof Error ? error.message : String(error)}`);
    await client?.close();
    process.exit(1);
  }
  await client?.close();
  console.log(`[engine-replay] done: ${total} events ${options.dryRun ? "printed (dry run)" : `sent to agent ${options.agentId}`}`);
  process.exit(0);
}

await main();
