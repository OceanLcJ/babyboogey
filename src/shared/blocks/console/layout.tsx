'use client';

import { ReactNode } from 'react';

import { Link, usePathname } from '@/core/i18n/navigation';
import { SmartIcon } from '@/shared/blocks/common/smart-icon';
import { Button } from '@/shared/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/shared/components/ui/sheet';
import { cn } from '@/shared/lib/utils';
import { Nav } from '@/shared/types/blocks/common';

function NavItem({
  item,
  isActive,
}: {
  item: Nav['items'][number];
  isActive: boolean;
}) {
  return (
    <Link
      href={item.url || ''}
      className={cn(
        'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200',
        isActive
          ? 'bg-primary/10 text-primary font-medium'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      {isActive && (
        <span className="bg-primary absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r-full" />
      )}
      <SmartIcon
        name={item.icon as string}
        size={18}
        className={cn(
          'shrink-0 transition-colors duration-200',
          isActive
            ? 'text-primary'
            : 'text-muted-foreground group-hover:text-foreground'
        )}
      />
      <span>{item.title}</span>
    </Link>
  );
}

export function ConsoleLayout({
  title,
  nav,
  topNav,
  className,
  children,
}: {
  title?: string;
  description?: string;
  nav?: Nav;
  topNav?: Nav;
  className?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();

  const isItemActive = (item: Nav['items'][number]) =>
    item.is_active ||
    pathname.endsWith(item.url as string) ||
    item.url?.endsWith(pathname);

  const isTopNavItemActive = (item: Nav['items'][number]) =>
    item.is_active || pathname?.startsWith(item.url as string);

  const showSidebar = (nav?.items.length ?? 0) > 1;

  const renderSidebarNav = () => (
    <nav className="space-y-1">
      {nav?.items.map((item, idx) => (
        <NavItem key={idx} item={item} isActive={!!isItemActive(item)} />
      ))}
    </nav>
  );

  return (
    <div className={cn('bg-background min-h-screen', className)}>
      {/* Header: top nav toggle + mobile menu, single bar */}
      <div className="border-border/50 border-b">
        <div className="container flex items-center justify-between gap-4 py-3">
          {/* Mobile menu only appears when the sidebar has multiple items. */}
          {showSidebar && (
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 md:hidden"
                >
                  <SmartIcon name="Menu" size={18} />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetHeader className="border-border/50 border-b px-6 py-5">
                  <SheetTitle className="text-left text-lg">
                    {title || 'Menu'}
                  </SheetTitle>
                </SheetHeader>
                <div className="p-4">{renderSidebarNav()}</div>
              </SheetContent>
            </Sheet>
          )}

          {/* Top nav toggle */}
          {topNav && (
            <div className="bg-muted/50 inline-flex items-center gap-1 rounded-xl p-1">
              {topNav.items.map((item, idx) => (
                <Link
                  key={idx}
                  href={item.url || ''}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200',
                    isTopNavItemActive(item)
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  {item.icon && (
                    <SmartIcon name={item.icon as string} size={16} />
                  )}
                  {item.title}
                </Link>
              ))}
            </div>
          )}

          {showSidebar && <div className="w-10 shrink-0 md:hidden" />}
        </div>
      </div>

      {/* Body: sidebar + content */}
      <div className="container">
        <div className="flex gap-10 py-8">
          {showSidebar && (
            <aside className="hidden w-52 shrink-0 md:block lg:w-56">
              <div className="sticky top-24">{renderSidebarNav()}</div>
            </aside>
          )}

          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </div>
    </div>
  );
}
