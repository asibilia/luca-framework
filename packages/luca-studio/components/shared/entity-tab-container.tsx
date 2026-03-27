"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAtomValue, useSetAtom } from "jotai";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  Pencil,
  X,
  XCircle,
} from "lucide-react";

import { CodeMirrorWrapper } from "~/components/editor/code-mirror-wrapper";
import { DirtyIndicator } from "~/components/feedback/dirty-indicator";
import { ShikiCodeBlock } from "~/components/shared/shiki-code-block";
import { Button } from "~/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { cn } from "~/lib/utils";
import { compileStatusAtom } from "~/stores/config-atoms";
import { dirtySetAtom } from "~/stores/dirty-tracking";

import type { ComponentType } from "react";
import type { EntityDetail } from "~/lib/entity-route-helpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Props for the entity-specific config form component that gets injected
 * into the Configure tab.
 */
export type EntityConfigFormProps = {
  /** Kebab-case entity name. */
  name: string;
  /** Full entity detail from the API. */
  detail: EntityDetail;
  /** Whether the form is in edit mode. */
  isEditing?: boolean;
};

/**
 * Props for the shared EntityTabContainer component.
 */
export type EntityTabContainerProps = {
  /** Kebab-case entity name. */
  name: string;
  /** Full entity detail from the API. */
  detail: EntityDetail;
  /** Entity type — determines dirty key prefix. */
  entityType: "agent" | "skill" | "rule";
  /** Whether the entity is in edit mode. */
  isEditing?: boolean;
  /** Callback to enter edit mode. */
  onEnterEdit?: () => void;
  /** Callback to exit edit mode. */
  onExitEdit?: () => void;
  /** Entity-specific config form component rendered inside the Configure tab. */
  configForm: ComponentType<EntityConfigFormProps>;
  /** Whether to render a Prompt tab with CodeMirrorWrapper (agent-only). */
  hasPromptTab?: boolean;
  /** Whether to render a Compiled tab with fetch logic (agent + skill). */
  hasCompiledTab?: boolean;
  /** Prompt text content when hasPromptTab is true. */
  promptContent?: string;
};

// ---------------------------------------------------------------------------
// Tab identifiers
// ---------------------------------------------------------------------------

/** Maps singular entity type to its plural domain name. */
const ENTITY_DOMAIN: Record<"agent" | "skill" | "rule", string> = {
  agent: "agents",
  skill: "skills",
  rule: "rules",
};

const TAB_IDS = {
  configure: "configure",
  prompt: "prompt",
  source: "source",
  compiled: "compiled",
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Shared tab container for entity configuration pages (agents, skills, rules).
 *
 * Provides a consistent tab layout with:
 * - **Configure** tab — renders the injected `configForm` component
 * - **Prompt** tab (optional) — read-only CodeMirror showing prompt content
 * - **Source** tab — Shiki-highlighted TypeScript source reconstruction
 * - **Compiled** tab (optional) — fetched + rendered compiled markdown output
 *
 * Handles tab state, dirty tracking, mode header (editing indicator + buttons),
 * source content reconstruction, and compiled output fetch with loading/error states.
 *
 * @param name - Entity name for dirty tracking key lookup.
 * @param detail - Full entity detail from the API.
 * @param entityType - One of "agent", "skill", "rule" — used for dirty key prefix.
 * @param configForm - React component to render inside the Configure tab.
 * @param hasPromptTab - Whether to show the Prompt tab (default false).
 * @param hasCompiledTab - Whether to show the Compiled tab (default false).
 * @param promptContent - Text content for the Prompt tab.
 *
 * @example
 * ```tsx
 * <EntityTabContainer
 *   name="lu-router"
 *   detail={agentDetail}
 *   entityType="agent"
 *   configForm={AgentConfigForm}
 *   hasPromptTab
 *   hasCompiledTab
 *   promptContent={extractedPrompt}
 * />
 * ```
 */
export function EntityTabContainer({
  name,
  detail,
  entityType,
  isEditing,
  onEnterEdit,
  onExitEdit,
  configForm: ConfigForm,
  hasPromptTab,
  hasCompiledTab,
  promptContent,
}: EntityTabContainerProps) {
  const [activeTab, setActiveTab] = useState<string>(TAB_IDS.configure);
  const dirtySet = useAtomValue(dirtySetAtom);
  const isDirty = dirtySet.has(`${entityType}:${name}`);

  // Reconstruct approximate source for the Source tab
  const sourceContent = useMemo(() => {
    return `${detail.metadata.prefix}{${detail.rawConfigText}}${detail.metadata.suffix}`;
  }, [detail]);

  // ---------------------------------------------------------------------------
  // Compiled output state (only used when hasCompiledTab is true)
  // ---------------------------------------------------------------------------

  const [compiledContent, setCompiledContent] = useState<string | null>(null);
  const [compiledLoading, setCompiledLoading] = useState(false);
  const [compiledError, setCompiledError] = useState<string | null>(null);
  const compiledFetchedRef = useRef(false);

  /** Local fallback placeholder shown when sidecar is offline. */
  const compiledFallback = useMemo(() => {
    if (!hasCompiledTab) return "";
    const label = entityType.charAt(0).toUpperCase() + entityType.slice(1);
    return [
      `# ${label}: ${name}`,
      "",
      `**Domain:** ${detail.domain}`,
      `**Variable:** ${detail.metadata.varName}`,
      `**Config Type:** ${detail.metadata.configType}`,
      `**Factory:** ${detail.metadata.factoryFn}`,
      "",
      "## Configuration",
      "",
      "```typescript",
      detail.rawConfigText,
      "```",
    ].join("\n");
  }, [name, detail, entityType, hasCompiledTab]);

  const fetchCompiled = useCallback(async () => {
    setCompiledLoading(true);
    setCompiledError(null);
    try {
      const domainPlural = ENTITY_DOMAIN[entityType];
      const res = await fetch("/api/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domainPlural, name }),
      });

      if (res.status === 503) {
        setCompiledError("sidecar-offline");
        setCompiledContent(null);
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setCompiledError(
          (body as { error?: string }).error ??
            `Compile failed (${res.status})`,
        );
        setCompiledContent(null);
        return;
      }

      const body = (await res.json()) as {
        output?: string;
        markdown?: string;
      };
      setCompiledContent(body.output ?? body.markdown ?? "");
    } catch {
      setCompiledError("sidecar-offline");
      setCompiledContent(null);
    } finally {
      setCompiledLoading(false);
    }
  }, [entityType, name]);

  // Fetch compiled output when the Compiled tab is first selected
  useEffect(() => {
    if (
      hasCompiledTab &&
      activeTab === TAB_IDS.compiled &&
      !compiledFetchedRef.current
    ) {
      compiledFetchedRef.current = true;
      void fetchCompiled();
    }
  }, [activeTab, fetchCompiled, hasCompiledTab]);

  // ---------------------------------------------------------------------------
  // SSE compile status (supplementary to HTTP response feedback)
  // ---------------------------------------------------------------------------

  const compileStatus = useAtomValue(compileStatusAtom);
  const setCompileStatus = useSetAtom(compileStatusAtom);

  /**
   * Whether the SSE compile status applies to THIS entity.
   * Only show the SSE indicator when the domain + name match.
   */
  const domainPlural = ENTITY_DOMAIN[entityType];

  const sseMatchesEntity =
    compileStatus.state !== "idle" &&
    compileStatus.domain === domainPlural &&
    compileStatus.name === name;

  // Auto-reset compileStatusAtom to idle 3 seconds after success
  useEffect(() => {
    if (!sseMatchesEntity || compileStatus.state !== "success") return;

    const timer = setTimeout(() => {
      setCompileStatus({ state: "idle" });
    }, 3_000);

    return () => clearTimeout(timer);
  }, [sseMatchesEntity, compileStatus.state, setCompileStatus]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const entityLabel = entityType;

  return (
    <Tabs
      value={activeTab}
      onValueChange={setActiveTab}
      className={cn(
        "flex h-full flex-col overflow-hidden",
        isEditing ? "bg-card" : "bg-background",
      )}
    >
      {/* Edit mode accent bar */}
      {isEditing && <div className="h-0.5 shrink-0 bg-primary" />}

      <div className="shrink-0 border-b px-4">
        {/* Mode header */}
        <div className="flex items-center justify-between py-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            {isEditing ? (
              <>
                Editing: <span className="text-foreground">{name}</span>
                {isDirty && <span className="ml-1 text-warning">(edited)</span>}
              </>
            ) : (
              name
            )}
          </span>
          <div className="flex items-center gap-1">
            {!isEditing && onEnterEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={onEnterEdit}
                aria-label="Enter edit mode"
              >
                <Pencil className="size-3.5" />
              </Button>
            )}
            {isEditing && onExitEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={onExitEdit}
                aria-label="Exit edit mode"
              >
                <X className="size-3.5" />
              </Button>
            )}
          </div>
        </div>

        <TabsList variant="line" className="h-9">
          <TabsTrigger value={TAB_IDS.configure} className="gap-1.5">
            Configure
            <DirtyIndicator isDirty={isDirty} size="sm" />
          </TabsTrigger>
          {hasPromptTab && (
            <TabsTrigger value={TAB_IDS.prompt}>Prompt</TabsTrigger>
          )}
          <TabsTrigger value={TAB_IDS.source}>Source</TabsTrigger>
          {hasCompiledTab && (
            <TabsTrigger value={TAB_IDS.compiled} className="gap-1.5">
              Compiled
              {sseMatchesEntity && compileStatus.state === "compiling" && (
                <Loader2 className="size-3 animate-spin text-primary" />
              )}
              {sseMatchesEntity && compileStatus.state === "success" && (
                <CheckCircle2 className="size-3 text-green-500" />
              )}
              {sseMatchesEntity && compileStatus.state === "error" && (
                <XCircle className="size-3 text-destructive" />
              )}
            </TabsTrigger>
          )}
        </TabsList>
      </div>

      {/* Configure tab */}
      <TabsContent
        value={TAB_IDS.configure}
        className="flex-1 overflow-y-auto p-4"
      >
        <ConfigForm name={name} detail={detail} isEditing={isEditing} />
      </TabsContent>

      {/* Prompt tab (optional, agent-only) */}
      {hasPromptTab && (
        <TabsContent
          value={TAB_IDS.prompt}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div
            className={cn(
              "mx-4 mt-3 flex items-center gap-2 rounded-md border border-border/50 bg-muted/50 px-3 py-2 text-xs text-muted-foreground",
            )}
          >
            <Info className="size-3.5 shrink-0" />
            <span>Prompt editing coming in a future release.</span>
          </div>
          <div className="flex-1 overflow-auto p-4">
            <CodeMirrorWrapper
              value={promptContent ?? ""}
              readOnly
              placeholder="No prompt content"
              className="h-full"
            />
          </div>
        </TabsContent>
      )}

      {/* Source tab */}
      <TabsContent
        value={TAB_IDS.source}
        className="flex-1 overflow-y-auto p-4"
      >
        <ShikiCodeBlock code={sourceContent} language="typescript" />
      </TabsContent>

      {/* Compiled tab (optional, agent + skill) */}
      {hasCompiledTab && (
        <TabsContent
          value={TAB_IDS.compiled}
          className="flex-1 overflow-y-auto p-4"
        >
          {/* SSE compile status (supplementary to HTTP response) */}
          {sseMatchesEntity && compileStatus.state === "compiling" && (
            <div className="mb-3 flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary">
              <Loader2 className="size-3.5 animate-spin shrink-0" />
              <span>
                Compiling {compileStatus.domain}/{compileStatus.name} via
                sidecar...
              </span>
            </div>
          )}
          {sseMatchesEntity && compileStatus.state === "success" && (
            <div className="mb-3 flex items-center gap-2 rounded-md border border-green-500/30 bg-green-500/5 px-3 py-2 text-xs text-green-600 dark:text-green-400">
              <CheckCircle2 className="size-3.5 shrink-0" />
              <span>
                Compilation succeeded for {compileStatus.domain}/
                {compileStatus.name}.
              </span>
            </div>
          )}
          {sseMatchesEntity && compileStatus.state === "error" && (
            <div className="mb-3 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <XCircle className="size-3.5 shrink-0" />
              <span>Compilation failed: {compileStatus.error}</span>
            </div>
          )}

          {/* HTTP-based compile states (primary feedback) */}
          {compiledLoading && (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <span>Compiling {entityLabel} output...</span>
            </div>
          )}
          {!compiledLoading && compiledError === "sidecar-offline" && (
            <>
              <div className="mb-3 flex items-center gap-2 rounded-md border border-border/50 bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                <AlertTriangle className="size-3.5 shrink-0 text-warning" />
                <span>
                  Compilation sidecar is offline. Showing local placeholder.
                  Start the sidecar with{" "}
                  <code className="font-mono">bun run sidecar</code> for live
                  output.
                </span>
              </div>
              <ShikiCodeBlock code={compiledFallback} language="markdown" />
            </>
          )}
          {!compiledLoading &&
            compiledError &&
            compiledError !== "sidecar-offline" && (
              <>
                <div className="mb-3 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  <AlertTriangle className="size-3.5 shrink-0" />
                  <span>{compiledError}</span>
                </div>
                <ShikiCodeBlock code={compiledFallback} language="markdown" />
              </>
            )}
          {!compiledLoading && !compiledError && compiledContent !== null && (
            <ShikiCodeBlock code={compiledContent} language="markdown" />
          )}
        </TabsContent>
      )}
    </Tabs>
  );
}
