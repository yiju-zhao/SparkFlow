"use client";

import { Component, ReactNode, Suspense, lazy } from "react";

// Lazy-load CopilotKit SDK — it's ~8-12MB and only needed for chat features
const CopilotKit = lazy(() =>
  import("@copilotkit/react-core").then((mod) => ({ default: mod.CopilotKit })),
);

class CopilotKitErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return this.props.children;
    }
    return (
      <Suspense fallback={this.props.children}>
        <CopilotKit runtimeUrl="/api/copilotkit">{this.props.children}</CopilotKit>
      </Suspense>
    );
  }
}

export function CopilotKitProvider({ children }: { children: ReactNode }) {
  return <CopilotKitErrorBoundary>{children}</CopilotKitErrorBoundary>;
}
