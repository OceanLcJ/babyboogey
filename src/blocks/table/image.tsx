export function Image({
  value,
  metadata,
  className,
}: {
  value: string;
  metadata?: Record<string, any>;
  className?: string;
}) {
  return (
    <img
      src={value}
      alt={value}
      className={`w-10 h-10 rounded-full ${className}`}
    />
  );
}
