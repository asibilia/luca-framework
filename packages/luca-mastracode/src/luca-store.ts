/**
 * File-based Luca workflow state persistence.
 *
 * The Mastra Code harness state (`harness.setState`) validates through a Zod
 * schema that silently strips unknown keys. Since we can't extend the built-in
 * schema, Luca-specific workflow state is stored in `.planning/luca-state.json`.
 *
 * This file survives mode switches, process restarts, and TUI reconnections.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const STATE_FILE = '.planning/luca-state.json';

export interface PhaseResult {
  /** Phase name from ROADMAP.md */
  name: string;
  /** Phase status */
  status: 'pending' | 'in-progress' | 'complete' | 'skipped' | 'blocked';
  /** Number of execution iterations (execute→checks→verify cycles) */
  iterations: number;
  /** Number of waves completed within this phase */
  wavesCompleted: number;
  /** Timestamp when phase started */
  startedAt?: string;
  /** Timestamp when phase completed */
  completedAt?: string;
  /** Whether verification passed */
  verificationPassed?: boolean;
  /** Whether review passed */
  reviewPassed?: boolean;
}

export interface LucaWorkflowState {
  // --- Triage output ---
  intent?: string;
  complexity?: string;
  profile?: string;
  oversight?: string;
  affectedAreas?: string[];
  skipResearch?: boolean;

  // --- Pipeline progress ---
  pipelineStep?: string;
  nextMode?: string;
  currentPhase?: number;
  totalPhases?: number;

  // --- Phase tracking ---
  phaseResults?: PhaseResult[];
  currentPhaseName?: string;
  currentWave?: number;
  currentIteration?: number;
  milestoneCount?: number;

  // --- Review tracking ---
  reviewIteration?: number;

  // --- Plan artifacts ---
  planFile?: string;
  roadmapFile?: string;

  // --- Session ---
  sessionId?: string;
  startedAt?: string;

  // --- Assigned work ---
  assignedTodos?: number[];

  // Allow arbitrary extension
  [key: string]: unknown;
}

function statePath(): string {
  return join(process.cwd(), STATE_FILE);
}

/**
 * Read the current Luca workflow state from disk.
 * Returns empty object if the file doesn't exist.
 */
export function readLucaState(): LucaWorkflowState {
  const p = statePath();
  if (!existsSync(p)) return {};
  try {
    const state = JSON.parse(readFileSync(p, 'utf-8'));

    // Migrate stale "plan" pipeline references to "architect"
    // (renamed in the pipeline: plan → architect)
    if (state.pipelineStep === "plan") state.pipelineStep = "architect";
    if (state.nextMode === "plan") state.nextMode = "architect";

    return state;
  } catch {
    return {};
  }
}

/**
 * Write fields to Luca workflow state (merge, not replace).
 */
export function writeLucaState(updates: Partial<LucaWorkflowState>): LucaWorkflowState {
  const current = readLucaState();
  const merged = { ...current, ...updates };

  const dir = join(process.cwd(), '.planning');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(statePath(), JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
}

/**
 * Reset Luca workflow state (start fresh).
 */
export function resetLucaState(): void {
  const p = statePath();
  if (existsSync(p)) {
    writeFileSync(p, '{}', 'utf-8');
  }
}

// ---------------------------------------------------------------------------
// Phase tracking helpers
// ---------------------------------------------------------------------------

/**
 * Start a new phase. Initializes phase result entry and resets iteration counters.
 */
export function startPhase({ name }: { name: string }): LucaWorkflowState {
  const state = readLucaState();
  const results = state.phaseResults ?? [];

  // Check if phase already exists (resuming)
  const existing = results.find(r => r.name === name);
  if (existing && existing.status !== 'complete') {
    existing.status = 'in-progress';
    existing.iterations = (existing.iterations ?? 0);
  } else if (!existing) {
    results.push({
      name,
      status: 'in-progress',
      iterations: 0,
      wavesCompleted: 0,
      startedAt: new Date().toISOString(),
    });
  }

  return writeLucaState({
    phaseResults: results,
    currentPhaseName: name,
    currentWave: 1,
    currentIteration: 0,
  });
}

/**
 * Record a completed iteration within the current phase.
 */
export function recordIteration(): LucaWorkflowState {
  const state = readLucaState();
  const results = state.phaseResults ?? [];
  const current = results.find(r => r.name === state.currentPhaseName);
  if (current) {
    current.iterations = (current.iterations ?? 0) + 1;
  }
  return writeLucaState({
    phaseResults: results,
    currentIteration: (state.currentIteration ?? 0) + 1,
  });
}

/**
 * Advance to the next wave within the current phase.
 */
export function advanceWave(): LucaWorkflowState {
  const state = readLucaState();
  const results = state.phaseResults ?? [];
  const current = results.find(r => r.name === state.currentPhaseName);
  if (current) {
    current.wavesCompleted = (current.wavesCompleted ?? 0) + 1;
  }
  return writeLucaState({
    phaseResults: results,
    currentWave: (state.currentWave ?? 1) + 1,
    currentIteration: 0,
  });
}

/**
 * Complete the current phase.
 */
export function completePhase({ verificationPassed, reviewPassed }: {
  verificationPassed?: boolean;
  reviewPassed?: boolean;
}): LucaWorkflowState {
  const state = readLucaState();
  const results = state.phaseResults ?? [];
  const current = results.find(r => r.name === state.currentPhaseName);
  if (current) {
    current.status = 'complete';
    current.completedAt = new Date().toISOString();
    current.verificationPassed = verificationPassed;
    current.reviewPassed = reviewPassed;
  }

  const completedCount = results.filter(r => r.status === 'complete').length;
  const totalPhases = state.totalPhases ?? results.length;
  const nextPhaseIndex = results.findIndex(r => r.status === 'pending');

  return writeLucaState({
    phaseResults: results,
    currentPhase: completedCount,
    totalPhases,
    currentPhaseName: nextPhaseIndex >= 0 ? results[nextPhaseIndex]?.name : undefined,
    currentWave: 1,
    currentIteration: 0,
  });
}
