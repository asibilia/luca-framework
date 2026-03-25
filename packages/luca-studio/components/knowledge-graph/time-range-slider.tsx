"use client";

import { useCallback, useRef, useState } from "react";

// -- Types -------------------------------------------------------------------

export interface TimeRangeSliderProps {
  /** Overall min/max timestamps (epoch seconds). */
  timeExtent: [number, number];
  /** Current selected range (null = full range). */
  timeRange: [number, number] | null;
  /** Array of bucket counts for histogram display. */
  histogram: number[];
  /** Callback when range changes. */
  onRangeChange: (range: [number, number] | null) => void;
  /** Reset to full range. */
  onReset: () => void;
}

// -- Helpers -----------------------------------------------------------------

/**
 * Format a Unix epoch (seconds) to a compact month/day string.
 *
 * @param epoch - Unix timestamp in seconds
 * @returns Compact date string like "Mar 9"
 */
function formatCompactDate(epoch: number): string {
  const date = new Date(epoch * 1000);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** Throttle interval for range change callbacks (ms). */
const THROTTLE_MS = 100;

// -- Component ---------------------------------------------------------------

/**
 * Dual-handle date range slider with histogram overlay.
 *
 * Positioned at bottom of graph area. Two native range inputs are overlaid
 * on each other to create a dual-handle slider. Behind the slider, a CSS
 * histogram shows node creation density across the time range.
 *
 * Double-click on the track resets to full range.
 */
export function TimeRangeSlider({
  timeExtent,
  timeRange,
  histogram,
  onRangeChange,
  onReset,
}: TimeRangeSliderProps) {
  const [min, max] = timeExtent;
  const currentStart = timeRange ? timeRange[0] : min;
  const currentEnd = timeRange ? timeRange[1] : max;

  // Throttle ref to limit callback frequency during drag
  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRange = useRef<[number, number] | null>(null);

  // Track whether user is actively dragging (for visual feedback)
  const [isDragging, setIsDragging] = useState(false);

  const flushRange = useCallback(() => {
    if (pendingRange.current) {
      onRangeChange(pendingRange.current);
      pendingRange.current = null;
    }
  }, [onRangeChange]);

  const throttledRangeChange = useCallback(
    (range: [number, number]) => {
      pendingRange.current = range;
      if (!throttleRef.current) {
        throttleRef.current = setTimeout(() => {
          throttleRef.current = null;
          flushRange();
        }, THROTTLE_MS);
      }
    },
    [flushRange],
  );

  const handleStartChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newStart = Number(e.target.value);
      // Prevent crossing: start cannot exceed end
      const clampedStart = Math.min(newStart, currentEnd);
      throttledRangeChange([clampedStart, currentEnd]);
    },
    [currentEnd, throttledRangeChange],
  );

  const handleEndChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newEnd = Number(e.target.value);
      // Prevent crossing: end cannot be less than start
      const clampedEnd = Math.max(newEnd, currentStart);
      throttledRangeChange([currentStart, clampedEnd]);
    },
    [currentStart, throttledRangeChange],
  );

  const handlePointerDown = useCallback(() => setIsDragging(true), []);
  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
    // Flush any pending throttled value
    if (throttleRef.current) {
      clearTimeout(throttleRef.current);
      throttleRef.current = null;
    }
    flushRange();
  }, [flushRange]);

  const handleDoubleClick = useCallback(() => {
    onReset();
  }, [onReset]);

  // Compute histogram bar heights
  const maxBucket = Math.max(...histogram, 1);
  const isFiltered = timeRange !== null;

  // Compute fill percentages for the highlighted track region
  const range = max - min;
  const startPct = range > 0 ? ((currentStart - min) / range) * 100 : 0;
  const endPct = range > 0 ? ((currentEnd - min) / range) * 100 : 100;

  return (
    <div className="absolute inset-x-0 bottom-0 z-10 px-4 pb-3 pt-2">
      <div className="rounded-lg border border-border/30 bg-card/80 px-4 pb-3 pt-2 backdrop-blur-md">
        {/* Histogram bars */}
        <div
          className="mb-1 flex items-end gap-px"
          style={{ height: 32 }}
          onDoubleClick={handleDoubleClick}
        >
          {histogram.map((count, i) => {
            const heightPct = maxBucket > 0 ? (count / maxBucket) * 100 : 0;
            const bucketPct = (i / histogram.length) * 100;
            const inRange = bucketPct >= startPct && bucketPct <= endPct;

            return (
              <div
                key={i}
                className="flex-1 rounded-t-sm transition-opacity duration-150"
                style={{
                  height: `${Math.max(heightPct, 2)}%`,
                  backgroundColor: inRange
                    ? "rgba(255,255,255,0.25)"
                    : "rgba(255,255,255,0.08)",
                }}
              />
            );
          })}
        </div>

        {/* Dual range sliders */}
        <div className="relative h-5" onDoubleClick={handleDoubleClick}>
          {/* Track background */}
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/10" />

          {/* Active range highlight */}
          <div
            className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/30 transition-all duration-75"
            style={{
              left: `${startPct}%`,
              width: `${endPct - startPct}%`,
            }}
          />

          {/* Start handle */}
          <input
            type="range"
            min={min}
            max={max}
            step={1}
            value={currentStart}
            onChange={handleStartChange}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            className="time-range-thumb pointer-events-none absolute inset-0 m-0 w-full appearance-none bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:cursor-grab [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-card [&::-moz-range-track]:bg-transparent [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-card"
            aria-label="Time range start"
          />

          {/* End handle */}
          <input
            type="range"
            min={min}
            max={max}
            step={1}
            value={currentEnd}
            onChange={handleEndChange}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            className="time-range-thumb pointer-events-none absolute inset-0 m-0 w-full appearance-none bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:cursor-grab [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-card [&::-moz-range-track]:bg-transparent [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-card"
            aria-label="Time range end"
          />
        </div>

        {/* Date labels + reset */}
        <div className="mt-1 flex items-center justify-between">
          <span className="font-mono text-[10px] text-muted-foreground/60">
            {formatCompactDate(currentStart)}
          </span>

          <div className="flex items-center gap-2">
            {isDragging && (
              <span className="font-mono text-[10px] text-muted-foreground/40">
                {formatCompactDate(currentStart)} --{" "}
                {formatCompactDate(currentEnd)}
              </span>
            )}
            {isFiltered && (
              <button
                type="button"
                onClick={onReset}
                className="font-mono text-[10px] text-muted-foreground/60 transition-colors hover:text-foreground"
              >
                Reset
              </button>
            )}
          </div>

          <span className="font-mono text-[10px] text-muted-foreground/60">
            {formatCompactDate(currentEnd)}
          </span>
        </div>
      </div>
    </div>
  );
}
