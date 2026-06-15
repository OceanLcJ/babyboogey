export const publicSettingNames = [
  'email_auth_enabled',
  'email_verification_enabled',
  'google_auth_enabled',
  'google_one_tap_enabled',
  'google_client_id',
  'github_auth_enabled',
  'select_payment_enabled',
  'default_payment_provider',
  'stripe_enabled',
  'creem_enabled',
  'paypal_enabled',
  'affonso_enabled',
  'promotekit_enabled',
  'crisp_enabled',
  'tawk_enabled',
];

const publicSettingNameSet = new Set(publicSettingNames);

type Configs = Record<string, string>;

export function toPublicConfigs(configs: Configs): Configs {
  const publicConfigs: Configs = {};

  for (const [key, value] of Object.entries(configs)) {
    if (publicSettingNameSet.has(key)) {
      publicConfigs[key] = String(value ?? '');
    }
  }

  return publicConfigs;
}
