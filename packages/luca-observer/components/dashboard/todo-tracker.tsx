"use client";

import { useState, useMemo } from "react";
import { CheckCircle2, Circle, Clock, BarChart3 } from "lucide-react";
import filter from "lodash/filter";
import groupBy from "lodash/groupBy";
import orderBy from "lodash/orderBy";
import take from "lodash/take";

import { Button } from "~/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "~/components/ui/card";
import { Progress } from "~/components/ui/progress";
import { Badge } from "~/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/tabs";
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
 * Status icon and label mapping.
 */
const STATUS_CONFIG = {
  pending: {
    icon: Circle,
    label: "Pending",
    colorClass: "text-muted-foreground",
  },
  done: {
    icon: CheckCircle2,
    label: "Done",
    colorClass: "text-success",
  },
  completed: {
    icon: CheckCircle2,
    label: "Completed",
    colorClass: "text-success",
  },
} as const satisfies Record<
  string,
  { icon: typeof Circle; label: string; colorClass: string }
>;

const DEFAULT_STATUS_CONFIG = STATUS_CONFIG.pending;

/**
 * Predicate: whether a todo is in a terminal (finished) state.
 */
const isFinished = (t: Todo): boolean =>
  t.state === "done" || t.state === "completed";

/**
 * Compute velocity metrics from todo lists.
 *
 * Groups completed items by milestone and counts items per milestone
 * to show completion rates.
 *
 * @param todos - All todo items across states
 * @returns Object with total counts and per-milestone breakdown
 */
function computeVelocity(todos: Todo[]) {
  const pending = filter(todos, (t) => t.state === "pending");
  const finished = filter(todos, isFinished);

  // Group finished items by milestone for velocity display
  const byMilestone = groupBy(
    filter(finished, (t) => t.milestone),
    "milestone",
  );

  const milestoneBreakdown = take(
    orderBy(
      Object.entries(byMilestone).map(([milestone, items]) => ({
        milestone,
        count: items.length,
      })),
      "count",
      "desc",
    ),
    5,
  );

  return {
    pendingCount: pending.length,
    finishedCount: finished.length,
    totalCount: todos.length,
    milestoneBreakdown,
  };
}

/**
 * Todo tracker component displaying pending work items with status tabs,
 * area grouping, and velocity metrics.
 *
 * Shows todos from `.planning/todos/{pending,done,completed}/` with
 * priority badges, area tags, complexity indicators, and milestone labels.
 * Uses shadcn Card, Badge, and Tabs for consistent design system styling.
 */
export function TodoTracker() {
  const { todos, loading, error, refetch } = useTodos();
  const [activeTab, setActiveTab] = useState("pending");

  const velocity = useMemo(() => computeVelocity(todos), [todos]);

  const filteredTodos = useMemo(() => {
    if (activeTab === "velocity") return [];
    if (activeTab === "all") return todos;
    if (activeTab === "done") return filter(todos, isFinished);
    return filter(todos, (t) => t.state === activeTab);
  }, [todos, activeTab]);

  const groupedByArea = useMemo(
    () => groupBy(filteredTodos, "area"),
    [filteredTodos],
  );

  const sortedAreaKeys = useMemo(
    () => orderBy(Object.keys(groupedByArea), (k) => k),
    [groupedByArea],
  );

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
          <Button
            variant="destructive"
            size="sm"
            onClick={() => refetch()}
            className="mt-2 font-mono text-xs"
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (todos.length === 0) {
    return (
      <EmptyState
        title="No Todos"
        message="Todos tracked in .planning/todos/ will appear here."
      />
    );
  }

  const { pendingCount, finishedCount } = velocity;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-mono text-sm">
          Backlog ({pendingCount} pending, {finishedCount} done)
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="pending">
              <Circle className="h-3 w-3" />
              Pending ({pendingCount})
            </TabsTrigger>
            <TabsTrigger value="done">
              <CheckCircle2 className="h-3 w-3" />
              Done ({finishedCount})
            </TabsTrigger>
            <TabsTrigger value="velocity">
              <BarChart3 className="h-3 w-3" />
              Velocity
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending">
            <TodoList
              sortedAreaKeys={sortedAreaKeys}
              groupedByArea={groupedByArea}
              emptyMessage="No pending todos. All caught up!"
            />
          </TabsContent>

          <TabsContent value="done">
            <TodoList
              sortedAreaKeys={sortedAreaKeys}
              groupedByArea={groupedByArea}
              emptyMessage="No completed todos yet."
            />
          </TabsContent>

          <TabsContent value="velocity">
            <VelocityPanel
              milestoneBreakdown={velocity.milestoneBreakdown}
              pendingCount={pendingCount}
              finishedCount={finishedCount}
              totalCount={velocity.totalCount}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

/**
 * Renders a grouped list of todo items organized by area.
 */
function TodoList({
  sortedAreaKeys,
  groupedByArea,
  emptyMessage,
}: {
  sortedAreaKeys: string[];
  groupedByArea: Record<string, Todo[]>;
  emptyMessage: string;
}) {
  if (sortedAreaKeys.length === 0) {
    return (
      <p className="py-4 text-center font-mono text-xs text-muted-foreground">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 pt-2">
      {sortedAreaKeys.map((area) => {
        const items = orderBy(groupedByArea[area] ?? [], "priority", "asc");
        return (
          <div key={area}>
            <h4 className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/60">
              {area}
            </h4>
            <ul role="list" className="flex flex-col gap-1.5">
              {items.map((todo) => (
                <li key={todo.filename}>
                  <TodoRow todo={todo} />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Single todo row with status icon, title, and metadata badges.
 */
function TodoRow({ todo }: { todo: Todo }) {
  const priorityVariant = PRIORITY_VARIANT[todo.priority] ?? "outline";
  const statusConfig =
    STATUS_CONFIG[todo.state as keyof typeof STATUS_CONFIG] ??
    DEFAULT_STATUS_CONFIG;
  const StatusIcon = statusConfig.icon;

  return (
    <Card
      size="sm"
      className="flex-row items-center gap-2.5 py-2.5 transition-colors hover:bg-muted/50"
    >
      <StatusIcon
        className={`h-3.5 w-3.5 shrink-0 ${statusConfig.colorClass}`}
      />
      <div className="min-w-0 flex-1">
        <span className="line-clamp-1 font-mono text-xs font-medium text-foreground">
          {todo.title}
        </span>
        <div className="mt-1 flex flex-wrap gap-1">
          <Badge variant={priorityVariant}>{todo.priority}</Badge>
          {todo.complexity !== "UNKNOWN" && (
            <Badge variant="secondary">{todo.complexity}</Badge>
          )}
          {todo.milestone && (
            <Badge variant="outline">
              <Clock className="mr-0.5 h-2.5 w-2.5" />
              {todo.milestone}
            </Badge>
          )}
        </div>
      </div>
    </Card>
  );
}

/**
 * Velocity panel showing items completed per milestone.
 */
function VelocityPanel({
  milestoneBreakdown,
  pendingCount,
  finishedCount,
  totalCount,
}: {
  milestoneBreakdown: Array<{ milestone: string; count: number }>;
  pendingCount: number;
  finishedCount: number;
  totalCount: number;
}) {
  const completionRate =
    totalCount > 0 ? Math.round((finishedCount / totalCount) * 100) : 0;

  return (
    <div className="flex flex-col gap-4 pt-2">
      {/* Summary row */}
      <div className="grid grid-cols-3 gap-2">
        <Card size="sm" className="p-2.5 text-center">
          <p className="font-mono text-lg font-bold text-foreground">
            {pendingCount}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Pending
          </p>
        </Card>
        <Card size="sm" className="p-2.5 text-center">
          <p className="font-mono text-lg font-bold text-success">
            {finishedCount}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Done
          </p>
        </Card>
        <Card size="sm" className="p-2.5 text-center">
          <p className="font-mono text-lg font-bold text-foreground">
            {completionRate}%
          </p>
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Complete
          </p>
        </Card>
      </div>

      {/* Completion bar */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Overall Progress
          </span>
          <span className="font-mono text-[10px] text-muted-foreground/60">
            {finishedCount}/{totalCount}
          </span>
        </div>
        <Progress
          value={completionRate}
          aria-label="Overall completion progress"
          className="h-1.5 [&_[data-slot=progress-indicator]]:bg-success"
        />
      </div>

      {/* Per-milestone breakdown */}
      {milestoneBreakdown.length > 0 && (
        <div>
          <h4 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/60">
            Items Completed per Milestone
          </h4>
          <div className="flex flex-col gap-1.5">
            {milestoneBreakdown.map(({ milestone, count }) => (
              <Card
                key={milestone}
                size="sm"
                className="flex-row items-center justify-between p-2"
              >
                <span className="font-mono text-xs text-foreground">
                  {milestone}
                </span>
                <Badge variant="secondary">{count} items</Badge>
              </Card>
            ))}
          </div>
        </div>
      )}

      {milestoneBreakdown.length === 0 && (
        <p className="py-2 text-center font-mono text-xs text-muted-foreground">
          No milestone data available yet.
        </p>
      )}
    </div>
  );
}
