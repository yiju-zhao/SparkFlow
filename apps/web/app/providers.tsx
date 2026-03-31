"use client";

import { AppProviders } from "@/components/providers/app-providers";
import { CopilotKitProvider } from "@/lib/copilotkit-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AppProviders>
      <CopilotKitProvider>{children}</CopilotKitProvider>
    </AppProviders>
  );
}
