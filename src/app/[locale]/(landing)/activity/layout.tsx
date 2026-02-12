import { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';

import { ConsoleLayout } from '@/shared/blocks/console/layout';
import { ChatStatus, getChatsCount } from '@/shared/models/chat';
import { getUserInfo } from '@/shared/models/user';
import { type Nav } from '@/shared/types/blocks/common';

export default async function ActivityLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = await getTranslations('activity.sidebar');
  const user = await getUserInfo();

  // settings title
  const title = t('title');

  // settings nav
  const nav = t.raw('nav') as Nav;

  let sidebarNav: Nav = nav;
  if (user) {
    const chatsCount = await getChatsCount({
      userId: user.id,
      status: ChatStatus.CREATED,
    });

    if (chatsCount <= 0) {
      sidebarNav = {
        ...nav,
        items: nav.items.filter((item) => item.url !== '/activity/chats'),
      };
    }
  }

  const topNav = t.raw('top_nav');

  return (
    <ConsoleLayout
      title={title}
      nav={sidebarNav}
      topNav={topNav}
      className="py-16 md:py-20"
    >
      {children}
    </ConsoleLayout>
  );
}
