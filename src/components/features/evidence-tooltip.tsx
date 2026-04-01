"use client";

import { CheckCircle2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type EvidenceTooltipProps = {
  label: string;
  content: string;
  variant?: "inline-link" | "badge";
};

export function EvidenceTooltip({ label, content, variant = "inline-link" }: EvidenceTooltipProps) {
  const triggerClassName =
    variant === "badge"
      ? "flex items-center gap-1 text-xs text-muted-foreground cursor-help hover:text-foreground transition-colors"
      : "text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors";

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          variant === "badge" ? (
            <div className={triggerClassName} />
          ) : (
            <button type="button" className={triggerClassName} />
          )
        }
      >
        {variant === "badge" && <CheckCircle2 size={12} />}
        {label}
      </TooltipTrigger>
      <TooltipContent className="max-w-md border-border bg-background p-4 shadow-md">
        <p className="text-xs leading-relaxed italic text-muted-foreground">"{content}"</p>
      </TooltipContent>
    </Tooltip>
  );
}
