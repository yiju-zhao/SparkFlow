"use client";

import { CopilotKit } from "@copilotkit/react-core";

const agentUrl = process.env.NEXT_PUBLIC_LANGGRAPH_API_URL;

export function CopilotKitProvider({ children }: { children: React.ReactNode }) {
  return (
    <CopilotKit agent={agentUrl}>
      {children}
    </CopilotKit>
  );
}
