"use client";

import { useCallback, useState } from "react";

import { AlertTriangle, Loader2, Upload } from "lucide-react";

import { ConfigHistory } from "~/components/settings/config-history";
import { ProjectIdentity } from "~/components/settings/project-identity";
import { RawConfigEditor } from "~/components/settings/raw-config-editor";
import { VaultConfig } from "~/components/settings/vault-config";
import { PageContainer } from "~/components/layout/page-container";
import { Button } from "~/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
import { useConfigConflict } from "~/hooks/use-config-conflict";
import { useConfigHydration } from "~/hooks/use-config-hydration";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PublishState = "idle" | "publishing" | "success" | "error";

type PublishResult = {
  commit_sha?: string;
  message?: string;
  file_count?: number;
  error?: string;
  files?: string[];
};

// ---------------------------------------------------------------------------
// Section Wrapper
// ---------------------------------------------------------------------------

/**
 * Collapsible section wrapper for the Settings page.
 *
 * Provides a consistent header with title, optional subtitle, and
 * expand/collapse toggle. Uses shadcn Collapsible primitive.
 */
function SettingsSection({
  title,
  subtitle,
  defaultOpen,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? true);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/50"
        >
          <div>
            <span className="text-sm font-medium">{title}</span>
            {subtitle && (
              <span className="ml-2 text-xs text-muted-foreground">
                {subtitle}
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {open ? "Collapse" : "Expand"}
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}

// ---------------------------------------------------------------------------
// Settings Page
// ---------------------------------------------------------------------------

/**
 * Full Settings page with four sections:
 *
 * 1. **Raw Config Editor** (default open) -- CodeMirror JSON editor for
 *    config.json with dual JSON + Zod validation.
 * 2. **Project Identity** (default open) -- Read-only MuninnDB project info.
 * 3. **Vault Configuration** (default collapsed, Advanced) -- Vault routing
 *    table and health display.
 * 4. **Config History** (default open) -- Timeline of `[studio-edit]` commits
 *    with per-file rollback.
 *
 * Page header includes a "Publish Changes" button that batch-commits all
 * Studio-edited entity files via `POST /api/git/publish`.
 */
export default function SettingsPage() {
  // Hydrate config atom on mount
  useConfigHydration();

  // SSE conflict detection
  const { hasConflict, dismissConflict } = useConfigConflict();

  // Publish state
  const [publishState, setPublishState] = useState<PublishState>("idle");
  const [publishResult, setPublishResult] = useState<PublishResult | null>(
    null,
  );

  const handlePublish = useCallback(async () => {
    setPublishState("publishing");
    setPublishResult(null);

    try {
      const res = await fetch("/api/git/publish", { method: "POST" });
      const data = (await res.json()) as PublishResult;

      if (res.status === 409) {
        setPublishState("error");
        setPublishResult(data);
        return;
      }

      if (!res.ok) {
        setPublishState("error");
        setPublishResult(data);
        return;
      }

      setPublishState("success");
      setPublishResult(data);

      // Auto-clear success after 3s
      setTimeout(() => {
        setPublishState("idle");
        setPublishResult(null);
      }, 3000);
    } catch (err) {
      setPublishState("error");
      setPublishResult({
        error:
          err instanceof Error ? err.message : "Publish failed unexpectedly",
      });
    }
  }, []);

  return (
    <PageContainer
      title="Settings"
      subtitle="Project configuration, identity, and version control"
      actions={
        <Button
          size="sm"
          onClick={handlePublish}
          disabled={publishState === "publishing"}
          className="gap-1.5"
        >
          {publishState === "publishing" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Upload className="size-3.5" />
          )}
          {publishState === "publishing" ? "Publishing..." : "Publish Changes"}
        </Button>
      }
    >
      {/* Publish result feedback */}
      {publishState === "success" && publishResult && (
        <div className="mb-4 rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
          Published {publishResult.file_count} file
          {publishResult.file_count !== 1 ? "s" : ""} (
          <span className="font-mono">{publishResult.commit_sha}</span>)
        </div>
      )}

      {publishState === "error" && publishResult && (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 shrink-0" />
            <span>{publishResult.error ?? "Publish failed"}</span>
          </div>
          {publishResult.files && publishResult.files.length > 0 && (
            <ul className="mt-1 ml-6 list-inside list-disc text-xs">
              {publishResult.files.slice(0, 5).map((f) => (
                <li key={f} className="font-mono">
                  {f}
                </li>
              ))}
              {publishResult.files.length > 5 && (
                <li className="text-muted-foreground">
                  +{publishResult.files.length - 5} more
                </li>
              )}
            </ul>
          )}
        </div>
      )}

      {/* SSE conflict warning */}
      {hasConflict && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="size-4 shrink-0" />
          <span>
            Config changed externally. Discard your changes or force save.
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-6 px-2 text-xs"
            onClick={dismissConflict}
          >
            Dismiss
          </Button>
        </div>
      )}

      <div className="space-y-4">
        {/* Section 1: Raw Config Editor */}
        <SettingsSection title="Raw Config Editor">
          <RawConfigEditor />
        </SettingsSection>

        {/* Section 2: Project Identity */}
        <SettingsSection title="Project Identity">
          <ProjectIdentity />
        </SettingsSection>

        {/* Section 3: Vault Configuration (collapsed by default) */}
        <SettingsSection
          title="Vault Configuration"
          subtitle="(Advanced)"
          defaultOpen={false}
        >
          <VaultConfig />
        </SettingsSection>

        {/* Section 4: Config History */}
        <SettingsSection title="Config History">
          <ConfigHistory />
        </SettingsSection>
      </div>
    </PageContainer>
  );
}
