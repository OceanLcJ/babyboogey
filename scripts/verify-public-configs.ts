import assert from 'node:assert/strict';

import {
  publicSettingNames,
  toPublicConfigs,
} from '../src/shared/lib/config-safety';

const sensitiveConfigs = {
  auth_secret: 'auth-secret',
  database_url: 'postgres://secret',
  google_client_secret: 'google-client-secret',
  stripe_secret_key: 'sk_live_secret',
  stripe_signing_secret: 'whsec_secret',
  creem_api_key: 'creem-secret',
  paypal_client_secret: 'paypal-secret',
  resend_api_key: 're_secret',
  r2_access_key: 'r2-access-key',
  r2_secret_key: 'r2-secret-key',
  openrouter_api_key: 'sk-or-secret',
  openai_api_key: 'sk-openai-secret',
  replicate_api_token: 'r8_secret',
  fal_api_key: 'fal-secret',
  gemini_api_key: 'google-cloud-key',
  kie_api_key: 'kie-secret',
};

const publicConfigs = {
  email_auth_enabled: 'true',
  email_verification_enabled: 'true',
  google_auth_enabled: 'true',
  google_one_tap_enabled: 'true',
  google_client_id: 'google-client-id.apps.googleusercontent.com',
  github_auth_enabled: 'true',
  select_payment_enabled: 'true',
  default_payment_provider: 'stripe',
  stripe_enabled: 'true',
  creem_enabled: 'false',
  paypal_enabled: 'false',
  affonso_enabled: 'true',
  promotekit_enabled: 'true',
  crisp_enabled: 'true',
  tawk_enabled: 'true',
};

const result = toPublicConfigs({
  ...sensitiveConfigs,
  ...publicConfigs,
});

for (const key of Object.keys(sensitiveConfigs)) {
  assert.equal(result[key], undefined, `${key} must not be public`);
}

for (const [key, value] of Object.entries(publicConfigs)) {
  assert.equal(result[key], value, `${key} should remain public`);
}

assert.deepEqual(
  Object.keys(result).sort(),
  publicSettingNames.slice().sort(),
  'public config output must match the explicit allowlist'
);

console.log('public config sanitizer verified');
