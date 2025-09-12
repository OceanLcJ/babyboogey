"use client";

import { CopyToClipboard } from "react-copy-to-clipboard";
import { ReactNode } from "react";
import { toast } from "sonner";
import { CopyIcon } from "lucide-react";

export function Copy({
  value,
  metadata,
  className,
  children,
}: {
  value: string;
  metadata?: Record<string, any>;
  className?: string;
  children: ReactNode;
}) {
  return (
    <CopyToClipboard
      text={value}
      onCopy={() => toast.success(metadata?.message ?? "Copied")}
    >
      <div className={`cursor-pointer flex items-center gap-2 ${className}`}>
        {children}
        <CopyIcon className="w-3 h-3" />
      </div>
    </CopyToClipboard>
  );
}
