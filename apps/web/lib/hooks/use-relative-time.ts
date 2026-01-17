"use client";

import { useEffect, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";

/**
 * Format date as absolute string (SSR-safe, deterministic).
 */
function formatAbsolute(date: Date): string {
  return format(date, "MMM d, yyyy");
}

/**
 * Format date as relative string (client-only, depends on "now").
 */
function formatRelative(date: Date): string {
  return formatDistanceToNow(date, { addSuffix: true }).replace(/^about /, '');
}

/**
 * Hook to safely format time with hydration support.
 * - SSR/initial render: shows absolute date (e.g., "Jan 17, 2025")
 * - After hydration: switches to relative time (e.g., "2 hours ago")
 * - Auto-updates every minute
 */
export function useRelativeTime(date: Date): string {
  // Start with absolute date (SSR-safe, matches server & client initial render)
  const [timeString, setTimeString] = useState<string>(() => formatAbsolute(date));

  useEffect(() => {
    // After mount, switch to relative time
    setTimeString(formatRelative(date));

    // Update every minute
    const interval = setInterval(() => {
      setTimeString(formatRelative(date));
    }, 60000);

    return () => clearInterval(interval);
  }, [date]);

  return timeString;
}
