import { PERMISSIONS } from '@/core/rbac';
import { VerificationCode } from '@/shared/blocks/email/verification-code';
import { respData, respErr } from '@/shared/lib/resp';
import { getUserInfo } from '@/shared/models/user';
import { getEmailService } from '@/shared/services/email';
import { hasPermission } from '@/shared/services/rbac';

export async function POST(req: Request) {
  try {
    const currentUser = await getUserInfo();
    if (!currentUser) {
      return Response.json(
        { code: -1, message: 'no auth, please sign in' },
        { status: 401 }
      );
    }
    const isAdmin = await hasPermission(currentUser.id, PERMISSIONS.ADMIN_ACCESS);
    if (!isAdmin) {
      return Response.json(
        { code: -1, message: 'permission denied' },
        { status: 403 }
      );
    }

    const { emails, subject } = await req.json();

    const emailService = await getEmailService();

    const result = await emailService.sendEmail({
      to: emails,
      subject: subject,
      react: VerificationCode({ code: '123455' }),
    });

    console.log('send email result', result);

    return respData(result);
  } catch (e) {
    console.log('send email failed:', e);
    return respErr('send email failed');
  }
}
