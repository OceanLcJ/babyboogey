import moment from "moment";

export function Time({
  value,
  metadata,
  className,
}: {
  value: string | Date;
  metadata?: Record<string, any>;
  className?: string;
}) {
  return (
    <div className={className}>
      {metadata?.format
        ? moment(value).format(metadata?.format)
        : moment(value).fromNow()}
    </div>
  );
}
