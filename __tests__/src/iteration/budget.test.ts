import { describe, test, expect } from "bun:test";
import {
  createBudgetState,
  assessBudget,
  advanceBudget,
  shouldStartIteration,
  assessBudgetWithTokens,
} from "../../../src/iteration/__helpers/budget";

describe("createBudgetState", () => {
  test("creates state with correct defaults (soft_stop_percent=80)", () => {
    const state = createBudgetState(3);
    expect(state.max_iterations).toBe(3);
    expect(state.soft_stop_percent).toBe(80);
    expect(state.current_iteration).toBe(0);
    expect(state.status).toBe("under_budget");
  });

  test("creates state with custom soft_stop_percent", () => {
    const state = createBudgetState(5, 60);
    expect(state.soft_stop_percent).toBe(60);
  });

  test("initial current_iteration is 0", () => {
    const state = createBudgetState(10);
    expect(state.current_iteration).toBe(0);
  });

  test("initial status is under_budget", () => {
    const state = createBudgetState(1);
    expect(state.status).toBe("under_budget");
  });
});

describe("assessBudget", () => {
  test("returns under_budget when iteration 0 of 3", () => {
    const state = createBudgetState(3);
    expect(assessBudget(state)).toBe("under_budget");
  });

  test("returns under_budget when iteration 1 of 3 (33%)", () => {
    const state = { ...createBudgetState(3), current_iteration: 1 };
    expect(assessBudget(state)).toBe("under_budget");
  });

  test("returns under_budget when iteration 2 of 5 (40%)", () => {
    const state = { ...createBudgetState(5), current_iteration: 2 };
    expect(assessBudget(state)).toBe("under_budget");
  });

  test("returns soft_stop when iteration 4 of 5 (80%)", () => {
    const state = { ...createBudgetState(5), current_iteration: 4 };
    expect(assessBudget(state)).toBe("soft_stop");
  });

  test("returns soft_stop when iteration 8 of 10 (80%)", () => {
    const state = { ...createBudgetState(10), current_iteration: 8 };
    expect(assessBudget(state)).toBe("soft_stop");
  });

  test("returns exceeded when iteration equals max_iterations", () => {
    const state = { ...createBudgetState(3), current_iteration: 3 };
    expect(assessBudget(state)).toBe("exceeded");
  });

  test("returns exceeded when iteration exceeds max_iterations", () => {
    const state = { ...createBudgetState(3), current_iteration: 5 };
    expect(assessBudget(state)).toBe("exceeded");
  });

  test("custom soft_stop_percent (60%) triggers at correct threshold", () => {
    const state = { ...createBudgetState(5, 60), current_iteration: 3 };
    // 3/5 = 60%, equals threshold
    expect(assessBudget(state)).toBe("soft_stop");
  });
});

describe("advanceBudget", () => {
  test("increments current_iteration by 1", () => {
    const initial = createBudgetState(3);
    const advanced = advanceBudget(initial);
    expect(advanced.current_iteration).toBe(1);
  });

  test("returns new object (immutability check)", () => {
    const initial = createBudgetState(3);
    const advanced = advanceBudget(initial);
    expect(advanced).not.toBe(initial);
    expect(initial.current_iteration).toBe(0); // original unchanged
  });

  test("updates status after increment", () => {
    const state = { ...createBudgetState(3), current_iteration: 2 };
    const advanced = advanceBudget(state);
    expect(advanced.current_iteration).toBe(3);
    expect(advanced.status).toBe("exceeded");
  });

  test("successive advances eventually reach exceeded", () => {
    let state = createBudgetState(3);
    state = advanceBudget(state); // 1
    expect(state.status).toBe("under_budget");
    state = advanceBudget(state); // 2
    expect(state.status).toBe("under_budget");
    state = advanceBudget(state); // 3
    expect(state.status).toBe("exceeded");
  });
});

describe("shouldStartIteration", () => {
  test("returns allowed=true when under_budget", () => {
    const state = createBudgetState(3);
    const decision = shouldStartIteration(state);
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toContain("Budget OK");
  });

  test("returns allowed=false with reason when soft_stop", () => {
    const state = {
      ...createBudgetState(5),
      current_iteration: 4,
      status: "soft_stop" as const,
    };
    const decision = shouldStartIteration(state);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("Soft stop");
  });

  test("returns allowed=false with reason when exceeded", () => {
    const state = {
      ...createBudgetState(3),
      current_iteration: 3,
      status: "exceeded" as const,
    };
    const decision = shouldStartIteration(state);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("Budget exceeded");
  });

  test("returns allowed=false when max_iterations is 0", () => {
    const state = createBudgetState(1);
    // Override max_iterations to 0 (loop disabled)
    const disabled = { ...state, max_iterations: 0 };
    const decision = shouldStartIteration(disabled);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("Loop disabled");
  });

  test("reason string includes iteration counts and percentages", () => {
    const state = createBudgetState(5);
    const decision = shouldStartIteration(state);
    expect(decision.reason).toContain("1 of 5");
    expect(decision.reason).toContain("0%");
  });
});

describe("assessBudgetWithTokens", () => {
  test("falls back to iteration-only when no token fields", () => {
    const state = createBudgetState(3);
    const assessment = assessBudgetWithTokens(state);

    expect(assessment.status).toBe("under_budget");
    expect(assessment.iterationStatus).toBe("under_budget");
    expect(assessment.tokenStatus).toBeNull();
    expect(assessment.iterationPercent).toBe(0);
    expect(assessment.tokenPercent).toBeNull();
    expect(assessment.summary).toContain("0/3");
  });

  test("returns under_budget when both iteration and tokens are low", () => {
    const state = {
      ...createBudgetState(5),
      max_tokens: 100000,
      tokens_used: 20000,
    };
    const assessment = assessBudgetWithTokens(state);

    expect(assessment.status).toBe("under_budget");
    expect(assessment.iterationStatus).toBe("under_budget");
    expect(assessment.tokenStatus).toBe("under_budget");
    expect(assessment.tokenPercent).toBe(20);
  });

  test("returns soft_stop when tokens exceed soft_stop_percent", () => {
    const state = {
      ...createBudgetState(5),
      max_tokens: 100000,
      tokens_used: 85000,
    };
    const assessment = assessBudgetWithTokens(state);

    expect(assessment.status).toBe("soft_stop");
    expect(assessment.iterationStatus).toBe("under_budget");
    expect(assessment.tokenStatus).toBe("soft_stop");
    expect(assessment.tokenPercent).toBe(85);
  });

  test("returns exceeded when tokens exceed max_tokens", () => {
    const state = {
      ...createBudgetState(5),
      max_tokens: 100000,
      tokens_used: 100000,
    };
    const assessment = assessBudgetWithTokens(state);

    expect(assessment.status).toBe("exceeded");
    expect(assessment.tokenStatus).toBe("exceeded");
  });

  test("more restrictive status wins (token soft_stop beats iteration under_budget)", () => {
    const state = {
      ...createBudgetState(10),
      current_iteration: 2,
      max_tokens: 100000,
      tokens_used: 90000,
    };
    const assessment = assessBudgetWithTokens(state);

    expect(assessment.iterationStatus).toBe("under_budget");
    expect(assessment.tokenStatus).toBe("soft_stop");
    expect(assessment.status).toBe("soft_stop"); // token wins
  });

  test("more restrictive status wins (iteration exceeded beats token under_budget)", () => {
    const state = {
      ...createBudgetState(3),
      current_iteration: 3,
      status: "exceeded" as const,
      max_tokens: 100000,
      tokens_used: 10000,
    };
    const assessment = assessBudgetWithTokens(state);

    expect(assessment.iterationStatus).toBe("exceeded");
    expect(assessment.tokenStatus).toBe("under_budget");
    expect(assessment.status).toBe("exceeded"); // iteration wins
  });

  test("summary includes both iteration and token information", () => {
    const state = {
      ...createBudgetState(5),
      max_tokens: 100000,
      tokens_used: 50000,
    };
    const assessment = assessBudgetWithTokens(state);

    expect(assessment.summary).toContain("Iteration");
    expect(assessment.summary).toContain("Tokens");
    expect(assessment.summary).toContain("50000/100000");
  });

  test("custom soft_stop_percent applies to token assessment", () => {
    const state = {
      ...createBudgetState(5, 60),
      max_tokens: 100000,
      tokens_used: 65000,
    };
    const assessment = assessBudgetWithTokens(state);

    // 65% >= 60% soft stop threshold
    expect(assessment.tokenStatus).toBe("soft_stop");
    expect(assessment.status).toBe("soft_stop");
  });
});
