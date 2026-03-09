"use client";

import { useCallback, useState } from "react";

import type { SearchOptions } from "~/hooks/use-semantic-search";

// -- Types -------------------------------------------------------------------

export interface SearchBarProps {
  onSearch: (query: string, options: SearchOptions) => void;
  loading: boolean;
}

// -- Component ---------------------------------------------------------------

/**
 * Search bar with progressive disclosure for advanced options.
 *
 * Fires search on Enter key press or button click (not live/debounced).
 * Advanced panel reveals mode, profile, and threshold controls.
 */
export function SearchBar({ onSearch, loading }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [mode, setMode] = useState<SearchOptions["mode"]>("semantic");
  const [profile, setProfile] = useState<SearchOptions["profile"]>("default");
  const [threshold, setThreshold] = useState(0.3);

  const handleSearch = useCallback(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    onSearch(trimmed, { mode, profile, threshold });
  }, [query, mode, profile, threshold, onSearch]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        handleSearch();
      }
    },
    [handleSearch],
  );

  const isSearchDisabled = loading || query.trim().length === 0;

  return (
    <div className="space-y-3">
      {/* Search input row */}
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search your knowledge..."
          className="flex-1 rounded-md border border-border bg-card px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1"
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={isSearchDisabled}
          className="rounded-md bg-accent px-4 py-2 font-mono text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-50"
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      {/* Advanced toggle */}
      <button
        type="button"
        onClick={() => setShowAdvanced((prev) => !prev)}
        className="font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {showAdvanced ? "Hide advanced" : "Advanced"}
      </button>

      {/* Advanced options panel */}
      <div
        className={`overflow-hidden transition-all duration-200 ${showAdvanced ? "max-h-40 opacity-100" : "max-h-0 opacity-0"}`}
      >
        <div className="flex flex-wrap items-center gap-4 rounded-md border border-border bg-card p-3">
          {/* Mode selector */}
          <label className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              Mode
            </span>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as SearchOptions["mode"])}
              className="rounded-md border border-border bg-background px-2 py-1 font-mono text-xs text-foreground"
            >
              <option value="semantic">semantic</option>
              <option value="recent">recent</option>
              <option value="balanced">balanced</option>
              <option value="deep">deep</option>
            </select>
          </label>

          {/* Profile selector */}
          <label className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              Profile
            </span>
            <select
              value={profile}
              onChange={(e) =>
                setProfile(e.target.value as SearchOptions["profile"])
              }
              className="rounded-md border border-border bg-background px-2 py-1 font-mono text-xs text-foreground"
            >
              <option value="default">default</option>
              <option value="causal">causal</option>
              <option value="confirmatory">confirmatory</option>
              <option value="adversarial">adversarial</option>
              <option value="structural">structural</option>
            </select>
          </label>

          {/* Threshold slider */}
          <label className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              Threshold
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={threshold}
              onChange={(e) => setThreshold(parseFloat(e.target.value))}
              className="h-1.5 w-24 accent-accent"
            />
            <span className="font-mono text-xs text-foreground w-8">
              {threshold.toFixed(2)}
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}
