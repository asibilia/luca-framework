/**
 * Pure rendering functions for Pi widget components.
 *
 * Each function takes widget state and returns a pi-tui Component
 * (an object with `render(width): string[]`). Extracted from
 * luca-widgets.ts for testability.
 *
 * Source: src/hooks/pi-extensions/__helpers/widget-renderers.ts
 * Deployed to: .pi/extensions/__helpers/widget-renderers.ts
 */

// ─── Types ───────────────────────────────────────────────────

/** A single step in an agent chain. */
export interface StepState {
  agent: string;
  task: string;
  status: "pending" | "running" | "completed" | "failed";
  duration?: number;
}

/** Chain workflow state. */
export interface ChainState {
  name: string;
  steps: StepState[];
  currentStep: number;
}

/** Expert domain state in a research session. */
export interface ExpertState {
  domain: string;
  status: "pending" | "completed";
}

/** Research workflow state. */
export interface ResearchState {
  session: string;
  experts: ExpertState[];
}

/** TillDone loop state. */
export interface TillDoneState {
  command: string;
  attempt: number;
  max: number;
  lastStatus: string;
  failures?: number;
}

/** A single verification check result. */
export interface CheckResult {
  name: string;
  status: "passed" | "failed" | "timeout";
  count?: { pass?: number; fail?: number; errors?: number };
  duration?: number;
}

/** Verification widget state. */
export interface VerifyState {
  checks: CheckResult[];
  timestamp: number;
}

/** Quality zone for context meter. */
export type QualityZone = "PEAK" | "GOOD" | "DEGRADING" | "POOR";

/** pi-tui Component contract. */
export interface PiTuiComponent {
  render(width: number): string[];
  invalidate?(): void;
}

// ─── Helpers ─────────────────────────────────────────────────

/** Truncate string to fit within a given width. */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "\u2026";
}

/** Pad string to exact width (right-padded). */
function padRight(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width);
  return text + " ".repeat(width - text.length);
}

/** Step status icons. */
const STEP_ICONS: Record<string, string> = {
  completed: "\u2713",
  running: "\u25b8",
  failed: "\u2717",
  pending: "\u00b7",
};

/** Quality zone thresholds. */
export function getQualityZone(pct: number): QualityZone {
  if (pct <= 30) return "PEAK";
  if (pct <= 50) return "GOOD";
  if (pct <= 70) return "DEGRADING";
  return "POOR";
}

// ─── Renderers ───────────────────────────────────────────────

/**
 * Render the workflow widget for chain/expert/tilldone progress.
 *
 * Shows different layouts depending on which workflow is active:
 * - Chain: step-by-step agent pipeline
 * - Research: inline expert status
 * - TillDone: single-line loop status
 *
 * @param chain - Active chain state, or null
 * @param research - Active research state, or null
 * @param tilldone - Active tilldone state, or null
 * @returns pi-tui Component, or null if no workflow active
 */
export function renderWorkflow(
  chain: ChainState | null,
  research: ResearchState | null,
  tilldone: TillDoneState | null,
): PiTuiComponent | null {
  if (!chain && !research && !tilldone) return null;

  return {
    render(width: number): string[] {
      const inner = width - 4; // 2 border chars + 2 padding
      const lines: string[] = [];

      // Top border
      const title = chain ? " Luca " : research ? " Luca " : " Luca ";
      const borderLen = Math.max(0, inner - title.length);
      lines.push(`\u250c\u2500${title}${"─".repeat(borderLen)}\u2510`);

      if (chain) {
        // Chain header
        const completedCount = chain.steps.filter(
          (s) => s.status === "completed",
        ).length;
        const header = `Chain: ${truncate(chain.name, inner - 20)}  ${completedCount}/${chain.steps.length} steps`;
        lines.push(`\u2502 ${padRight(header, inner)} \u2502`);

        // Step lines
        for (const step of chain.steps) {
          const icon = STEP_ICONS[step.status] ?? "\u00b7";
          const durStr =
            step.status === "completed" && step.duration
              ? `(${(step.duration / 1000).toFixed(1)}s)`
              : step.status === "running"
                ? "running"
                : "";
          const taskStr = truncate(
            step.task,
            Math.max(10, inner - step.agent.length - durStr.length - 8),
          );
          const stepLine = ` ${icon} ${padRight(step.agent, 18)}${taskStr ? ` "${taskStr}"` : ""}${durStr ? `  ${durStr}` : ""}`;
          lines.push(
            `\u2502 ${padRight(truncate(stepLine, inner), inner)} \u2502`,
          );
        }
      } else if (research) {
        // Research header
        const completedCount = research.experts.filter(
          (e) => e.status === "completed",
        ).length;
        const header = `Research: ${truncate(research.session, inner - 25)}  ${completedCount}/${research.experts.length} experts`;
        lines.push(`\u2502 ${padRight(header, inner)} \u2502`);

        // Expert statuses inline
        const expertParts = research.experts.map(
          (e) =>
            `${e.status === "completed" ? "\u2713" : "\u00b7"} ${e.domain}`,
        );
        const expertLine = ` ${expertParts.join("  ")}`;
        lines.push(
          `\u2502 ${padRight(truncate(expertLine, inner), inner)} \u2502`,
        );
      } else if (tilldone) {
        // TillDone single-line
        const statusIcon =
          tilldone.lastStatus === "passed"
            ? "\u2713"
            : tilldone.lastStatus === "failed"
              ? "\u2717"
              : "\u25b8";
        const failStr =
          tilldone.failures && tilldone.failures > 0
            ? `  ${statusIcon} ${tilldone.failures} failures`
            : tilldone.lastStatus === "passed"
              ? `  \u2713 passed`
              : "";
        const tdLine = `TillDone: ${truncate(tilldone.command, inner - 30)}  attempt ${tilldone.attempt}/${tilldone.max}${failStr}`;
        lines.push(`\u2502 ${padRight(truncate(tdLine, inner), inner)} \u2502`);
      }

      // Bottom border
      lines.push(`\u2514${"─".repeat(inner + 2)}\u2518`);
      return lines;
    },
  };
}

/**
 * Render the verification widget showing per-check results.
 *
 * @param state - Verification state with check results
 * @returns pi-tui Component, or null if no verify state
 */
export function renderVerify(state: VerifyState | null): PiTuiComponent | null {
  if (!state || state.checks.length === 0) return null;

  return {
    render(width: number): string[] {
      const inner = width - 4;
      const lines: string[] = [];

      // Top border
      const title = " Verify ";
      const borderLen = Math.max(0, inner - title.length);
      lines.push(`\u250c\u2500${title}${"─".repeat(borderLen)}\u2510`);

      for (const check of state.checks) {
        const icon = check.status === "passed" ? "\u2713" : "\u2717";
        const durStr = check.duration
          ? `(${(check.duration / 1000).toFixed(1)}s)`
          : "";

        let detail = "";
        if (check.count) {
          if (check.status === "passed") {
            detail = `${check.count.pass ?? 0} pass  ${check.count.fail ?? 0} fail`;
          } else {
            detail = `${check.count.errors ?? check.count.fail ?? 0} errors`;
          }
        }

        const checkLine = `${icon} ${padRight(check.name, 12)}${detail ? detail + "  " : ""}${durStr}`;
        lines.push(
          `\u2502 ${padRight(truncate(checkLine, inner), inner)} \u2502`,
        );
      }

      // Bottom border
      lines.push(`\u2514${"─".repeat(inner + 2)}\u2518`);
      return lines;
    },
  };
}

/**
 * Render the context meter widget showing quality degradation.
 *
 * Progress bar mapped to Luca's quality degradation curve:
 * 0-30% PEAK, 30-50% GOOD, 50-70% DEGRADING, 70%+ POOR
 *
 * @param pct - Context usage percentage (0-100)
 * @param zone - Quality zone label
 * @returns pi-tui Component
 */
export function renderContext(
  pct: number,
  zone: QualityZone,
): PiTuiComponent | null {
  if (pct < 0) return null;

  return {
    render(width: number): string[] {
      const inner = width - 4;
      const lines: string[] = [];

      // Top border
      const title = " Context ";
      const borderLen = Math.max(0, inner - title.length);
      lines.push(`\u250c\u2500${title}${"─".repeat(borderLen)}\u2510`);

      // Progress bar
      const barWidth = Math.max(10, inner - 30);
      const filled = Math.round((pct / 100) * barWidth);
      const empty = barWidth - filled;
      const bar = `[${"█".repeat(filled)}${"░".repeat(empty)}]`;

      const warning = zone === "POOR" ? "\u26a0 " : "";
      const zoneLabel =
        zone === "POOR"
          ? `${warning}POOR \u2014 stop soon`
          : zone === "DEGRADING"
            ? `${warning}DEGRADING`
            : `${zone} quality zone`;

      const meterLine = `${bar} ${pct}%  ${zoneLabel}`;
      lines.push(
        `\u2502 ${padRight(truncate(meterLine, inner), inner)} \u2502`,
      );

      // Bottom border
      lines.push(`\u2514${"─".repeat(inner + 2)}\u2518`);
      return lines;
    },
  };
}
