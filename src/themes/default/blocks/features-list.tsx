'use client';

import { Link } from '@/core/i18n/navigation';
import { LazyImage, SmartIcon } from '@/shared/blocks/common';
import { Button } from '@/shared/components/ui/button';
import { ScrollAnimation } from '@/shared/components/ui/scroll-animation';
import { cn } from '@/shared/lib/utils';
import { Section } from '@/shared/types/blocks/landing';

export function FeaturesList({
  section,
  className,
}: {
  section: Section;
  className?: string;
}) {
  const hasImage = !!section.image?.src;
  const imagePosition = (section as UnsafeAny).image_position || 'left';

  return (
    <section
      className={cn(
        'overflow-x-hidden py-16 md:py-24',
        section.className,
        className
      )}
    >
      <div className="container overflow-x-hidden">
        <ScrollAnimation>
          <div className="mx-auto max-w-2xl text-center pb-12">
            {section.label && (
              <span className="text-primary">{section.label}</span>
            )}
            <h2 className="text-foreground mt-4 text-4xl font-semibold text-balance">
              {section.title}
            </h2>
            <p className="text-md text-muted-foreground my-6 text-balance">
              {section.description}
            </p>

            {section.buttons && section.buttons.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-2">
                {section.buttons?.map((button, idx) => (
                  <Button
                    asChild
                    key={idx}
                    variant={button.variant || 'default'}
                    size={button.size || 'default'}
                  >
                    <Link
                      href={button.url ?? ''}
                      target={button.target ?? '_self'}
                      className={cn(
                        'focus-visible:ring-ring inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-1 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
                        'h-9 px-4 py-2',
                        'bg-background ring-foreground/10 hover:bg-muted/50 dark:ring-foreground/15 dark:hover:bg-muted/50 border border-transparent shadow-sm ring-1 shadow-black/15 duration-200'
                      )}
                    >
                      {button.icon && (
                        <SmartIcon name={button.icon as string} size={24} />
                      )}
                      {button.title}
                    </Link>
                  </Button>
                ))}
              </div>
            )}
          </div>
        </ScrollAnimation>

        {hasImage ? (
          <ScrollAnimation delay={0.1}>
            <div
              className={cn(
                'grid min-w-0 gap-8 border-t pt-12 md:grid-cols-2 md:gap-12 lg:gap-16 items-center',
              )}
            >
              {/* Image */}
              <div
                className={cn(
                  'overflow-hidden rounded-2xl',
                  imagePosition === 'right' ? 'md:order-2' : 'md:order-1'
                )}
              >
                <LazyImage
                  src={section.image!.src}
                  alt={section.image!.alt || section.title || ''}
                  className="w-full h-auto rounded-2xl"
                />
              </div>

              {/* Feature items */}
              <div
                className={cn(
                  'space-y-6',
                  imagePosition === 'right' ? 'md:order-1' : 'md:order-2'
                )}
              >
                {section.items?.map((item, idx) => (
                  <div className="min-w-0 space-y-2 break-words" key={idx}>
                    <div className="flex min-w-0 items-center gap-2">
                      {item.icon && (
                        <SmartIcon name={item.icon as string} size={18} />
                      )}
                      <h3 className="min-w-0 text-base font-semibold break-words">
                        {item.title}
                      </h3>
                    </div>
                    <p className="text-muted-foreground min-w-0 text-sm break-words">
                      {item.description ?? ''}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </ScrollAnimation>
        ) : (
          <ScrollAnimation delay={0.1}>
            <div
              className={cn(
                'relative grid min-w-0 grid-cols-1 gap-x-3 gap-y-6 border-t pt-12 break-words sm:grid-cols-2',
                section.items && section.items.length <= 3
                  ? 'lg:grid-cols-3'
                  : 'lg:grid-cols-4'
              )}
            >
              {section.items?.map((item, idx) => (
                <div className="min-w-0 space-y-3 break-words" key={idx}>
                  <div className="flex min-w-0 items-center gap-2">
                    {item.icon && (
                      <SmartIcon name={item.icon as string} size={16} />
                    )}
                    <h3 className="min-w-0 text-sm font-medium break-words">
                      {item.title}
                    </h3>
                  </div>
                  <p className="text-muted-foreground min-w-0 text-sm break-words">
                    {item.description ?? ''}
                  </p>
                </div>
              ))}
            </div>
          </ScrollAnimation>
        )}
      </div>
    </section>
  );
}
