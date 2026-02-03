import { getTranslations, setRequestLocale } from 'next-intl/server';

import {
  PERMISSIONS,
  requireAllPermissions,
} from '@/core/rbac';
import { Empty } from '@/shared/blocks/common';
import { Header, Main, MainHeader } from '@/shared/blocks/dashboard';
import { FormCard } from '@/shared/blocks/form';
import { getUuid } from '@/shared/lib/hash';
import { findUserById } from '@/shared/models/user';
import {
  assignRolesToUser,
  getRoles,
  getUserRoles,
} from '@/shared/services/rbac';
import { Crumb } from '@/shared/types/blocks/common';
import { Form } from '@/shared/types/blocks/form';

export default async function UserEditRolesPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  // Check if user has permission to edit posts
  await requireAllPermissions({
    codes: [PERMISSIONS.USERS_WRITE, PERMISSIONS.ROLES_WRITE],
    redirectUrl: '/admin/no-permission',
    locale,
  });

  const user = await findUserById(id);
  if (!user) {
    return <Empty message="User not found" />;
  }

  const t = await getTranslations('admin.users');

  const crumbs: Crumb[] = [
    { title: t('edit_roles.crumbs.admin'), url: '/admin' },
    { title: t('edit_roles.crumbs.users'), url: '/admin/users' },
    { title: t('edit_roles.crumbs.edit_roles'), is_active: true },
  ];

  const roles = await getRoles();
  const rolesOptions = roles.map((role) => ({
    title: role.title,
    description: role.description,
    value: role.id,
  }));

  const userRoles = await getUserRoles(user.id as string);
  const userRoleIds = userRoles.map((role) => role.id);

  const form: Form = {
    fields: [
      {
        name: 'email',
        type: 'text',
        title: t('fields.email'),
        validation: { required: true },
        attributes: { disabled: true },
      },
      {
        name: 'roles',
        type: 'checkbox',
        title: t('fields.roles'),
        options: rolesOptions,
        validation: { required: true },
      },
    ],
    passby: {
      userId: user.id,
    },
    data: {
      email: user.email,
      roles: userRoleIds,
    },
    submit: {
      button: {
        title: t('edit_roles.buttons.submit'),
      },
      handler: async (data, passby) => {
        'use server';

        const { userId } = passby;

        if (!userId) {
          throw new Error('no auth');
        }

        const requestId = getUuid();

        try {
          const rawRoles = data.get('roles');
          let roles: string[] = [];

          if (rawRoles === null) {
            roles = [];
          } else if (typeof rawRoles === 'string') {
            const parsed = JSON.parse(rawRoles);
            roles = Array.isArray(parsed)
              ? parsed.filter((v): v is string => typeof v === 'string')
              : [];
          } else {
            throw new Error('invalid roles');
          }

          await assignRolesToUser(userId as string, Array.from(new Set(roles)));
        } catch (error) {
          console.error(
            `[admin/edit-roles] requestId=${requestId} userId=${userId}`,
            error
          );
          return {
            status: 'error',
            message: `update roles failed (requestId: ${requestId})`,
          };
        }

        return {
          status: 'success',
          message: 'roles updated',
          redirect_url: '/admin/users',
        };
      },
    },
  };

  return (
    <>
      <Header crumbs={crumbs} />
      <Main>
        <MainHeader title={t('edit_roles.title')} />
        <FormCard form={form} className="md:max-w-xl" />
      </Main>
    </>
  );
}
