import { PERMISSIONS } from '@/core/rbac';
import { respData, respErr } from '@/shared/lib/resp';
import { getRemainingCredits } from '@/shared/models/credit';
import { hasMonetizedPaidOrder } from '@/shared/models/order';
import { getCurrentSubscription } from '@/shared/models/subscription';
import { getUserInfo } from '@/shared/models/user';
import { hasPermission } from '@/shared/services/rbac';

export async function POST() {
  try {
    // get sign user info
    const user = await getUserInfo();
    if (!user) {
      return respErr('no auth, please sign in');
    }

    // check if user is admin
    const isAdmin = await hasPermission(user.id, PERMISSIONS.ADMIN_ACCESS);

    const [paidOrder, currentSubscription] = await Promise.all([
      hasMonetizedPaidOrder(user.id),
      getCurrentSubscription(user.id),
    ]);

    // get remaining credits
    const remainingCredits = await getRemainingCredits(user.id);

    const membership = {
      hasMonetizedPaidOrder: paidOrder,
      hasSubscription: !!currentSubscription,
      subscription: currentSubscription
        ? {
            status: currentSubscription.status,
            productId: currentSubscription.productId ?? null,
            planName: currentSubscription.planName ?? null,
            currentPeriodEnd: currentSubscription.currentPeriodEnd ?? null,
          }
        : null,
      canUseProTemplates: isAdmin || paidOrder || !!currentSubscription,
    };

    return respData({ ...user, isAdmin, credits: { remainingCredits }, membership });
  } catch (e) {
    console.log('get user info failed:', e);
    return respErr('get user info failed');
  }
}
