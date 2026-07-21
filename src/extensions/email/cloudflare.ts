import { getCloudflareContext } from '@opennextjs/cloudflare';

import type {
  EmailConfigs,
  EmailMessage,
  EmailProvider,
  EmailSendResult,
} from '.';

export interface CloudflareEmailAddress {
  email: string;
  name?: string;
}

export interface CloudflareEmailBinding {
  send(message: {
    to:
      | string
      | CloudflareEmailAddress
      | Array<string | CloudflareEmailAddress>;
    from: string | CloudflareEmailAddress;
    subject: string;
    html?: string;
    text?: string;
    cc?: string | string[];
    bcc?: string | string[];
    replyTo?: string | CloudflareEmailAddress;
    headers?: Record<string, string>;
  }): Promise<{ messageId: string }>;
}

export interface CloudflareEmailConfigs extends EmailConfigs {
  binding?: CloudflareEmailBinding;
  defaultFromEmail: string;
  defaultFromName?: string;
  defaultReplyTo?: string;
}

function isTestRecipient(recipient: string): boolean {
  return recipient.trim().toLowerCase().endsWith('@example.test');
}

function getRuntimeEmailBinding(): CloudflareEmailBinding {
  const { env } = getCloudflareContext();
  const binding = (env as UnsafeAny).EMAIL as
    | CloudflareEmailBinding
    | undefined;
  if (!binding) {
    throw new Error('Cloudflare EMAIL binding is not configured');
  }
  return binding;
}

export class CloudflareEmailProvider implements EmailProvider {
  readonly name = 'cloudflare';
  configs: CloudflareEmailConfigs;

  constructor(configs: CloudflareEmailConfigs) {
    this.configs = configs;
  }

  async sendEmail(email: EmailMessage): Promise<EmailSendResult> {
    const recipients = Array.isArray(email.to) ? email.to : [email.to];
    if (recipients.length === 0 || recipients.some((value) => !value.trim())) {
      return {
        success: false,
        error: 'Email recipient is required',
        provider: this.name,
      };
    }

    if (recipients.every(isTestRecipient)) {
      return {
        success: true,
        messageId: `skipped:test-recipient:${crypto.randomUUID()}`,
        provider: this.name,
        skipped: true,
      };
    }

    if (recipients.some(isTestRecipient)) {
      return {
        success: false,
        error: 'Test recipients cannot be mixed with real recipients',
        provider: this.name,
      };
    }

    if (!email.html.trim() || !email.text.trim()) {
      return {
        success: false,
        error: 'Both HTML and text email bodies are required',
        provider: this.name,
      };
    }

    try {
      const binding = this.configs.binding ?? getRuntimeEmailBinding();
      const result = await binding.send({
        to: email.to,
        from: email.from || {
          email: this.configs.defaultFromEmail,
          name: this.configs.defaultFromName,
        },
        subject: email.subject,
        html: email.html,
        text: email.text,
        cc: email.cc,
        bcc: email.bcc,
        replyTo: email.replyTo || this.configs.defaultReplyTo || undefined,
        headers: email.headers,
      });

      return {
        success: true,
        messageId: result.messageId,
        provider: this.name,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown email error',
        provider: this.name,
      };
    }
  }
}
