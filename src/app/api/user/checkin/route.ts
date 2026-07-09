import { claimDailyCheckin } from '@/shared/models/credit';
import { respData, respErr } from '@/shared/lib/resp';
import { getUserInfo } from '@/shared/models/user';

export async function POST() {
  try {
    const user = await getUserInfo();
    if (!user?.id) {
      return respErr('not signed in');
    }

    const result = await claimDailyCheckin(user);

    return respData({
      alreadyClaimed: result.alreadyClaimed,
      credits: result.credit?.credits ?? 0,
    });
  } catch (e) {
    console.error('checkin failed:', e);
    return respErr('check-in failed');
  }
}
