import { Badge } from "@/components/ui/badge";

export function Label({
  value,
  metadata,
  className,
}: {
  value: string;
  metadata?: Record<string, any>;
  className?: string;
}) {
  return (
    <Badge variant={metadata?.variant ?? "secondary"} className={className}>
      {value.toString()}
    </Badge>
  );
}
