"use client";

import { ErrorBoundary } from "~/components/shared/error-boundary";
import { EmptyState } from "~/components/shared/empty-state";
import { type Todo, useTodos } from "~/hooks/use-todos";

/**
 * Todo tracker component displaying pending and done work items.
 *
 * Shows todos from `.planning/todos/pending/` and `.planning/todos/done/`
 * with clear visual differentiation between states.
 */
export function TodoTracker() {
  const { todos, loading } = useTodos();

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="font-mono text-xs text-muted-foreground">Loading todos...</p>
      </div>
    );
  }

  if (todos.length === 0) {
    return (
      <EmptyState
        title="No Todos"
        message="Todos tracked in .planning/todos/pending/ and .planning/todos/done/ will appear here."
      />
    );
  }

  const pending = todos.filter((t) => t.state === "pending");
  const done = todos.filter((t) => t.state === "done");

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ErrorBoundary name="PendingTodos">
        <TodoSection title="Pending" todos={pending} variant="pending" />
      </ErrorBoundary>
      {done.length > 0 && (
        <ErrorBoundary name="DoneTodos">
          <TodoSection title="Done" todos={done} variant="done" />
        </ErrorBoundary>
      )}
    </div>
  );
}

function TodoSection({
  title,
  todos,
  variant,
}: {
  title: string;
  todos: Todo[];
  variant: "pending" | "done";
}) {
  const bgColor = variant === "pending" ? "bg-warning/10" : "bg-success/10";
  const textColor = variant === "pending" ? "text-warning" : "text-success";
  const borderColor = variant === "pending" ? "border-warning" : "border-success";

  return (
    <div className={`rounded-lg border ${borderColor} ${bgColor} p-4`}>
      <h3 className={`mb-3 font-mono text-sm font-medium ${textColor}`}>
        {title} ({todos.length})
      </h3>
      <div className="flex flex-col gap-2">
        {todos.map((todo) => (
          <div
            key={todo.filename}
            className={`rounded-md border border-border bg-card p-3 ${
              variant === "done" ? "opacity-70" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <h4
                className={`font-mono text-sm font-medium ${
                  variant === "done" ? "line-through text-muted-foreground" : "text-foreground"
                }`}
              >
                {todo.title}
              </h4>
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                Tier {todo.tier}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                {todo.area}
              </span>
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                {todo.complexity}
              </span>
            </div>
            <div className="mt-2 font-mono text-xs text-muted-foreground">
              <span>Created: {todo.created}</span>
              <span className="mx-2">•</span>
              <span>Source: {todo.source}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
