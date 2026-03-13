"use client";

import { CopilotKit } from "@copilotkit/react-core";
import { Component, ReactNode } from "react";

class CopilotKitErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    // If CopilotKit fails to initialize, render children without it
    if (this.state.hasError) {
      return this.props.children;
    }
    return (
      <CopilotKit runtimeUrl="/api/copilotkit">
        {this.props.children}
      </CopilotKit>
    );
  }
}

export function CopilotKitProvider({ children }: { children: ReactNode }) {
  return (
    <CopilotKitErrorBoundary>{children}</CopilotKitErrorBoundary>
  );
}
