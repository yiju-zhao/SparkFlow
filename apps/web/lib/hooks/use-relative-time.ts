"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";

/**
 * Hook to safely format relative time on client only (avoids hydration mismatch).
 * Returns empty string during SSR, then formats on client.
 * Auto-updates every minute.
 */
export function useRelativeTime(date: Date): string {
  const [timeString, setTimeString] = useState<string>('');

  useEffect(() => {
    const formatTime = (d: Date) =>
      formatDistanceToNow(d, { addSuffix: true }).replace(/^about /, '');

    // Set initial value on client
    setTimeString(formatTime(date));

    // Update every minute
    const interval = setInterval(() => {
      setTimeString(formatTime(date));
    }, 60000);

    return () => clearInterval(interval);
  }, [date]);

  return timeString;
}
