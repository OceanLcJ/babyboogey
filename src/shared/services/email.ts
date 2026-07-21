import { envConfigs } from '@/config';
import {
  CloudflareEmailBinding,
  CloudflareEmailProvider,
  EmailManager,
} from '@/extensions/email';

/**
 * get email service with configs
 */
export function getEmailServiceWithBinding(
  binding?: CloudflareEmailBinding,
  overrides: {
    fromEmail?: string;
    fromName?: string;
    replyTo?: string;
  } = {}
) {
  const emailManager = new EmailManager();
  emailManager.addProvider(
    new CloudflareEmailProvider({
      binding,
      defaultFromEmail: overrides.fromEmail || envConfigs.email_from_address,
      defaultFromName: overrides.fromName || envConfigs.email_from_name,
      defaultReplyTo: overrides.replyTo || envConfigs.email_reply_to,
    }),
    true
  );

  return emailManager;
}

/**
 * global email service
 */
let emailService: EmailManager | null = null;

/**
 * get email service instance
 */
export async function getEmailService(): Promise<EmailManager> {
  emailService = getEmailServiceWithBinding();

  return emailService;
}
