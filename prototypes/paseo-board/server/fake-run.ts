import {
  LOOP_CAP,
  STEP_NAMES,
  type Agent,
  type Family,
  type FinalReview,
  type JournalEntry,
  type Lens,
  type RunSnapshot,
  type Ticket,
  type Tone,
} from "../shared/board";

/**
 * The fake Luca run. `snapshotAt(tick)` is a pure function of the tick: it replays the
 * scripted steps of the current loop on a fresh copy of the starting state. Nothing here
 * calls a model or touches Paseo.
 *
 * Scene 1 (loop ticks 0-27): tickets mid-run. Every ticket state is on the board, and a
 * limit wait covers ticks 8-12.
 * Scene 2 (loop ticks 28-47): a fake `skip #5` reply, the last ticket finishes, and the
 * final review runs. Its lenses move through waiting, reviewing, fixing and clean until the
 * security lens gets stuck and the run waits for `retry`, `stop`, or `ship`.
 */

/** Tickets and lenses before `snapshotAt` derives their step, activity and tokens. */
type DraftTicket = Omit<Ticket, "step">;
type DraftLens = Pick<Lens, "name" | "state" | "findings" | "note">;
type DraftReview = Omit<FinalReview, "lenses"> & { lenses: DraftLens[] };

export const LOOP_LENGTH = 48;
/** One tick is 3 s of real time and 30 s of run time, so the run moves in time-lapse. */
const RUN_SECONDS_PER_TICK = 30;
const START_ELAPSED_SECONDS = 41 * 60;
const LIMIT_WAIT_STARTS_AT = 8;
const LIMIT_WAIT_ENDS_AT = 13;
const SCENE_TWO_AT = 28;
const SPEC = { number: 1, title: "Add CSV export to reports" };
const BRANCH = "luca/1-add-csv-export";
const WRITER_MODEL = "claude-sonnet";
const STRONG_MODEL = "claude-opus";
const REVIEWER_MODEL = "gpt-5.5";
const LENS_NAMES = ["architecture", "simplification", "security", "integration", "rules"] as const;

interface Draft {
  tickets: DraftTicket[];
  finalReview: DraftReview;
  limitWait: boolean;
  claude5h: number;
  claudeWeek: number;
  gpt5h: number;
  gptWeek: number;
  /** Loop tick at which each stuck item started waiting for a person. */
  stuckAt: Record<string, number>;
}

interface Step {
  at: number;
  ticket: number | null;
  tone: Tone;
  /** Null for a silent change that the board shows but the journal skips. */
  text: string | null;
  apply(draft: Draft): void;
}

function agent(role: Agent["role"], family: Family, model: string, state: Agent["state"], tokens: number, note: string): Agent {
  return { role, family, model, state, tokens, note };
}

function noFindings() {
  return { blocker: 0, shouldFix: 0, nit: 0 };
}

function startingDraft(): Draft {
  return {
    limitWait: false,
    // Chosen so green, yellow and red all show up during a loop.
    claude5h: 86,
    claudeWeek: 61,
    gpt5h: 44,
    gptWeek: 22,
    stuckAt: { "ticket-5": -28 },
    tickets: [
      {
        number: 2,
        title: "Pull report rows into one row builder",
        refactor: true,
        state: "done",
        dependsOn: [],
        activity: "done",
        fix: 0,
        review: 1,
        tests: { failing: 0, total: 112 },
        findings: { blocker: 0, shouldFix: 0, nit: 1 },
        agents: [
          agent("implementer", "claude", WRITER_MODEL, "done", 24100, "refactor, no red check"),
          agent("reviewer", "gpt", REVIEWER_MODEL, "done", 9800, "review round 1: clean"),
        ],
        stuck: null,
        note: "Refactor ticket: changes the shape, not the behavior, so no new test can fail first.",
      },
      {
        number: 3,
        title: "Turn report rows into CSV text",
        refactor: false,
        state: "done",
        dependsOn: [2],
        activity: "done",
        fix: 1,
        review: 1,
        tests: { failing: 0, total: 118 },
        findings: noFindings(),
        agents: [
          agent("test-writer", "claude", WRITER_MODEL, "done", 11200, "wrote 6 tests"),
          agent("implementer", "claude", WRITER_MODEL, "done", 33900, "passed after fix 1/3"),
          agent("reviewer", "gpt", REVIEWER_MODEL, "done", 12400, "review round 1: clean"),
        ],
        stuck: null,
        note: null,
      },
      {
        number: 4,
        title: "Export button on the reports page",
        refactor: false,
        state: "building",
        dependsOn: [3],
        activity: "writing",
        fix: 0,
        review: 0,
        tests: null,
        findings: null,
        agents: [agent("test-writer", "claude", WRITER_MODEL, "running", 4200, "writing failing tests")],
        stuck: null,
        note: null,
      },
      {
        number: 5,
        title: "Stream big exports in chunks",
        refactor: false,
        state: "stuck",
        dependsOn: [3],
        activity: "stuck",
        fix: 3,
        review: 0,
        tests: { failing: 1, total: 121 },
        findings: null,
        agents: [
          agent("test-writer", "claude", WRITER_MODEL, "done", 9600, "wrote 3 tests"),
          agent("implementer", "claude", WRITER_MODEL, "failed", 61800, "fix loop hit its cap (3/3)"),
          agent("implementer", "claude", STRONG_MODEL, "failed", 27300, "escalation: one more round"),
        ],
        stuck: {
          reason:
            "The 50,000-row export test times out. Gates failed 3 times, and the stronger model failed too.",
          tried: [
            "Gate run 1 failed (the big export timed out) → fix 1/3 raised the chunk size",
            "Gate run 2 failed (2 tests failing) after switching to an async row iterator → fix 2/3",
            "Gate run 3 failed (the timeout came back with buffered writes) → the fix loop hit its cap",
            "Escalation: claude-opus rewrote the stream with backpressure → still times out",
          ],
          replies: ["retry #5", "skip #5", "stop"],
          waitingSeconds: 0,
        },
        note: null,
      },
      {
        number: 6,
        title: "Escape commas, quotes and line breaks",
        refactor: false,
        state: "reviewing",
        dependsOn: [3],
        activity: "reading",
        fix: 1,
        review: 1,
        tests: { failing: 0, total: 124 },
        findings: null,
        agents: [
          agent("test-writer", "claude", WRITER_MODEL, "done", 8800, "wrote 4 tests"),
          agent("implementer", "claude", WRITER_MODEL, "done", 29400, "passed after fix 1/3"),
          agent("reviewer", "gpt", REVIEWER_MODEL, "running", 3100, "fresh reviewer, round 1"),
        ],
        stuck: null,
        note: null,
      },
      {
        number: 7,
        title: "Show export progress",
        refactor: false,
        state: "blocked",
        dependsOn: [5],
        activity: "blocked",
        fix: 0,
        review: 0,
        tests: null,
        findings: null,
        agents: [],
        stuck: null,
        note: "Waits on #5, which is stuck.",
      },
      {
        number: 8,
        title: "Excel-friendly UTF-8 option",
        refactor: false,
        state: "skipped",
        dependsOn: [3],
        activity: "skipped",
        fix: 3,
        review: 0,
        tests: { failing: 1, total: 119 },
        findings: null,
        agents: [
          agent("test-writer", "claude", WRITER_MODEL, "done", 7300, "wrote 2 tests"),
          agent("implementer", "claude", WRITER_MODEL, "failed", 40200, "fix loop hit its cap (3/3)"),
          agent("implementer", "claude", STRONG_MODEL, "failed", 19900, "escalation: one more round"),
        ],
        stuck: null,
        note: "Got stuck on a flaky byte-order-mark test and you replied `skip #8`. It stays open for a later run.",
      },
    ],
    finalReview: {
      state: "waiting",
      round: 0,
      fix: 0,
      lenses: LENS_NAMES.map((name) => ({ name, state: "waiting", findings: noFindings(), note: null })),
      agents: [],
      stuck: null,
    },
  };
}

function ticket(draft: Draft, number: number): DraftTicket {
  const found = draft.tickets.find((candidate) => candidate.number === number);
  if (!found) {
    throw new Error(`Fake run has no ticket #${number}`);
  }
  return found;
}

function lastAgent(owner: { agents: Agent[] }): Agent {
  const found = owner.agents[owner.agents.length - 1];
  if (!found) {
    throw new Error("Fake run expected an agent");
  }
  return found;
}

function lens(draft: Draft, name: (typeof LENS_NAMES)[number]): DraftLens {
  const found = draft.finalReview.lenses.find((candidate) => candidate.name === name);
  if (!found) {
    throw new Error(`Fake run has no ${name} lens`);
  }
  return found;
}

function lensAgent(draft: Draft, name: string): Agent {
  const found = draft.finalReview.agents.find((candidate) => candidate.note === `${name} lens`);
  if (!found) {
    throw new Error(`Fake run has no agent for the ${name} lens`);
  }
  return found;
}

function allAgents(draft: Draft): Agent[] {
  return [...draft.tickets.flatMap((item) => item.agents), ...draft.finalReview.agents];
}

const STEPS: Step[] = [
  {
    at: 2,
    ticket: 4,
    tone: "info",
    text: "Ticket #4: the test-writer wrote 3 new tests",
    apply(draft) {
      const item = ticket(draft, 4);
      lastAgent(item).state = "done";
      lastAgent(item).note = "wrote 3 tests";
      item.activity = "red-check";
    },
  },
  {
    at: 3,
    ticket: 4,
    tone: "success",
    text: "Ticket #4: red check passed. 3 new tests fail, 118 old tests pass",
    apply(draft) {
      const item = ticket(draft, 4);
      item.tests = { failing: 3, total: 121 };
      item.activity = "editing";
      item.agents.push(agent("implementer", "claude", WRITER_MODEL, "running", 0, "first pass"));
    },
  },
  {
    at: 4,
    ticket: 6,
    tone: "warning",
    text: "Ticket #6: ticket review round 1 found 1 blocker. Cells that start with = run as formulas in Excel",
    apply(draft) {
      const item = ticket(draft, 6);
      lastAgent(item).state = "done";
      lastAgent(item).note = "review round 1: 1 blocker";
      item.findings = { blocker: 1, shouldFix: 0, nit: 0 };
      item.activity = "fixing";
      item.agents.push(agent("implementer", "claude", WRITER_MODEL, "running", 0, "fixing the review blocker"));
    },
  },
  {
    at: 6,
    ticket: 4,
    tone: "info",
    text: null,
    apply(draft) {
      const item = ticket(draft, 4);
      item.activity = "gates";
      lastAgent(item).state = "idle";
    },
  },
  {
    at: 7,
    ticket: 4,
    tone: "warning",
    text: "Ticket #4: gates failed, 2 of 121 tests failing → fix 1/3",
    apply(draft) {
      const item = ticket(draft, 4);
      item.fix = 1;
      item.tests = { failing: 2, total: 121 };
      item.activity = "fixing";
      lastAgent(item).state = "running";
      lastAgent(item).note = "fix 1/3";
    },
  },
  {
    at: LIMIT_WAIT_STARTS_AT,
    ticket: null,
    tone: "warning",
    text: "Limit wait: the Claude plan's 5-hour window is used up. The run pauses and carries on by itself when it resets",
    apply(draft) {
      draft.limitWait = true;
      draft.claude5h = 100;
      for (const item of draft.tickets) {
        const running = item.agents.filter((candidate) => candidate.state === "running");
        for (const paused of running) {
          paused.state = "paused";
        }
        if (running.length > 0) {
          item.activity = "paused";
        }
      }
    },
  },
  {
    at: LIMIT_WAIT_ENDS_AT,
    ticket: null,
    tone: "success",
    text: "Limit wait over: the Claude plan reset, and the run carried on by itself",
    apply(draft) {
      draft.limitWait = false;
      draft.claude5h = 0;
      for (const resumed of allAgents(draft).filter((candidate) => candidate.state === "paused")) {
        resumed.state = "running";
      }
      ticket(draft, 4).activity = "fixing";
      ticket(draft, 6).activity = "fixing";
    },
  },
  {
    at: 15,
    ticket: 4,
    tone: "info",
    text: null,
    apply(draft) {
      const item = ticket(draft, 4);
      item.activity = "gates";
      lastAgent(item).state = "idle";
    },
  },
  {
    at: 16,
    ticket: 4,
    tone: "warning",
    text: "Ticket #4: gates failed again, 1 test failing (the header row isn't quoted) → fix 2/3",
    apply(draft) {
      const item = ticket(draft, 4);
      item.fix = 2;
      item.tests = { failing: 1, total: 121 };
      item.activity = "fixing";
      lastAgent(item).state = "running";
      lastAgent(item).note = "fix 2/3";
    },
  },
  {
    at: 18,
    ticket: 6,
    tone: "info",
    text: null,
    apply(draft) {
      const item = ticket(draft, 6);
      item.activity = "gates";
      lastAgent(item).state = "idle";
    },
  },
  {
    at: 19,
    ticket: 6,
    tone: "info",
    text: "Ticket #6: blocker fixed and gates passed → ticket review round 2",
    apply(draft) {
      const item = ticket(draft, 6);
      lastAgent(item).state = "done";
      item.review = 2;
      item.findings = null;
      item.activity = "reading";
      item.agents.push(agent("reviewer", "gpt", REVIEWER_MODEL, "running", 0, "fresh reviewer, round 2"));
    },
  },
  {
    at: 20,
    ticket: 4,
    tone: "info",
    text: null,
    apply(draft) {
      ticket(draft, 4).activity = "editing";
    },
  },
  {
    at: 22,
    ticket: 4,
    tone: "info",
    text: null,
    apply(draft) {
      const item = ticket(draft, 4);
      item.activity = "gates";
      lastAgent(item).state = "idle";
    },
  },
  {
    at: 23,
    ticket: 4,
    tone: "success",
    text: "Ticket #4: gates passed (121 tests, types clean) → ticket review round 1",
    apply(draft) {
      const item = ticket(draft, 4);
      lastAgent(item).state = "done";
      lastAgent(item).note = "passed after fix 2/3";
      item.state = "reviewing";
      item.review = 1;
      item.tests = { failing: 0, total: 121 };
      item.activity = "reading";
      item.agents.push(agent("reviewer", "gpt", REVIEWER_MODEL, "running", 0, "fresh reviewer, round 1"));
    },
  },
  {
    at: 25,
    ticket: 6,
    tone: "success",
    text: "Ticket #6: ticket review round 2 is clean → done",
    apply(draft) {
      const item = ticket(draft, 6);
      lastAgent(item).state = "done";
      lastAgent(item).note = "review round 2: clean";
      item.state = "done";
      item.activity = "done";
      item.findings = noFindings();
    },
  },
  {
    at: SCENE_TWO_AT,
    ticket: 5,
    tone: "info",
    text: "You replied `skip #5` on spec #1 (a fake reply, so the prototype can show the final review)",
    apply(draft) {
      const item = ticket(draft, 5);
      item.state = "skipped";
      item.activity = "skipped";
      item.stuck = null;
      item.note = "Skipped by your reply. It stays open for a later run.";
      delete draft.stuckAt["ticket-5"];
    },
  },
  {
    at: SCENE_TWO_AT,
    ticket: 7,
    tone: "info",
    text: "Ticket #7 is left out too, because it waits on #5. Both stay open for a later run",
    apply(draft) {
      const item = ticket(draft, 7);
      item.state = "skipped";
      item.activity = "skipped";
      item.note = "Left out with #5, which it waits on. Stays open for a later run.";
    },
  },
  {
    at: 29,
    ticket: 4,
    tone: "success",
    text: "Ticket #4: ticket review round 1 is clean (1 nit) → done",
    apply(draft) {
      const item = ticket(draft, 4);
      lastAgent(item).state = "done";
      lastAgent(item).note = "review round 1: clean, 1 nit";
      item.state = "done";
      item.activity = "done";
      item.findings = { blocker: 0, shouldFix: 0, nit: 1 };
    },
  },
  {
    at: 30,
    ticket: null,
    tone: "info",
    text: "Every ticket is done or skipped → final review round 1 through 5 lenses",
    apply(draft) {
      const review = draft.finalReview;
      review.state = "reviewing";
      review.round = 1;
      for (const item of review.lenses) {
        item.state = "reviewing";
      }
      review.agents = LENS_NAMES.map((name) => agent("reviewer", "gpt", REVIEWER_MODEL, "running", 0, `${name} lens`));
    },
  },
  {
    at: 31,
    ticket: null,
    tone: "success",
    text: "Final review: the architecture and integration lenses are clean",
    apply(draft) {
      for (const name of ["architecture", "integration"] as const) {
        lens(draft, name).state = "clean";
        lensAgent(draft, name).state = "done";
      }
    },
  },
  {
    at: 32,
    ticket: null,
    tone: "info",
    text: "Final review: simplification found 2 nits, rules found 1 should-fix",
    apply(draft) {
      const simplification = lens(draft, "simplification");
      simplification.findings = { blocker: 0, shouldFix: 0, nit: 2 };
      simplification.note = "Two CSV helpers could be one.";
      const rules = lens(draft, "rules");
      rules.findings = { blocker: 0, shouldFix: 1, nit: 0 };
      rules.note = "The export helper isn't listed in the reports module's index.";
      lensAgent(draft, "simplification").state = "done";
      lensAgent(draft, "rules").state = "done";
    },
  },
  {
    at: 33,
    ticket: null,
    tone: "warning",
    text: "Final review: the security lens found 1 blocker. The export route skips the report's access check",
    apply(draft) {
      const security = lens(draft, "security");
      security.findings = { blocker: 1, shouldFix: 0, nit: 0 };
      security.note = "The export route skips the report's access check.";
      lensAgent(draft, "security").state = "done";
    },
  },
  {
    at: 34,
    ticket: null,
    tone: "info",
    text: "Final review round 1: 1 blocker, 1 should-fix and 2 nits → fix 1/3",
    apply(draft) {
      const review = draft.finalReview;
      review.state = "fixing";
      review.fix = 1;
      for (const name of ["simplification", "rules", "security"] as const) {
        lens(draft, name).state = "fixing";
      }
      review.agents.push(agent("implementer", "claude", WRITER_MODEL, "running", 0, "final review fix 1/3"));
    },
  },
  {
    at: 35,
    ticket: null,
    tone: "info",
    text: "Fix 1/3 is in → final review round 2 re-checks simplification, rules and security",
    apply(draft) {
      const review = draft.finalReview;
      lastAgent(review).state = "done";
      review.state = "reviewing";
      review.round = 2;
      for (const name of ["simplification", "rules", "security"] as const) {
        lens(draft, name).state = "reviewing";
        lensAgent(draft, name).state = "running";
      }
    },
  },
  {
    at: 36,
    ticket: null,
    tone: "warning",
    text: "Final review round 2: simplification and rules are clean, security still has 1 blocker → fix 2/3",
    apply(draft) {
      const review = draft.finalReview;
      for (const name of ["simplification", "rules"] as const) {
        const item = lens(draft, name);
        item.state = "clean";
        item.findings = noFindings();
        item.note = "Fixed in fix 1/3.";
        lensAgent(draft, name).state = "done";
      }
      lens(draft, "security").state = "fixing";
      lensAgent(draft, "security").state = "done";
      review.state = "fixing";
      review.fix = 2;
      review.agents.push(agent("implementer", "claude", WRITER_MODEL, "running", 0, "final review fix 2/3"));
    },
  },
  {
    at: 37,
    ticket: null,
    tone: "info",
    text: "Fix 2/3 is in → final review round 3 re-checks security",
    apply(draft) {
      const review = draft.finalReview;
      lastAgent(review).state = "done";
      review.state = "reviewing";
      review.round = LOOP_CAP;
      lens(draft, "security").state = "reviewing";
      lensAgent(draft, "security").state = "running";
    },
  },
  {
    at: 38,
    ticket: null,
    tone: "warning",
    text: "Final review round 3: security still has 1 blocker. The fix loop hit its cap → escalation to a stronger model",
    apply(draft) {
      const review = draft.finalReview;
      review.fix = LOOP_CAP;
      review.state = "escalated";
      lens(draft, "security").state = "fixing";
      lensAgent(draft, "security").state = "done";
      review.agents.push(agent("implementer", "claude", STRONG_MODEL, "running", 0, "escalation: one more round"));
    },
  },
  {
    at: 40,
    ticket: null,
    tone: "info",
    text: "The stronger model's fix is in → security re-checks it",
    apply(draft) {
      const review = draft.finalReview;
      lastAgent(review).state = "done";
      lens(draft, "security").state = "reviewing";
      lensAgent(draft, "security").state = "running";
    },
  },
  {
    at: 41,
    ticket: null,
    tone: "danger",
    text: "The stronger model couldn't clear it either. The final review is stuck and waits for you",
    apply(draft) {
      const review = draft.finalReview;
      review.state = "stuck";
      lastAgent(review).state = "failed";
      lens(draft, "security").state = "fixing";
      lensAgent(draft, "security").state = "done";
      review.stuck = {
        reason:
          "The security lens keeps finding 1 blocker: the export route skips the report's access check. 3 review rounds and the stronger model couldn't clear it.",
        tried: [
          "Round 1 found the missing check → fix 1/3 added a check in the route",
          "Round 2: the check tests the wrong role → fix 2/3 moved it into the report loader",
          "Round 3: the bulk export skips the loader → the fix loop hit its cap",
          "Escalation: claude-opus checked access in both places → the bulk export path is still open",
        ],
        replies: ["retry", "stop", "ship"],
        waitingSeconds: 0,
      };
      draft.stuckAt["final-review"] = 41;
    },
  },
];

function tokenRate(item: Agent): number {
  if (item.model === STRONG_MODEL) {
    return 4800;
  }
  if (item.role === "test-writer") {
    return 2600;
  }
  if (item.role === "implementer") {
    return 3400;
  }
  return 1900;
}

/** Tokens and plan usage grow for every agent that ran during the tick that just passed. */
function accrue(draft: Draft) {
  for (const item of allAgents(draft).filter((candidate) => candidate.state === "running")) {
    item.tokens += tokenRate(item);
    if (item.family === "claude") {
      draft.claude5h += 1.4;
      draft.claudeWeek += 0.12;
    } else {
      draft.gpt5h += 1.1;
      draft.gptWeek += 0.09;
    }
  }
  draft.claude5h = Math.min(draft.limitWait ? 100 : 99, draft.claude5h);
  draft.gpt5h = Math.min(99, draft.gpt5h);
}

export function formatClock(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const two = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${two(minutes)}:${two(rest)}` : `${minutes}:${two(rest)}`;
}

function elapsedAt(loopTick: number): number {
  return START_ELAPSED_SECONDS + loopTick * RUN_SECONDS_PER_TICK;
}

const STEP_OF_ACTIVITY: Record<string, number> = {
  writing: 0,
  "red-check": 1,
  editing: 2,
  fixing: 2,
  gates: 3,
  reading: 4,
};
const STEP_OF_ROLE: Record<Agent["role"], number> = { "test-writer": 0, implementer: 2, reviewer: 4 };
const CHECKS_STEP = 3;

/** Where the ticket is among STEP_NAMES (see the `step` field in shared/board.ts). */
function stepOf(item: DraftTicket): number {
  if (item.state === "done") {
    return STEP_NAMES.length;
  }
  if (item.state === "blocked") {
    return -1;
  }
  if (item.state === "stuck" || item.state === "skipped") {
    // In this fake run, every stuck or skipped ticket that started stopped at the checks.
    return item.agents.length === 0 ? -1 : CHECKS_STEP;
  }
  const byActivity = STEP_OF_ACTIVITY[item.activity];
  if (byActivity !== undefined) {
    return byActivity;
  }
  const paused = item.agents.find((candidate) => candidate.state === "paused");
  return paused ? STEP_OF_ROLE[paused.role] : -1;
}

function finishLens(review: DraftReview, item: DraftLens): Lens {
  const reviewer = review.agents.find((candidate) => candidate.note === `${item.name} lens`);
  const activity = {
    waiting: "waiting",
    reviewing: reviewer && reviewer.state === "running" ? "reading" : "reported",
    fixing: review.state === "stuck" ? "stuck" : review.state === "escalated" ? "escalated" : "fixing",
    clean: "clean",
  }[item.state];
  return {
    ...item,
    activity,
    model: REVIEWER_MODEL,
    family: "gpt",
    tokens: reviewer ? reviewer.tokens : 0,
  };
}

export function snapshotAt(tick: number): RunSnapshot {
  const loopTick = tick % LOOP_LENGTH;
  const draft = startingDraft();
  const journal: JournalEntry[] = [];
  for (let current = 0; current <= loopTick; current += 1) {
    if (current > 0) {
      accrue(draft);
    }
    for (const step of STEPS.filter((candidate) => candidate.at === current)) {
      step.apply(draft);
      if (step.text !== null) {
        journal.push({
          loopTick: current,
          clock: formatClock(elapsedAt(current)),
          ticket: step.ticket,
          text: step.text,
          tone: step.tone,
        });
      }
    }
  }

  const waiting = (key: string) => {
    const since = draft.stuckAt[key];
    return since === undefined ? 0 : (loopTick - since) * RUN_SECONDS_PER_TICK;
  };
  for (const item of draft.tickets) {
    if (item.stuck) {
      item.stuck.waitingSeconds = waiting(`ticket-${item.number}`);
    }
  }
  if (draft.finalReview.stuck) {
    draft.finalReview.stuck.waitingSeconds = waiting("final-review");
  }

  return {
    tick,
    loop: Math.floor(tick / LOOP_LENGTH) + 1,
    loopTick,
    loopLength: LOOP_LENGTH,
    scene: loopTick < SCENE_TWO_AT ? "1/2: tickets mid-run" : "2/2: final review",
    spec: SPEC,
    branch: BRANCH,
    elapsedSeconds: elapsedAt(loopTick),
    agentsRunning: allAgents(draft).filter((candidate) => candidate.state === "running").length,
    limitWait: draft.limitWait
      ? {
          plan: "Claude plan",
          window: "5-hour window",
          resetsInSeconds: (LIMIT_WAIT_ENDS_AT - loopTick) * RUN_SECONDS_PER_TICK,
        }
      : null,
    usage: [
      { plan: "Claude plan", family: "claude", fiveHour: Math.round(draft.claude5h), weekly: Math.round(draft.claudeWeek) },
      { plan: "ChatGPT plan", family: "gpt", fiveHour: Math.round(draft.gpt5h), weekly: Math.round(draft.gptWeek) },
    ],
    tickets: draft.tickets.map((item) => ({ ...item, step: stepOf(item) })),
    finalReview: {
      ...draft.finalReview,
      lenses: draft.finalReview.lenses.map((item) => finishLens(draft.finalReview, item)),
    },
    journal,
    source: "fake run",
  };
}
