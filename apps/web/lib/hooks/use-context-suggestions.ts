"use client";

import { usePathname } from "next/navigation";
import { useMemo } from "react";

/**
 * Returns context-aware suggestions based on the current pathname.
 * Different suggestions are shown for conference detail, session detail, and default pages.
 */
export function useContextSuggestions() {
  const pathname = usePathname();

  return useMemo(() => {
    // Conference detail page: /explore/conferences/[id]
    if (pathname.match(/\/explore\/conferences\/[\w-]+$/)) {
      return [
        "What are the trending topics at this conference?",
        "Show me sessions by speaker",
        "Compare this year to previous years",
      ];
    }

    // Session detail page: /explore/sessions/[id]
    if (pathname.match(/\/explore\/sessions\/[\w-]+$/)) {
      return [
        "Find similar sessions",
        "Who else presented on this topic?",
        "Summarize the key points",
      ];
    }

    // Default hub suggestions (home, conferences list, etc.)
    return [
      "What are the trending topics?",
      "Which venues published the most?",
      "Summarize recent conferences",
    ];
  }, [pathname]);
}
