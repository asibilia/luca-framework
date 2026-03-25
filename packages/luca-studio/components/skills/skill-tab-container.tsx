"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAtomValue } from "jotai";
import { AlertTriangle, Loader2 } from "lucide-react";

import { SkillConfigForm } from "~/components/skills/skill-config-form";
import { DirtyIndicator } from "~/components/feedback/dirty-indicator";
import { ShikiCodeBlock } from "~/components/shared/shiki-code-block";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { dirtySetAtom } from "~/stores/dirty-tracking";

import type { EntityDetail } from "~/lib/entity-route-helpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SkillTabContainerProps = {
  /** Kebab-case skill name. */
  name: string;
  /** Full skill detail from the API. */
  detail: EntityDetail;
};

// ---------------------------------------------------------------------------
// Tab identifiers
// ---------------------------------------------------------------------------

const TAB_IDS = {
  configure: "configure",
  source: "source",
  compiled: "compiled",
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Three-tab editor container for skill configuration.
 *
 * Tabs:
 * - **Configure**: Structured form for skill config fields.
 * - **Source**: Shiki-highlighted TypeScript source of the raw config.
 * - **Compiled**: Shiki-highlighted markdown of the compiled output.
 *
 * Shows a `DirtyIndicator` on the Configure tab header when the skill
 * draft has unsaved changes.
 *
 * @param name - Skill name for dirty tracking key lookup.
 * @param detail - Full entity detail from the API.
 */
export function SkillTabContainer({ name, detail }: SkillTabContainerProps) {
  const [activeTab, setActiveTab] = useState<string>(TAB_IDS.configure);
  const dirtySet = useAtomValue(dirtySetAtom);
  const isDirty = dirtySet.has(`skill:${name}`);

  // Reconstruct approximate source for the Source tab
  const sourceContent = useMemo(() => {
    return `${detail.metadata.prefix}{${detail.rawConfigText}}${detail.metadata.suffix}`;
  }, [detail]);

  // Compiled output: fetched from POST /api/compile (sidecar proxy)
  const [compiledContent, setCompiledContent] = useState<string | null>(null);
  const [compiledLoading, setCompiledLoading] = useState(false);
  const [compiledError, setCompiledError] = useState<string | null>(null);
  const compiledFetchedRef = useRef(false);

  // Local fallback placeholder (shown when sidecar is offline)
  const compiledFallback = useMemo(() => {
    return [
      `# Skill: ${name}`,
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
  }, [name, detail]);

  const fetchCompiled = useCallback(async () => {
    setCompiledLoading(true);
    setCompiledError(null);
    try {
      const res = await fetch("/api/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: "skills", name }),
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

      const body = (await res.json()) as { output?: string; markdown?: string };
      setCompiledContent(body.output ?? body.markdown ?? "");
    } catch {
      setCompiledError("sidecar-offline");
      setCompiledContent(null);
    } finally {
      setCompiledLoading(false);
    }
  }, [name]);

  // Fetch compiled output when the Compiled tab is first selected
  useEffect(() => {
    if (activeTab === TAB_IDS.compiled && !compiledFetchedRef.current) {
      compiledFetchedRef.current = true;
      void fetchCompiled();
    }
  }, [activeTab, fetchCompiled]);

  return (
    <Tabs
      value={activeTab}
      onValueChange={setActiveTab}
      className="flex h-full flex-col overflow-hidden"
    >
      <div className="shrink-0 border-b px-4">
        <TabsList variant="line" className="h-9">
          <TabsTrigger value={TAB_IDS.configure} className="gap-1.5">
            Configure
            <DirtyIndicator isDirty={isDirty} size="sm" />
          </TabsTrigger>
          <TabsTrigger value={TAB_IDS.source}>Source</TabsTrigger>
          <TabsTrigger value={TAB_IDS.compiled}>Compiled</TabsTrigger>
        </TabsList>
      </div>

      {/* Configure tab */}
      <TabsContent
        value={TAB_IDS.configure}
        className="flex-1 overflow-y-auto p-4"
      >
        <SkillConfigForm name={name} detail={detail} />
      </TabsContent>

      {/* Source tab */}
      <TabsContent
        value={TAB_IDS.source}
        className="flex-1 overflow-y-auto p-4"
      >
        <ShikiCodeBlock code={sourceContent} language="typescript" />
      </TabsContent>

      {/* Compiled tab */}
      <TabsContent
        value={TAB_IDS.compiled}
        className="flex-1 overflow-y-auto p-4"
      >
        {compiledLoading && (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span>Compiling skill output...</span>
          </div>
        )}
        {!compiledLoading && compiledError === "sidecar-offline" && (
          <>
            <div className="mb-3 flex items-center gap-2 rounded-md border border-border/50 bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              <AlertTriangle className="size-3.5 shrink-0 text-amber-500" />
              <span>
                Compilation sidecar is offline. Showing local placeholder. Start
                the sidecar with{" "}
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
    </Tabs>
  );
}
