import { describe, test, expect } from "bun:test";
import {
  assembleContext,
  getRequiredDocumentKeys,
} from "../../../src/context/__helpers/context-assembler";
import type { ContextDocumentSet, ContextConfig } from "../../../src/context";
import { TIER_DOCUMENTS } from "../../../src/context/__helpers/defaults";

// ---------------------------------------------------------------------------
// Shared test documents
// ---------------------------------------------------------------------------

const ALL_DOCUMENTS: ContextDocumentSet = {
  plan_content: "the plan",
  brain_summary: "brain summary",
  state_content: "state data",
  memory_entries: "recalled memories",
  working_content: "working session",
  brain_full: "full brain content",
  memory_full: "full memory content",
  agent_summaries: "agent summaries text",
  git_diff: "diff output",
  plan_summaries: "plan summaries text",
};

// ---------------------------------------------------------------------------
// assembleContext — profile resolution
// ---------------------------------------------------------------------------

describe("assembleContext — profile resolution", () => {
  test("uses per-agent profile when no override is given", () => {
    const ctx = assembleContext("lu-executor", "TRIVIAL", ALL_DOCUMENTS);
    // lu-executor: default T2, promotable T3, none isolation
    // TRIVIAL: no promotion, so effective tier = T2
    expect(ctx.effective_tier).toBe("T2");
    expect(ctx.isolation_mode).toBe("none");
    expect(ctx.agent_name).toBe("lu-executor");
  });

  test("falls back to FALLBACK_CONTEXT_PROFILE for unknown agents", () => {
    const ctx = assembleContext("unknown-agent", "TRIVIAL", ALL_DOCUMENTS);
    // Fallback: T0/T0/none
    expect(ctx.effective_tier).toBe("T0");
    expect(ctx.isolation_mode).toBe("none");
  });

  test("overrideProfile takes precedence over per-agent default", () => {
    const override: ContextConfig = {
      default_tier: "T3",
      promotable_to: "T3",
      isolation: "cold",
    };
    const ctx = assembleContext(
      "lu-executor",
      "TRIVIAL",
      ALL_DOCUMENTS,
      override,
    );
    // Override says T3/T3/cold — cold isolation applies
    expect(ctx.effective_tier).toBe("T3");
    expect(ctx.isolation_mode).toBe("cold");
  });

  test("overrideProfile takes precedence over fallback for unknown agents", () => {
    const override: ContextConfig = {
      default_tier: "T1",
      promotable_to: "T2",
      isolation: "warm",
    };
    const ctx = assembleContext(
      "nonexistent-agent",
      "TRIVIAL",
      ALL_DOCUMENTS,
      override,
    );
    expect(ctx.effective_tier).toBe("T1");
    expect(ctx.isolation_mode).toBe("warm");
  });
});

// ---------------------------------------------------------------------------
// assembleContext — isolation modes
// ---------------------------------------------------------------------------

describe("assembleContext — isolation modes", () => {
  test("cold isolation includes only git_diff and brain_summary", () => {
    const ctx = assembleContext("dx-advocate", "TRIVIAL", ALL_DOCUMENTS);
    // dx-advocate: cold isolation
    expect(ctx.documents.git_diff).toBe("diff output");
    expect(ctx.documents.brain_summary).toBe("brain summary");
    // Should not include plan_content, state_content, etc.
    expect(ctx.documents.plan_content).toBeUndefined();
    expect(ctx.documents.state_content).toBeUndefined();
    expect(ctx.documents.memory_entries).toBeUndefined();
    expect(ctx.documents.working_content).toBeUndefined();
  });

  test("warm isolation includes plan_content, plan_summaries, brain_summary", () => {
    const ctx = assembleContext("lu-verifier", "TRIVIAL", ALL_DOCUMENTS);
    // lu-verifier: warm isolation
    expect(ctx.documents.plan_content).toBe("the plan");
    expect(ctx.documents.plan_summaries).toBe("plan summaries text");
    expect(ctx.documents.brain_summary).toBe("brain summary");
    // Should not include working_content, memory_full, brain_full
    expect(ctx.documents.working_content).toBeUndefined();
    expect(ctx.documents.memory_full).toBeUndefined();
    expect(ctx.documents.brain_full).toBeUndefined();
  });

  test("none isolation uses tier-based document selection", () => {
    const ctx = assembleContext("lu-router", "TRIVIAL", ALL_DOCUMENTS);
    // lu-router: T0/T1/none, TRIVIAL -> no promotion -> T0
    // T0 includes only plan_content
    expect(ctx.documents.plan_content).toBe("the plan");
    expect(ctx.documents.brain_summary).toBeUndefined();
    expect(ctx.documents.state_content).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// assembleContext — document filtering
// ---------------------------------------------------------------------------

describe("assembleContext — document filtering", () => {
  test("T0 agent gets only plan_content", () => {
    const ctx = assembleContext("unknown-agent", "TRIVIAL", ALL_DOCUMENTS);
    // Fallback: T0/T0/none
    const docKeys = Object.keys(ctx.documents).filter(
      (k) => ctx.documents[k as keyof ContextDocumentSet] !== undefined,
    );
    expect(docKeys).toEqual(["plan_content"]);
  });

  test("T1 agent gets plan_content and brain_summary", () => {
    const ctx = assembleContext("lu-planner", "TRIVIAL", ALL_DOCUMENTS);
    // lu-planner: T1/T2/none, TRIVIAL -> no promotion -> T1
    expect(ctx.documents.plan_content).toBe("the plan");
    expect(ctx.documents.brain_summary).toBe("brain summary");
    expect(ctx.documents.state_content).toBeUndefined();
  });

  test("T2 agent gets plan, brain_summary, state, memory_entries, working", () => {
    const ctx = assembleContext("lu-executor", "TRIVIAL", ALL_DOCUMENTS);
    // lu-executor: T2/T3/none, TRIVIAL -> no promotion -> T2
    expect(ctx.documents.plan_content).toBe("the plan");
    expect(ctx.documents.brain_summary).toBe("brain summary");
    expect(ctx.documents.state_content).toBe("state data");
    expect(ctx.documents.memory_entries).toBe("recalled memories");
    expect(ctx.documents.working_content).toBe("working session");
    // T2 does not get full docs or agent_summaries
    expect(ctx.documents.brain_full).toBeUndefined();
    expect(ctx.documents.agent_summaries).toBeUndefined();
  });

  test("T3 agent gets full docs instead of summaries", () => {
    const ctx = assembleContext("lu-cognition", "TRIVIAL", ALL_DOCUMENTS);
    // lu-cognition: T3/T3/none, TRIVIAL -> no promotion -> T3
    expect(ctx.documents.brain_full).toBe("full brain content");
    expect(ctx.documents.memory_full).toBe("full memory content");
    expect(ctx.documents.agent_summaries).toBe("agent summaries text");
    // T3 should not include brain_summary or memory_entries (replaced by full versions)
    expect(ctx.documents.brain_summary).toBeUndefined();
    expect(ctx.documents.memory_entries).toBeUndefined();
  });

  test("missing documents are omitted (not undefined entries)", () => {
    const sparse: ContextDocumentSet = { plan_content: "plan only" };
    const ctx = assembleContext("lu-executor", "TRIVIAL", sparse);
    // lu-executor at T2 wants brain_summary, state, etc., but they are missing
    expect(ctx.documents.plan_content).toBe("plan only");
    expect(ctx.documents.brain_summary).toBeUndefined();
  });

  test("complexity-driven promotion changes document set", () => {
    // lu-executor: T2 default, T3 ceiling, COMPLEX -> promotes T2->T3
    const ctx = assembleContext("lu-executor", "COMPLEX", ALL_DOCUMENTS);
    expect(ctx.effective_tier).toBe("T3");
    // T3 documents
    expect(ctx.documents.brain_full).toBe("full brain content");
    expect(ctx.documents.memory_full).toBe("full memory content");
    expect(ctx.documents.agent_summaries).toBe("agent summaries text");
  });
});

// ---------------------------------------------------------------------------
// assembleContext — metadata
// ---------------------------------------------------------------------------

describe("assembleContext — metadata", () => {
  test("returns correct agent_name", () => {
    const ctx = assembleContext("lu-debugger", "TRIVIAL", {});
    expect(ctx.agent_name).toBe("lu-debugger");
  });

  test("returns resolved effective_tier", () => {
    const ctx = assembleContext("lu-executor", "COMPLEX", ALL_DOCUMENTS);
    expect(ctx.effective_tier).toBe("T3");
  });

  test("returns isolation_mode from profile", () => {
    const ctx = assembleContext("dx-advocate", "TRIVIAL", {});
    expect(ctx.isolation_mode).toBe("cold");
  });
});

// ---------------------------------------------------------------------------
// getRequiredDocumentKeys
// ---------------------------------------------------------------------------

describe("getRequiredDocumentKeys", () => {
  test("returns tier-based keys for agents with none isolation", () => {
    // lu-router: T0/T1/none at TRIVIAL -> T0 -> ["plan_content"]
    const keys = getRequiredDocumentKeys("lu-router", "TRIVIAL");
    expect(keys).toEqual([...TIER_DOCUMENTS.T0]);
  });

  test("returns cold isolation include list for cold agents", () => {
    const keys = getRequiredDocumentKeys("dx-advocate", "CRITICAL");
    expect(keys).toEqual(["git_diff", "brain_summary"]);
  });

  test("returns warm isolation include list for warm agents", () => {
    const keys = getRequiredDocumentKeys("lu-verifier", "MODERATE");
    expect(keys).toEqual(["plan_content", "plan_summaries", "brain_summary"]);
  });

  test("promotion changes the key list for none-isolation agents", () => {
    // lu-executor: T2 default, T3 ceiling, COMPLEX -> T3
    const keys = getRequiredDocumentKeys("lu-executor", "COMPLEX");
    expect(keys).toEqual([...TIER_DOCUMENTS.T3]);
  });

  test("unknown agent uses fallback profile (T0/T0/none)", () => {
    const keys = getRequiredDocumentKeys("mystery-agent", "TRIVIAL");
    expect(keys).toEqual([...TIER_DOCUMENTS.T0]);
  });

  test("overrideProfile is respected", () => {
    const override: ContextConfig = {
      default_tier: "T1",
      promotable_to: "T1",
      isolation: "none",
    };
    const keys = getRequiredDocumentKeys("lu-executor", "TRIVIAL", override);
    expect(keys).toEqual([...TIER_DOCUMENTS.T1]);
  });
});
