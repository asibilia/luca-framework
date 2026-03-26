"use client";

import { useEffect, useRef, useState } from "react";

import { AlertCircle, Shield } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type VaultInfo = {
  vaults: string[];
  health: {
    status: string;
    uptime?: number;
  } | null;
};

type FetchState = "loading" | "loaded" | "error";

// ---------------------------------------------------------------------------
// Routing Table Data
// ---------------------------------------------------------------------------

/** Static dual-vault routing summary for display purposes. */
const ROUTING_TABLE = [
  { prefix: "session:*", vault: "Repo", rationale: "Project-scoped context" },
  {
    prefix: "version:*, milestone:*",
    vault: "Repo",
    rationale: "Release history",
  },
  { prefix: "brain:project-*", vault: "Repo", rationale: "Project identity" },
  { prefix: "metric:*", vault: "Repo", rationale: "Per-project metrics" },
  { prefix: "research:*", vault: "Repo", rationale: "Phase-scoped research" },
  {
    prefix: "pattern:*",
    vault: "Default",
    rationale: "Generalizable patterns",
  },
  {
    prefix: "pitfall:*",
    vault: "Default",
    rationale: "Generalizable warnings",
  },
  { prefix: "preference:*", vault: "Default", rationale: "User preferences" },
  { prefix: "brain:user-*", vault: "Default", rationale: "User identity" },
  { prefix: "procedure:*", vault: "Default", rationale: "Reusable workflows" },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Read-only display of MuninnDB vault configuration.
 *
 * Shows the available vaults, dual-vault routing summary table,
 * and vault health status. Gracefully degrades when MuninnDB is unavailable.
 */
export function VaultConfig() {
  const [state, setState] = useState<FetchState>("loading");
  const [vaultInfo, setVaultInfo] = useState<VaultInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    void (async () => {
      try {
        // Fetch vaults and health in parallel
        const [vaultsRes, healthRes] = await Promise.all([
          fetch("/api/muninn/vaults"),
          fetch("/api/muninn/health"),
        ]);

        if (!vaultsRes.ok) {
          setState("error");
          setErrorMessage("MuninnDB unavailable");
          return;
        }

        const vaultsData = (await vaultsRes.json()) as
          | string[]
          | { vaults?: string[] };
        const vaults = Array.isArray(vaultsData)
          ? vaultsData
          : (vaultsData.vaults ?? []);

        let health: VaultInfo["health"] = null;
        if (healthRes.ok) {
          health = (await healthRes.json()) as VaultInfo["health"];
        }

        setVaultInfo({ vaults, health });
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
          <Shield className="size-4" />
          Vault Configuration
          <Badge variant="outline" className="ml-1 font-normal">
            Advanced
          </Badge>
        </CardTitle>
        <CardDescription>
          MuninnDB dual-vault routing and health
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {state === "loading" && (
          <div className="space-y-3">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}

        {state === "error" && (
          <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
            <AlertCircle className="size-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {state === "loaded" && vaultInfo && (
          <>
            {/* Vault list */}
            <div className="space-y-1">
              <h4 className="text-sm font-medium">Active Vaults</h4>
              <div className="flex flex-wrap gap-1.5">
                {vaultInfo.vaults.map((vault) => (
                  <Badge key={vault} variant="secondary">
                    {vault}
                  </Badge>
                ))}
                {vaultInfo.vaults.length === 0 && (
                  <span className="text-sm text-muted-foreground">
                    No vaults found
                  </span>
                )}
              </div>
            </div>

            {/* Health summary */}
            {vaultInfo.health && (
              <div className="space-y-1">
                <h4 className="text-sm font-medium">Health</h4>
                <div className="flex items-center gap-2 text-sm">
                  <span
                    className={
                      vaultInfo.health.status === "healthy"
                        ? "text-green-600 dark:text-green-400"
                        : "text-amber-600 dark:text-amber-400"
                    }
                  >
                    {vaultInfo.health.status}
                  </span>
                  {vaultInfo.health.uptime != null && (
                    <span className="text-muted-foreground">
                      (uptime: {Math.round(vaultInfo.health.uptime / 60)}m)
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Routing table */}
            <div className="space-y-1">
              <h4 className="text-sm font-medium">
                Dual-Vault Routing Summary
              </h4>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[180px]">
                        Concept Prefix
                      </TableHead>
                      <TableHead className="w-[80px]">Vault</TableHead>
                      <TableHead>Rationale</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ROUTING_TABLE.map((row) => (
                      <TableRow key={row.prefix}>
                        <TableCell className="font-mono text-xs">
                          {row.prefix}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              row.vault === "Repo" ? "default" : "secondary"
                            }
                          >
                            {row.vault}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {row.rationale}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
