"use client";

import { cva } from "class-variance-authority";
import clsx from "clsx";

import { ErrorBoundary } from "~/components/shared/error-boundary";
import { EmptyState } from "~/components/shared/empty-state";
import { LoadingSkeleton } from "~/components/shared/loading-skeleton";
import { type Todo, useTodos } from "~/hooks/use-todos";

/**
 * CVA variants for TodoSection container styling.
 *
 * Defines border, background, and text color for pending vs done states
 * using complete literal Tailwind class strings (no template interpolation).
 */
const sectionVariants = cva("rounded-lg border p-4", {
  variants: {
    state: {
      pending: "border-warning bg-warning/10",
      done: "border-success bg-success/10",
    },
  },
  defaultVariants: {
    state: "pending",
  },
});

const sectionTitleVariants = cva("mb-3 font-mono text-sm font-medium", {
  variants: {
    state: {
      pending: "text-warning",
      done: "text-success",
    },
  },
  defaultVariants: {
    state: "pending",
  },
});

/**
 * Todo tracker component displaying pending and done work items.
 *
 * Shows todos from `.planning/todos/pending/` and `.planning/todos/done/`
 * with clear visual differentiation between states.
 */
export function TodoTracker() {
  const { todos, loading, error, refetch } = useTodos();

  if (loading) {
    return <LoadingSkeleton variant="card" />;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
        <p className="font-mono text-sm text-destructive">
          Failed to load todos: {error}
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-2 rounded bg-destructive px-3 py-1 font-mono text-xs text-foreground hover:bg-destructive/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          Retry
        </button>
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
  return (
    <div className={sectionVariants({ state: variant })}>
      <h3 className={sectionTitleVariants({ state: variant })}>
        {title} ({todos.length})
      </h3>
      <div className="flex flex-col gap-2">
        {todos.map((todo) => (
          <div
            key={todo.filename}
            className={clsx(
              "rounded-md border border-border bg-card p-3",
              variant === "done" && "opacity-70",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <h4
                className={clsx(
                  "font-mono text-sm font-medium",
                  variant === "done"
                    ? "text-muted-foreground line-through"
                    : "text-foreground",
                )}
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
              <span className="mx-2">&bull;</span>
              <span>Source: {todo.source}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
