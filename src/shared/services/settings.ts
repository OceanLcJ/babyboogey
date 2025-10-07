export interface Setting {
  name: string;
  title: string;
  type: string;
  placeholder?: string;
  options?: {
    title: string;
    value: string;
  }[];
  tip?: string;
  value?: string;
  group?: string;
  tab?: string;
}

export interface SettingGroup {
  name: string;
  title: string;
  description?: string;
  tab: string;
}

export const settingGroups: SettingGroup[] = [
  {
    name: "email_auth",
    title: "Email Auth",
    description: "custom your email auth settings",
    tab: "auth",
  },
  {
    name: "google_auth",
    title: "Google Auth",
    description: "custom your google auth settings",
    tab: "auth",
  },
  {
    name: "github_auth",
    title: "Github Auth",
    description: "custom your github auth settings",
    tab: "auth",
  },
  {
    name: "basic_payment",
    title: "Basic",
    description: "custom your basic payment settings",
    tab: "payment",
  },
  {
    name: "stripe",
    title: "Stripe",
    description: "custom your stripe settings",
    tab: "payment",
  },
  {
    name: "creem",
    title: "Creem",
    description: "custom your creem settings",
    tab: "payment",
  },
  {
    name: "paypal",
    title: "Paypal",
    description: "custom your paypal settings",
    tab: "payment",
  },
  {
    name: "google_analytics",
    title: "Google Analytics",
    description: "custom your google analytics settings",
    tab: "analytics",
  },
  {
    name: "plausible",
    title: "Plausible",
    description: "custom your plausible settings",
    tab: "analytics",
  },
  {
    name: "openpanel",
    title: "OpenPanel",
    description: "custom your openpanel settings",
    tab: "analytics",
  },
  {
    name: "resend",
    title: "Resend",
    description: "custom your resend settings",
    tab: "email",
  },
  {
    name: "r2",
    title: "Cloudflare R2",
    description: "custom your cloudflare r2 settings",
    tab: "storage",
  },
  {
    name: "adsense",
    title: "Adsense",
    description: "custom your adsense settings",
    tab: "ads",
  },
  {
    name: "openrouter",
    title: "OpenRouter",
    description: "custom your openrouter settings",
    tab: "ai",
  },
  {
    name: "replicate",
    title: "Replicate",
    description: "custom your replicate settings",
    tab: "ai",
  },
  {
    name: "fal",
    title: "Fal",
    description: "custom your fal settings",
    tab: "ai",
  },
];

export const settings: Setting[] = [
  {
    name: "email_auth_enabled",
    title: "Enabled",
    type: "switch",
    value: "true",
    group: "email_auth",
    tab: "auth",
  },
  {
    name: "google_auth_enabled",
    title: "Enabled",
    type: "switch",
    value: "false",
    group: "google_auth",
    tab: "auth",
  },
  {
    name: "google_client_id",
    title: "Google Client ID",
    type: "text",
    placeholder: "",
    group: "google_auth",
    tab: "auth",
  },
  {
    name: "google_client_secret",
    title: "Google Client Secret",
    type: "password",
    placeholder: "",
    group: "google_auth",
    tab: "auth",
  },
  {
    name: "github_auth_enabled",
    title: "Enabled",
    type: "switch",
    group: "github_auth",
    tab: "auth",
  },
  {
    name: "github_client_id",
    title: "Github Client ID",
    type: "text",
    placeholder: "",
    group: "github_auth",
    tab: "auth",
  },
  {
    name: "github_client_secret",
    title: "Github Client Secret",
    type: "password",
    placeholder: "",
    group: "github_auth",
    tab: "auth",
  },
  {
    name: "payment_provider",
    title: "Payment Provider",
    type: "select",
    value: "stripe",
    options: [
      {
        title: "Stripe",
        value: "stripe",
      },
      {
        title: "Creem",
        value: "creem",
      },
      {
        title: "Paypal",
        value: "paypal",
      },
    ],
    tip: "Choose the payment provider to use",
    group: "basic_payment",
    tab: "payment",
  },
  {
    name: "stripe_publishable_key",
    title: "Stripe Publishable Key",
    type: "text",
    placeholder: "pk_xxx",
    group: "stripe",
    tab: "payment",
  },
  {
    name: "stripe_secret_key",
    title: "Stripe Secret Key",
    type: "password",
    placeholder: "sk_xxx",
    group: "stripe",
    tab: "payment",
  },
  {
    name: "stripe_webhook_secret",
    title: "Stripe Webhook Secret",
    type: "password",
    placeholder: "whsec_xxx",
    tip: "Stripe Webhook Secret is used to verify the webhook from Stripe",
    group: "stripe",
    tab: "payment",
  },
  {
    name: "creem_api_key",
    title: "Creem API Key",
    type: "password",
    placeholder: "creem_xxx",
    group: "creem",
    tab: "payment",
  },
  {
    name: "paypal_client_id",
    title: "Paypal Client ID",
    type: "text",
    placeholder: "paypal_xxx",
    group: "paypal",
    tab: "payment",
  },
  {
    name: "paypal_client_secret",
    title: "Paypal Client Secret",
    type: "password",
    placeholder: "paypal_xxx",
    group: "paypal",
    tab: "payment",
  },
  {
    name: "google_analytics_id",
    title: "Google Analytics ID",
    type: "text",
    placeholder: "",
    group: "google_analytics",
    tab: "analytics",
  },
  {
    name: "plausible_domain",
    title: "Plausible Domain",
    type: "text",
    placeholder: "shipany.site",
    group: "plausible",
    tab: "analytics",
  },
  {
    name: "plausible_src",
    title: "Plausible Script Src",
    type: "url",
    placeholder: "https://plausible.io/js/script.js",
    group: "plausible",
    tab: "analytics",
  },
  {
    name: "openpanel_client_id",
    title: "OpenPanel Client ID",
    type: "text",
    placeholder: "",
    group: "openpanel",
    tab: "analytics",
  },
  {
    name: "resend_api_key",
    title: "Resend API Key",
    type: "password",
    placeholder: "",
    group: "resend",
    tab: "email",
  },
  {
    name: "resend_sender_email",
    title: "Resend Sender Email",
    type: "email",
    placeholder: "",
    group: "resend",
    tab: "email",
  },
  {
    name: "r2_access_key",
    title: "Cloudflare Access Key",
    type: "text",
    placeholder: "",
    group: "r2",
    tab: "storage",
  },
  {
    name: "r2_secret_key",
    title: "Cloudflare Secret Key",
    type: "password",
    placeholder: "",
    group: "r2",
    tab: "storage",
  },
  {
    name: "r2_bucket_name",
    title: "Bucket Name",
    type: "text",
    placeholder: "",
    group: "r2",
    tab: "storage",
  },
  {
    name: "r2_endpoint",
    title: "Endpoint",
    type: "url",
    placeholder: "https://<account-id>.r2.cloudflarestorage.com",
    tip: "Leave empty to use the default R2 endpoint",
    group: "r2",
    tab: "storage",
  },
  {
    name: "r2_domain",
    title: "Domain",
    type: "url",
    placeholder: "",
    group: "r2",
    tab: "storage",
  },
  {
    name: "adsense_code",
    title: "Adsense Code",
    type: "text",
    placeholder: "ca-pub-xxx",
    group: "adsense",
    tab: "ads",
  },
  {
    name: "openrouter_api_key",
    title: "OpenRouter API Key",
    type: "password",
    placeholder: "sk-or-xxx",
    group: "openrouter",
    tab: "ai",
  },
  {
    name: "replicate_api_token",
    title: "Replicate API Token",
    type: "password",
    placeholder: "r8_xxx",
    group: "replicate",
    tab: "ai",
  },
  {
    name: "fal_api_key",
    title: "Fal API Key",
    type: "password",
    placeholder: "fal_xxx",
    group: "fal",
    tip: "Fal API Key is used to access the Fal API",
    tab: "ai",
  },
];

export const publicSettingNames = [
  "email_auth_enabled",
  "google_auth_enabled",
  "github_auth_enabled",
];
