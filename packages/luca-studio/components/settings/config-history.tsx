"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  GitCommit,
  Loader2,
  RotateCcw,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type HistoryCommit = {
  sha: string;
  message: string;
  date: string;
  author: string;
  files: string[];
};

type FetchState = "loading" | "loaded" | "error";

type RevertTarget = {
  filePath: string;
  commitSha: string;
  commitMessage: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format an ISO date string as a relative time (e.g., "2 hours ago").
 *
 * Falls back to the raw date string if Date parsing fails.
 */
function formatRelativeDate(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.round(diffMs / 60_000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.round(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.round(diffHours / 24);
    if (diffDays < 30) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  } catch {
    return isoDate;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Timeline of `[studio-edit]` commits with per-file rollback capability.
 *
 * Fetches commit history from `GET /api/git/history` and displays as a
 * vertical timeline. Each commit can be expanded to show changed files,
 * with a per-file "Revert" button that calls `POST /api/git/revert`.
 *
 * Before reverting, shows a confirmation dialog to prevent accidental
 * data loss.
 */
export function ConfigHistory() {
  const [state, setState] = useState<FetchState>("loading");
  const [commits, setCommits] = useState<HistoryCommit[]>([]);
  const [expandedSha, setExpandedSha] = useState<string | null>(null);
  const [revertTarget, setRevertTarget] = useState<RevertTarget | null>(null);
  const [reverting, setReverting] = useState(false);
  const [revertError, setRevertError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  // ---------------------------
  // Fetch history
  // ---------------------------

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/git/history?limit=20");
      if (!res.ok) {
        setState("error");
        return;
      }

      const data = (await res.json()) as { commits: HistoryCommit[] };
      setCommits(data.commits ?? []);
      setState("loaded");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    void fetchHistory();
  }, [fetchHistory]);

  // ---------------------------
  // Toggle expand
  // ---------------------------

  const toggleExpand = useCallback((sha: string) => {
    setExpandedSha((prev) => (prev === sha ? null : sha));
  }, []);

  // ---------------------------
  // Revert flow
  // ---------------------------

  const handleRevertClick = useCallback(
    (filePath: string, commitSha: string, commitMessage: string) => {
      setRevertTarget({ filePath, commitSha, commitMessage });
      setRevertError(null);
    },
    [],
  );

  const handleRevertConfirm = useCallback(async () => {
    if (!revertTarget) return;

    setReverting(true);
    setRevertError(null);

    try {
      const res = await fetch("/api/git/revert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_path: revertTarget.filePath,
          commit_sha: revertTarget.commitSha,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setRevertError(data.error ?? "Revert failed");
        return;
      }

      // Success -- close dialog and refresh history
      setRevertTarget(null);
      fetchedRef.current = false;
      void fetchHistory();
    } catch (err) {
      setRevertError(
        err instanceof Error ? err.message : "Revert failed unexpectedly",
      );
    } finally {
      setReverting(false);
    }
  }, [revertTarget, fetchHistory]);

  const handleRevertCancel = useCallback(() => {
    setRevertTarget(null);
    setRevertError(null);
  }, []);

  // ---------------------------
  // Render
  // ---------------------------

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitCommit className="size-4" />
          Config History
        </CardTitle>
        <CardDescription>
          Studio commit timeline with per-file rollback
        </CardDescription>
      </CardHeader>
      <CardContent>
        {state === "loading" && (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}

        {state === "error" && (
          <div className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
            <AlertCircle className="size-4 shrink-0" />
            <span>Failed to load commit history</span>
          </div>
        )}

        {state === "loaded" && commits.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
            <GitCommit className="size-8 opacity-30" />
            <p className="text-sm">No Studio commits yet.</p>
            <p className="text-xs text-muted-foreground/60">
              Edit entities and click Publish to create your first commit.
            </p>
          </div>
        )}

        {state === "loaded" && commits.length > 0 && (
          <div className="relative space-y-0">
            {/* Timeline line */}
            <div className="absolute left-3.5 top-2 bottom-2 w-px bg-border" />

            {commits.map((commit) => {
              const isExpanded = expandedSha === commit.sha;

              return (
                <div key={commit.sha} className="relative pl-9 pb-4">
                  {/* Timeline dot */}
                  <div className="absolute left-2 top-1.5 size-3 rounded-full border-2 border-primary bg-background" />

                  {/* Commit header */}
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={() => toggleExpand(commit.sha)}
                    className="flex w-full items-start gap-2 text-left hover:bg-muted/50 rounded-md px-2 py-1 -ml-2 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {commit.message}
                        </span>
                        <Badge variant="secondary" className="shrink-0">
                          <FileText className="mr-0.5 size-3" />
                          {commit.files.length}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <Clock className="size-3" />
                        <span>{formatRelativeDate(commit.date)}</span>
                        <span className="font-mono">
                          {commit.sha.substring(0, 7)}
                        </span>
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronDown className="size-4 shrink-0 mt-1 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-4 shrink-0 mt-1 text-muted-foreground" />
                    )}
                  </button>

                  {/* Expanded file list */}
                  {isExpanded && commit.files.length > 0 && (
                    <div className="mt-2 ml-2 space-y-1 rounded-md border bg-muted/30 p-2">
                      {commit.files.map((file) => (
                        <div
                          key={file}
                          className="flex items-center justify-between gap-2 text-xs"
                        >
                          <span className="truncate font-mono text-muted-foreground">
                            {file}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 shrink-0 gap-1 px-2 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRevertClick(
                                file,
                                commit.sha,
                                commit.message,
                              );
                            }}
                          >
                            <RotateCcw className="size-3" />
                            Revert
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Revert confirmation dialog */}
      <AlertDialog
        open={revertTarget !== null}
        onOpenChange={(open) => {
          if (!open) handleRevertCancel();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Revert</AlertDialogTitle>
            <AlertDialogDescription>
              Revert{" "}
              <span className="font-mono font-medium">
                {revertTarget?.filePath}
              </span>{" "}
              to commit{" "}
              <span className="font-mono font-medium">
                {revertTarget?.commitSha.substring(0, 7)}
              </span>
              ? This will overwrite the current version of the file.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {revertError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {revertError}
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={reverting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevertConfirm}
              disabled={reverting}
              variant="destructive"
            >
              {reverting && <Loader2 className="mr-1 size-3.5 animate-spin" />}
              {reverting ? "Reverting..." : "Revert"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
