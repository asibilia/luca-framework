"use client";

/** Tab identifiers for the entity deep-dive view. */
export type TabId = "timeline" | "relationships" | "engrams" | "co-occurrences";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "timeline", label: "Timeline" },
  { id: "relationships", label: "Relationships" },
  { id: "engrams", label: "Engrams" },
  { id: "co-occurrences", label: "Co-occurrences" },
];

/**
 * Tab bar for switching between entity deep-dive sections.
 *
 * @param activeTab - Currently selected tab
 * @param onTabChange - Callback when a tab is clicked
 */
export function EntityTabBar({
  activeTab,
  onTabChange,
}: {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}) {
  return (
    <div className="flex gap-1 border-b border-border">
      {TABS.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`px-4 py-2 text-sm rounded-t-md transition-colors ${
              isActive
                ? "bg-accent/10 text-accent font-medium border-b-2 border-accent"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
