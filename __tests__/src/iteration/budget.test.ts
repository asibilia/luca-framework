import { describe, test, expect } from "bun:test";
import {
  createBudgetState,
  assessBudget,
  advanceBudget,
  shouldStartIteration,
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
