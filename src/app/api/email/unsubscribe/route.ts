import { envConfigs } from '@/config';
import {
  unsubscribeMarketingEmail,
  verifyMarketingUnsubscribeToken,
} from '@/shared/services/marketing-email-preference';

function htmlResponse(body: string, status = 200): Response {
  return new Response(
    [
      '<!doctype html><html lang="en"><head><meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width,initial-scale=1">',
      '<title>BabyBoogey email preferences</title></head>',
      '<body style="margin:0;background:#f3f4f6;font-family:Inter,Arial,sans-serif;color:#111827">',
      '<main style="max-width:560px;margin:64px auto;padding:0 20px">',
      '<section style="border-radius:16px;background:#fff;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,.08)">',
      '<p style="margin:0 0 24px;color:#ef4444;font-size:20px;font-weight:800">BabyBoogey</p>',
      body,
      '</section></main></body></html>',
    ].join(''),
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/html; charset=utf-8',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    }
  );
}

function invalidTokenResponse(): Response {
  return htmlResponse(
    '<h1 style="font-size:26px">This unsubscribe link is invalid</h1>' +
      '<p>Please contact support@babyboogey.com if you need help.</p>',
    400
  );
}

async function userIdFromRequest(req: Request): Promise<string | null> {
  const token = new URL(req.url).searchParams.get('token') || '';
  const verified = await verifyMarketingUnsubscribeToken({
    token,
    secret: envConfigs.email_unsubscribe_secret,
  });
  return verified?.userId || null;
}

export async function GET(req: Request) {
  const userId = await userIdFromRequest(req);
  if (!userId) return invalidTokenResponse();

  const token = new URL(req.url).searchParams.get('token') || '';
  return htmlResponse(
    '<h1 style="margin:0 0 16px;font-size:26px">Stop product reminders?</h1>' +
      '<p style="margin:0 0 24px;line-height:1.6">You will no longer receive BabyBoogey credit or checkout reminder emails. Account, security, and payment emails will continue.</p>' +
      `<form method="post" action="/api/email/unsubscribe?token=${encodeURIComponent(token)}">` +
      '<button type="submit" style="border:0;border-radius:10px;background:#ef4444;padding:12px 18px;color:#fff;font-size:15px;font-weight:700;cursor:pointer">Unsubscribe</button>' +
      '</form>'
  );
}

export async function POST(req: Request) {
  const userId = await userIdFromRequest(req);
  if (!userId) return invalidTokenResponse();

  await unsubscribeMarketingEmail({ userId });
  return htmlResponse(
    '<h1 style="margin:0 0 16px;font-size:26px">You are unsubscribed</h1>' +
      '<p style="margin:0;line-height:1.6">BabyBoogey product reminders have been turned off. Account, security, and payment emails are unchanged.</p>'
  );
}
