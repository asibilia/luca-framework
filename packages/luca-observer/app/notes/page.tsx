"use client";

import { useCallback, useMemo, useState } from "react";

import orderBy from "lodash/orderBy";
import { useTable, useReducer } from "spacetimedb/react";

import { PageContainer } from "~/components/layout/page-container";
import { EmptyState } from "~/components/shared/empty-state";
import { ErrorBoundary } from "~/components/shared/error-boundary";
import { tables, reducers } from "~/module_bindings";

/**
 * Notes page — Developer notes queue dashboard.
 *
 * Shows an input form for adding notes, a pending notes list,
 * and a collapsible done/consumed notes list. Updates in real-time
 * via SpacetimeDB subscriptions.
 */
export default function NotesPage() {
  const [text, setText] = useState("");
  const [priority, setPriority] = useState<"next" | "whenever">("next");
  const [showDone, setShowDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rows, isLoading] = useTable(tables.notes);
  const createNote = useReducer(reducers.createNote);

  const { pending, done } = useMemo(() => {
    const pendingNotes = orderBy(
      rows.filter((r) => r.status === "pending"),
      (r) => Number(r.createdAt),
      "desc",
    );
    const doneNotes = orderBy(
      rows.filter((r) => r.status === "consumed" || r.status === "done"),
      (r) => Number(r.consumedAt ?? r.createdAt),
      "desc",
    );
    return { pending: pendingNotes, done: doneNotes };
  }, [rows]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!text.trim() || submitting) return;

      setSubmitting(true);
      setError(null);
      try {
        const filename = `note-${Date.now()}.md`;
        await createNote({
          filename,
          body: text.trim(),
          priority,
          createdAt: BigInt(Date.now()),
        });
        setText("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create note");
      } finally {
        setSubmitting(false);
      }
    },
    [text, priority, submitting, createNote],
  );

  const formatAge = (timestamp: bigint): string => {
    const ms = Date.now() - Number(timestamp);
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <PageContainer
      title="Notes"
      subtitle="Developer notes queue — soft interrupts for agent context"
    >
      {/* Input form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a developer note..."
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none"
          />
          <button
            type="button"
            onClick={() =>
              setPriority((p) => (p === "next" ? "whenever" : "next"))
            }
            className={`rounded-md border px-3 py-2 font-mono text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 ${
              priority === "next"
                ? "border-warning bg-warning/10 text-warning"
                : "border-border bg-muted text-muted-foreground"
            }`}
          >
            {priority === "next" ? "urgent" : "whenever"}
          </button>
          <button
            type="submit"
            disabled={!text.trim() || submitting}
            className="rounded-md bg-accent px-4 py-2 font-mono text-xs font-medium text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
          >
            {submitting ? "Adding..." : "Add Note"}
          </button>
        </div>
        {error && <p className="font-mono text-xs text-destructive">{error}</p>}
      </form>

      {/* Pending notes */}
      <ErrorBoundary name="PendingNotesList">
        <div className="flex flex-col gap-3">
          <h2 className="font-mono text-sm font-medium text-foreground">
            Pending ({pending.length})
          </h2>
          {isLoading ? (
            <EmptyState message="Loading notes..." />
          ) : pending.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <p className="font-mono text-sm text-muted-foreground">
                No pending notes. Use the form above or{" "}
                <code className="rounded bg-muted px-1 py-0.5">/note</code> to add
                one.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {pending.map((note) => (
                <div
                  key={note.filename}
                  className="flex items-start gap-3 rounded-lg border border-border bg-card p-3"
                >
                  <span
                    className={`mt-0.5 rounded px-1.5 py-0.5 font-mono text-xs font-medium ${
                      note.priority === "next"
                        ? "bg-warning/10 text-warning"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {note.priority}
                  </span>
                  <div className="flex-1">
                    <p className="font-mono text-sm text-foreground">
                      {note.body}
                    </p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {formatAge(note.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ErrorBoundary>

      {/* Done notes (collapsible) */}
      {done.length > 0 && (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setShowDone((s) => !s)}
            className="flex items-center gap-2 font-mono text-sm font-medium text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
          >
            <span aria-hidden="true">{showDone ? "v" : ">"}</span>
            Consumed ({done.length})
          </button>
          {showDone && (
            <div className="flex flex-col gap-2">
              {done.map((note) => (
                <div
                  key={note.filename}
                  className="flex items-start gap-3 rounded-lg border border-border/50 bg-card/50 p-3 opacity-60"
                >
                  <span className="mt-0.5 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                    done
                  </span>
                  <div className="flex-1">
                    <p className="font-mono text-sm text-foreground">
                      {note.body}
                    </p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {formatAge(note.consumedAt ?? note.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </PageContainer>
  );
}
