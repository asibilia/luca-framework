import { z } from "zod";

/**
 * Internal schema: Doctor check result.
 *
 * Represents the outcome of a single doctor diagnostic check.
 * Uses camelCase -- internal-only, not an API payload.
 *
 * @example
 * ```typescript
 * const result = CheckResultSchema.parse({
 *   name: "Bun Runtime",
 *   status: "pass",
 *   message: "Bun 1.1.38 (1.0.0+ required)",
 *   fixCommand: null,
 *   details: null,
 * });
 * ```
 */
export const CheckResultSchema = z.object({
  name: z.string(),
  status: z.enum(["pass", "fail", "warning"]),
  message: z.string(),
  fixCommand: z.string().nullable(),
  details: z.string().nullable(),
});

export type CheckResult = z.infer<typeof CheckResultSchema>;

/**
 * Internal interface: Doctor check definition.
 *
 * Defines the contract for a diagnostic check that can be run
 * by the doctor command. Each check has a name and an async run method.
 */
export interface DoctorCheck {
  name: string;
  run(): Promise<CheckResult>;
}
