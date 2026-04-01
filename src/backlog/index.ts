/**
 * Backlog domain barrel.
 *
 * Deterministic backlog scanning and structured todo parsing.
 *
 * @module backlog
 */
export { scanPending } from "./__helpers/scan-pending";
export {
  pendingTodoSchema,
  scanResultSchema,
} from "./__schemas/backlog.schemas";
export type { PendingTodo, ScanResult } from "./__schemas/backlog.schemas";
