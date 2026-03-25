"use client";

import { useMemo, useState } from "react";

import { useAtomValue } from "jotai";
import { Info } from "lucide-react";

import { AgentConfigForm } from "~/components/agents/agent-config-form";
import { CodeMirrorWrapper } from "~/components/editor/code-mirror-wrapper";
import { DirtyIndicator } from "~/components/feedback/dirty-indicator";
import { ShikiCodeBlock } from "~/components/shared/shiki-code-block";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { cn } from "~/lib/utils";
import { dirtySetAtom } from "~/stores/dirty-tracking";

import type { EntityDetail } from "~/lib/entity-route-helpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AgentTabContainerProps = {
  /** Kebab-case agent name. */
  name: string;
  /** Full agent detail from the API. */
  detail: EntityDetail;
};

// ---------------------------------------------------------------------------
// Tab identifiers
// ---------------------------------------------------------------------------

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
 * Four-tab editor container for agent configuration.
 *
 * Tabs:
 * - **Configure**: Structured form for agent config fields.
 * - **Prompt**: Read-only CodeMirror showing the agent's prompt content.
 * - **Source**: Shiki-highlighted TypeScript source of the raw config.
 * - **Compiled**: Shiki-highlighted markdown of the compiled output.
 *
 * Shows a `DirtyIndicator` on the Configure tab header when the agent
 * draft has unsaved changes.
 *
 * @param name - Agent name for dirty tracking key lookup.
 * @param detail - Full entity detail from the API.
 */
export function AgentTabContainer({ name, detail }: AgentTabContainerProps) {
  const [activeTab, setActiveTab] = useState<string>(TAB_IDS.configure);
  const dirtySet = useAtomValue(dirtySetAtom);
  const isDirty = dirtySet.has(`agent:${name}`);

  // Extract prompt-like content from rawConfigText
  // The rawConfigText is the TS config object; extract the prompt or system fields if present
  const promptContent = useMemo(() => {
    // Try to find prompt, system_prompt, or systemPrompt in the raw config text
    const promptMatch = detail.rawConfigText.match(
      /(?:prompt|system_prompt|systemPrompt)\s*:\s*[`"']([^]*?)[`"']/,
    );
    if (promptMatch) return promptMatch[1];

    // Try template literal
    const templateMatch = detail.rawConfigText.match(
      /(?:prompt|system_prompt|systemPrompt)\s*:\s*`([^]*?)`/,
    );
    if (templateMatch) return templateMatch[1];

    return "No prompt content found in this agent's configuration.";
  }, [detail.rawConfigText]);

  // Reconstruct approximate source for the Source tab
  const sourceContent = useMemo(() => {
    return `${detail.metadata.prefix}{${detail.rawConfigText}}${detail.metadata.suffix}`;
  }, [detail]);

  // Compiled output: for v1, show the raw config as markdown-formatted output
  const compiledContent = useMemo(() => {
    return [
      `# Agent: ${name}`,
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
          <TabsTrigger value={TAB_IDS.prompt}>Prompt</TabsTrigger>
          <TabsTrigger value={TAB_IDS.source}>Source</TabsTrigger>
          <TabsTrigger value={TAB_IDS.compiled}>Compiled</TabsTrigger>
        </TabsList>
      </div>

      {/* Configure tab */}
      <TabsContent
        value={TAB_IDS.configure}
        className="flex-1 overflow-y-auto p-4"
      >
        <AgentConfigForm name={name} detail={detail} />
      </TabsContent>

      {/* Prompt tab (read-only) */}
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
            value={promptContent}
            readOnly
            placeholder="No prompt content"
            className="h-full"
          />
        </div>
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
        <ShikiCodeBlock code={compiledContent} language="markdown" />
      </TabsContent>
    </Tabs>
  );
}
