import type { ComplexityLevel } from "../complexity/types";
import type {
  EffortPoints,
  PlannerConfig,
  QualityZone,
  ZoneBoundary,
} from "./types";
import { plannerConfigSchema } from "./types";

/**
 * Maps each complexity level to its effort point value.
 *
 * Uses Fibonacci-like proxy per 18-CONTEXT.md Decision 2:
 * TRIVIAL=1, SIMPLE=2, MODERATE=3, COMPLEX=5, CRITICAL=8
 */
export const EFFORT_MAP: Record<ComplexityLevel, EffortPoints> = {
  TRIVIAL: 1,
  SIMPLE: 2,
  MODERATE: 3,
  COMPLEX: 5,
  CRITICAL: 8,
};

/**
 * Quality zone boundaries defining context percentage ranges.
 *
 * Zones are advisory labels per 18-CONTEXT.md Decision 6.
 */
export const DEFAULT_ZONE_BOUNDARIES: ZoneBoundary[] = [
  {
    zone: "peak",
    start_percent: 0,
    end_percent: 30,
    description: "Best for complex, high-impact work",
  },
  {
    zone: "good",
    start_percent: 30,
    end_percent: 50,
    description: "Solid for moderate complexity work",
  },
  {
    zone: "degrading",
    start_percent: 50,
    end_percent: 70,
    description: "Simple and quick tasks only",
  },
  {
    zone: "stop",
    start_percent: 70,
    end_percent: 100,
    description: "Quality too low -- halt work",
  },
];

/**
 * Maps complexity levels to their recommended quality zone.
 *
 * Complex and critical work should be scheduled in the peak zone.
 * Simple and trivial work can be scheduled in the degrading zone.
 */
export const COMPLEXITY_ZONE_MAP: Record<ComplexityLevel, QualityZone> = {
  TRIVIAL: "degrading",
  SIMPLE: "good",
  MODERATE: "good",
  COMPLEX: "peak",
  CRITICAL: "peak",
};

/**
 * Default weekly allocation percentages.
 *
 * Per 18-CONTEXT.md Decision 5:
 * - 60% needle movers (high-impact, dependency-free)
 * - 25% quick wins (small, fast to complete)
 * - 10% maintenance (tech debt, docs, cleanup)
 * -  5% reserve (buffer for unexpected work)
 */
export const DEFAULT_WEEKLY_ALLOCATION = {
  needle_movers: 60,
  quick_wins: 25,
  maintenance: 10,
  reserve: 5,
} as const;

/**
 * Cold-start token cost estimates as context percentage per complexity level.
 *
 * These are initial guesses, calibrated over time via MEMORY.md entries.
 * Per 18-CONTEXT.md Decision 8.
 */
export const COLD_START_COSTS: Record<ComplexityLevel, number> = {
  TRIVIAL: 5,
  SIMPLE: 10,
  MODERATE: 20,
  COMPLEX: 35,
  CRITICAL: 50,
};

/**
 * Default planner configuration.
 *
 * Parsed through plannerConfigSchema to apply all Zod defaults.
 */
export const DEFAULT_PLANNER_CONFIG: PlannerConfig = plannerConfigSchema.parse(
  {},
);

/**
 * Session duration cap in minutes (3-hour rolling window).
 *
 * Per 18-CONTEXT.md Decision 1.
 */
export const DEFAULT_SESSION_CAP_MINUTES = 180;

/**
 * Maximum context percentage before recommending session stop.
 */
export const MAX_CONTEXT_PERCENT = 70;
