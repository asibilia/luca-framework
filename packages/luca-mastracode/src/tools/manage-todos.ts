import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  addTodo,
  listTodos,
  moveTodo,
  removeTodo,
  assignBatch,
  readTodoContent,
  type TodoStatus,
} from "../todos.js";

export const manageTodosTool = createTool({
  id: "manage-todos",
  description:
    "Manage the Luca development backlog stored as markdown files in .planning/todos/. " +
    "Todos live in status directories: pending/, backlog/, done/. " +
    "Supports listing, adding, moving between statuses, reading full content, removing, and batch-assigning. " +
    "Use 'list' before 'add' to check for duplicates. When moving to 'done', verify the task is actually complete.",
  inputSchema: z.object({
    action: z
      .enum(["list", "add", "move", "read", "remove", "assign-batch"])
      .describe("Operation to perform on the backlog"),
    title: z
      .string()
      .optional()
      .describe("Title for a new todo (required for add)"),
    area: z
      .string()
      .optional()
      .describe("Area/domain tag for a new todo (e.g. 'data', 'ui', 'admin')"),
    priority: z
      .string()
      .optional()
      .describe("Priority for a new todo (e.g. 'low', 'medium', 'high', 'critical')"),
    source: z
      .string()
      .optional()
      .describe("Source tag for a new todo (e.g. 'luca-cli', 'research', 'triage')"),
    body: z
      .string()
      .optional()
      .describe("Optional markdown body appended after the task title. Use for context notes, recall instructions, etc."),
    identifier: z
      .union([z.number(), z.string()])
      .optional()
      .describe(
        "Todo identifier — numeric index (from list output) or slug string (required for move, read, remove)"
      ),
    targetStatus: z
      .enum(["pending", "backlog", "done"])
      .optional()
      .describe("Target status directory (required for move)"),
    indices: z
      .array(z.number())
      .optional()
      .describe(
        "Array of todo indices to assign to pending (required for assign-batch)"
      ),
    filterStatus: z
      .enum(["pending", "backlog", "done"])
      .optional()
      .describe("Filter todos by status directory (for list action)"),
  }),
  execute: async (inputData) => {
    const {
      action,
      title,
      area,
      priority,
      source,
      body,
      identifier,
      targetStatus,
      indices,
      filterStatus,
    } = inputData;

    switch (action) {
      case "list": {
        const todos = listTodos({
          status: filterStatus as TodoStatus | undefined,
        });
        const lines = todos.map((t) => {
          const icon =
            t.status === "done"
              ? "✅"
              : t.status === "backlog"
                ? "📋"
                : "⬜";
          const tags = [t.area, t.priority].filter(Boolean).join(", ");
          return `${icon} #${t.index} [${t.status}] ${t.title}${tags ? ` (${tags})` : ""}`;
        });
        return {
          count: todos.length,
          todos: lines.join("\n") || "(empty backlog)",
        };
      }
      case "add": {
        if (!title) return { error: "title is required for add" };
        const todo = addTodo({ title, area, priority, source, body });
        return {
          added: `${todo.title}`,
          slug: todo.slug,
          status: todo.status,
        };
      }
      case "move": {
        if (identifier === undefined || !targetStatus)
          return {
            error: "identifier and targetStatus are required for move",
          };
        const moved = moveTodo({
          identifier,
          targetStatus: targetStatus as TodoStatus,
        });
        if (!moved) return { error: `Todo not found: ${identifier}` };
        return {
          moved: `#${moved.index} ${moved.title} → ${moved.status}`,
        };
      }
      case "read": {
        if (identifier === undefined)
          return { error: "identifier is required for read" };
        const result = readTodoContent({ identifier });
        if (!result) return { error: `Todo not found: ${identifier}` };
        return {
          slug: result.todo.slug,
          title: result.todo.title,
          status: result.todo.status,
          content: result.content,
        };
      }
      case "remove": {
        if (identifier === undefined)
          return { error: "identifier is required for remove" };
        const removed = removeTodo({ identifier });
        return removed
          ? { removed: `${identifier}` }
          : { error: `Todo not found: ${identifier}` };
      }
      case "assign-batch": {
        if (!indices?.length)
          return { error: "indices array is required for assign-batch" };
        const assigned = assignBatch({ indices });
        return {
          assigned: assigned.map((t) => `#${t.index}: ${t.title}`),
          count: assigned.length,
        };
      }
      default:
        return { error: `Unknown action: ${action}` };
    }
  },
});
