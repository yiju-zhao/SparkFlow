"use client";

import { CopilotKit } from "@copilotkit/react-core";

export function CopilotKitProvider({ children }: { children: React.ReactNode }) {
  return (
    <CopilotKit runtimeUrl="/api/copilotkit" agent="hub">
      {children}
    </CopilotKit>
  );
}
