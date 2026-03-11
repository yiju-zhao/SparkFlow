// apps/web/components/explore/shared/empty-state.tsx

"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Inbox, Search, FolderOpen } from "lucide-react";

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: "inbox" | "search" | "folder";
  action?: {
    label: string;
    onClick: () => void;
  };
}

const icons = {
  inbox: Inbox,
  search: Search,
  folder: FolderOpen,
};

export function EmptyState({
  title,
  description,
  icon = "inbox",
  action,
}: EmptyStateProps) {
  const t = useTranslations("explore.empty");
  const Icon = icons[icon];

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 border border-dashed rounded-lg">
      <Icon className="h-10 w-10 text-muted-foreground mb-4" />
      <p className="font-medium">{title || t("title")}</p>
      <p className="text-muted-foreground text-sm mt-1 text-center max-w-sm">
        {description || t("description")}
      </p>
      {action && (
        <Button
          onClick={action.onClick}
          variant="outline"
          size="sm"
          className="mt-4"
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}
