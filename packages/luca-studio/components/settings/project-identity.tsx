"use client";

import { useEffect, useRef, useState } from "react";

import { AlertCircle, Database } from "lucide-react";

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

type ProjectInfo = {
  name: string;
  domain: string;
  purpose: string;
};

type FetchState = "loading" | "loaded" | "error";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Read-only display of project identity from MuninnDB.
 *
 * Fetches project identity from `/api/muninn/stats` and displays the
 * project name, domain, and purpose as label-value rows in a card.
 *
 * Gracefully degrades to "MuninnDB unavailable" when the fetch fails,
 * allowing the Settings page to render without a hard dependency on
 * MuninnDB connectivity.
 */
export function ProjectIdentity() {
  const [state, setState] = useState<FetchState>("loading");
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    void (async () => {
      try {
        const res = await fetch("/api/muninn/stats?vault=luca-framework");
        if (!res.ok) {
          setState("error");
          setErrorMessage("MuninnDB unavailable");
          return;
        }

        const data = (await res.json()) as Record<string, unknown>;

        // Extract project identity from stats response
        const vaultName =
          (data.vault as string) ?? (data.vault_name as string) ?? "Unknown";

        setProject({
          name: vaultName,
          domain: (data.domain as string) ?? "Developer Tooling",
          purpose:
            (data.purpose as string) ??
            "Agentic development framework with cognitive memory",
        });
        setState("loaded");
      } catch {
        setState("error");
        setErrorMessage("MuninnDB unavailable");
      }
    })();
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="size-4" />
          Project Identity
        </CardTitle>
        <CardDescription>
          Project information from MuninnDB brain tree
        </CardDescription>
      </CardHeader>
      <CardContent>
        {state === "loading" && (
          <div className="space-y-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        )}

        {state === "error" && (
          <div className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
            <AlertCircle className="size-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {state === "loaded" && project && (
          <div className="space-y-2">
            <InfoRow label="Project" value={project.name} />
            <InfoRow label="Domain" value={project.domain} />
            <InfoRow label="Purpose" value={project.purpose} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3 text-sm">
      <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
