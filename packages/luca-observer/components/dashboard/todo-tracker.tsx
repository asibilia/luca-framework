"use client";

import { Card, CardHeader, CardTitle, CardContent } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { EmptyState } from "~/components/shared/empty-state";
import { LoadingSkeleton } from "~/components/shared/loading-skeleton";
import { type Todo, useTodos } from "~/hooks/use-todos";

/**
 * Priority badge variant mapping.
 */
const PRIORITY_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  P0: "destructive",
  P1: "default",
  P2: "secondary",
  P3: "outline",
  P4: "outline",
};

/**
 * Todo tracker component displaying pending work items.
 *
 * Shows todos from `.planning/todos/pending/` with priority badges,
 * area tags, and complexity indicators. Uses shadcn Card and Badge
 * for consistent design system styling.
 */
export function TodoTracker() {
  const { todos, loading, error, refetch } = useTodos();

  if (loading) {
    return <LoadingSkeleton variant="card" />;
  }

  if (error) {
    return (
      <Card>
        <CardContent>
          <p className="font-mono text-sm text-destructive">
            Failed to load todos: {error}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-2 rounded bg-destructive px-3 py-1 font-mono text-xs text-destructive-foreground hover:bg-destructive/80"
          >
            Retry
          </button>
        </CardContent>
      </Card>
    );
  }

  const pending = todos.filter((t) => t.state === "pending");

  if (pending.length === 0) {
    return (
      <EmptyState
        title="No Pending Todos"
        message="Todos tracked in .planning/todos/pending/ will appear here."
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-mono text-sm">
          Backlog ({pending.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {pending.map((todo) => (
          <TodoRow key={todo.filename} todo={todo} />
        ))}
      </CardContent>
    </Card>
  );
}

function TodoRow({ todo }: { todo: Todo }) {
  const priorityVariant = PRIORITY_VARIANT[todo.priority] ?? "outline";

  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-card p-3 transition-colors hover:bg-muted/50">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-mono text-xs font-medium text-foreground">
            {todo.title}
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <Badge variant={priorityVariant}>{todo.priority}</Badge>
          <Badge variant="outline">{todo.area}</Badge>
          {todo.complexity !== "UNKNOWN" && (
            <Badge variant="secondary">{todo.complexity}</Badge>
          )}
        </div>
      </div>
    </div>
  );
}
