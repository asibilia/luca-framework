/**
 * Scope categories for doctor checks.
 *
 * - `prerequisites`: Bun runtime and platform checks
 * - `global`: Global artifacts, MuninnDB, framework runtime
 * - `project`: Config validation, harness installation, drift, project context
 */
export type DoctorScope = "prerequisites" | "global" | "project";

export interface CheckResult {
  name: string;
  status: "pass" | "fail" | "warning";
  message: string;
  fixCommand: string | null;
  details: string | null;
}

export interface DoctorCheck {
  name: string;
  scope: DoctorScope;
  run(): Promise<CheckResult>;
}
