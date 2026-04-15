"use client";

import { useAIContext, AIContextProvider } from "./ai-context";
import { ExploreShell, type ExploreShellProps } from "./explore-shell";

interface ExploreShellWrapperProps extends ExploreShellProps {
  children: React.ReactNode;
}

function ExploreShellInner({ children, ...props }: ExploreShellWrapperProps) {
  const { context } = useAIContext();

  return (
    <ExploreShell aiContext={context ?? undefined} {...props}>
      {children}
    </ExploreShell>
  );
}

export function ExploreShellWrapper({ children, ...props }: ExploreShellWrapperProps) {
  return (
    <AIContextProvider>
      <ExploreShellInner {...props}>{children}</ExploreShellInner>
    </AIContextProvider>
  );
}
