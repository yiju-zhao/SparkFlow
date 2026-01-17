"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";

/**
 * Format date as relative time string.
 */
function formatRelative(date: Date): string {
  return formatDistanceToNow(date, { addSuffix: true }).replace(/^about /, '');
}

/**
 * Hook to format relative time. Auto-updates every minute.
 * Uses suppressHydrationWarning on the consuming component to handle
 * minor server/client time differences.
 */
export function useRelativeTime(date: Date): string {
  const [timeString, setTimeString] = useState<string>(() => formatRelative(date));

  useEffect(() => {
    // Update immediately in case of minor drift, then every minute
    setTimeString(formatRelative(date));

    const interval = setInterval(() => {
      setTimeString(formatRelative(date));
    }, 60000);

    return () => clearInterval(interval);
  }, [date]);

  return timeString;
}
