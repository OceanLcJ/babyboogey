import { ReactNode } from 'react';

import { Link } from '@/core/i18n/navigation';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import {
  Card as CardComponent,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card';
import { cn } from '@/shared/lib/utils';
import { Button as ButtonType } from '@/shared/types/blocks/common';

import { SmartIcon } from '../common/smart-icon';

export function PanelCard({
  title,
  label,
  description,
  content,
  buttons,
  children,
  className,
}: {
  title?: string;
  label?: string;
  description?: string;
  content?: string;
  buttons?: ButtonType[];
  children?: ReactNode;
  className?: string;
}) {
  return (
    <CardComponent
      className={cn(
        'border-border/60 overflow-hidden pb-0 transition-shadow duration-200 hover:shadow-md',
        className
      )}
    >
      {(title || description) && (
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {title}
            {label && (
              <Badge
                variant="outline"
                className="rounded-md px-2 py-0.5 text-xs font-normal"
              >
                {label}
              </Badge>
            )}
          </CardTitle>
          {description && (
            <CardDescription className="leading-relaxed">
              {description}
            </CardDescription>
          )}
        </CardHeader>
      )}
      {(content || children) && (
        <CardContent className="text-muted-foreground">
          {content || children}
        </CardContent>
      )}
      {buttons && buttons.length > 0 && (
        <CardFooter className="bg-muted/50 border-border/40 flex justify-start gap-3 border-t py-4">
          {buttons.map((button, idx) => (
            <Button
              key={idx}
              variant={button.variant || 'default'}
              size={button.size || 'default'}
              asChild
            >
              <Link href={button.url || ''} target={button.target || '_self'}>
                {button.icon && <SmartIcon name={button.icon as string} />}
                {button.title}
              </Link>
            </Button>
          ))}
        </CardFooter>
      )}
    </CardComponent>
  );
}
