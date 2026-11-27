/**
 * Sightline Secrets — detectors.
 *
 * Written for Sightline under the MIT licence. The patterns describe each provider's published
 * key format (prefixes, lengths and alphabets from the providers' own documentation). No code or
 * detector definitions were copied from other scanners. See THIRD-PARTY-NOTICES.md.
 *
 * A detector is cheap to run: `keywords` are lower-case substrings, and the pattern only runs on
 * text that contains one of them. `secret` picks the capture group that holds the credential.
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export interface Detector {
  id: string;
  name: string;
  keywords: string[];
  /** Must use the global flag. */
  pattern: RegExp;
  /** Capture group holding the secret (0 = whole match). */
  group?: number;
  severity: Severity;
  /** Minimum Shannon entropy (bits per character) of the secret, to drop placeholders. */
  minEntropy?: number;
  /** Extra check on the secret, e.g. decoding a JWT. */
  accept?: (secret: string) => boolean;
  /** What to do about it, in plain words. */
  fix: string;
}

const ROTATE = 'Revoke this key in the provider dashboard and create a new one, then remove it from the code and its history. Keys sent to browsers must be the provider\'s public or publishable type.';

function jwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try { return JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); } catch { return null; }
}

/** Looks like documentation rather than a real value: x's, zeros, "example", "your_…" and similar. */
export function isPlaceholder(value: string): boolean {
  return /(example|sample|dummy|placeholder|changeme|your[_-]?|xxxx|<[^>]*>|\$\{|\{\{|1234567890|abcdef(?:ghij|0123))/i.test(value)
    || /^(.)\1+$/.test(value.replace(/^[a-z]+[_-]/i, ''));
}

export const DETECTORS: Detector[] = [
  // ---- Cloud providers
  { id: 'aws-access-key', name: 'AWS access key ID', keywords: ['akia', 'asia', 'abia', 'acca'], pattern: /(?<![A-Z0-9])((?:AKIA|ASIA|ABIA|ACCA)[A-Z2-7]{16})(?![A-Z0-9])/g, group: 1, severity: 'high', fix: 'Deactivate the access key in AWS IAM, create a new one and store it outside the code (environment or secrets manager).' },
  { id: 'aws-secret-key', name: 'AWS secret access key', keywords: ['aws', 'secret'], pattern: /aws.{0,24}?(?:secret|sk).{0,20}?['"=:\s]\s*['"]?([A-Za-z0-9/+]{40})(?![A-Za-z0-9/+])/gi, group: 1, severity: 'critical', minEntropy: 4, fix: 'Deactivate the key pair in AWS IAM immediately and review CloudTrail for use you do not recognise.' },
  { id: 'gcp-service-account', name: 'Google Cloud service account key', keywords: ['service_account'], pattern: /"type"\s*:\s*"service_account"[\s\S]{0,400}?"private_key_id"\s*:\s*"([a-f0-9]{40})"/g, group: 1, severity: 'critical', fix: 'Delete the key in Google Cloud IAM → Service accounts → Keys and create a new one stored outside the code.' },
  { id: 'google-api-key', name: 'Google API key', keywords: ['aiza'], pattern: /(?<![A-Za-z0-9_-])(AIza[0-9A-Za-z_-]{35})(?![A-Za-z0-9_-])/g, group: 1, severity: 'low', fix: 'Browser keys for Maps or Firebase are meant to be public, but restrict each to your domains and to only the APIs it needs (Google Cloud → APIs & Services → Credentials).' },
  { id: 'azure-storage', name: 'Azure storage account key', keywords: ['accountkey='], pattern: /AccountName=[^;\s]+;AccountKey=([A-Za-z0-9+/]{86}==)/g, group: 1, severity: 'critical', fix: 'Rotate the storage account key in Azure (Access keys → Rotate) and use a SAS token or managed identity instead.' },
  { id: 'digitalocean', name: 'DigitalOcean token', keywords: ['dop_v1_', 'doo_v1_', 'dor_v1_'], pattern: /\b(do[por]_v1_[a-f0-9]{64})\b/g, group: 1, severity: 'critical', fix: ROTATE },
  { id: 'cloudflare-api-token', name: 'Cloudflare API token', keywords: ['cloudflare', 'cf_api', 'cf-api'], pattern: /(?:cloudflare|cf)[_-]?(?:api)?[_-]?(?:token|key)['"]?\s*[:=]\s*['"]?([A-Za-z0-9_-]{40})(?![A-Za-z0-9_-])/gi, group: 1, severity: 'critical', minEntropy: 4, fix: 'Roll the token in Cloudflare → My Profile → API Tokens.' },
  { id: 'heroku-api-key', name: 'Heroku API key', keywords: ['heroku'], pattern: /heroku.{0,20}?['"=:\s]\s*['"]?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi, group: 1, severity: 'high', fix: ROTATE },

  // ---- Code hosting and package registries
  { id: 'github-token', name: 'GitHub token', keywords: ['ghp_', 'gho_', 'ghu_', 'ghs_', 'ghr_'], pattern: /\b(gh[pousr]_[A-Za-z0-9]{36})\b/g, group: 1, severity: 'critical', fix: 'Revoke it at github.com/settings/tokens (or the app/OAuth settings) and create a new token with the least access needed.' },
  { id: 'github-fine-grained', name: 'GitHub fine-grained token', keywords: ['github_pat_'], pattern: /\b(github_pat_[A-Za-z0-9_]{82})\b/g, group: 1, severity: 'critical', fix: 'Revoke it at github.com/settings/tokens and create a new fine-grained token.' },
  { id: 'gitlab-token', name: 'GitLab token', keywords: ['glpat-', 'glptt-', 'gldt-', 'glrt-'], pattern: /\b(gl(?:pat|ptt|dt|rt)-[A-Za-z0-9_-]{20,})\b/g, group: 1, severity: 'critical', fix: 'Revoke the token in GitLab → Preferences → Access tokens.' },
  { id: 'npm-token', name: 'npm access token', keywords: ['npm_'], pattern: /\b(npm_[A-Za-z0-9]{36})\b/g, group: 1, severity: 'critical', fix: 'Revoke it with `npm token revoke` or at npmjs.com → Access Tokens. A leaked publish token lets others release your packages.' },
  { id: 'pypi-token', name: 'PyPI API token', keywords: ['pypi-'], pattern: /\b(pypi-AgEIcHlwaS5vcmc[A-Za-z0-9_-]{50,})/g, group: 1, severity: 'critical', fix: 'Remove the token at pypi.org → Account settings → API tokens.' },
  { id: 'docker-hub', name: 'Docker Hub access token', keywords: ['dckr_pat_'], pattern: /\b(dckr_pat_[A-Za-z0-9_-]{27})\b/g, group: 1, severity: 'high', fix: ROTATE },

  // ---- Payments and commerce
  { id: 'stripe-secret', name: 'Stripe live secret key', keywords: ['sk_live_', 'rk_live_'], pattern: /\b([sr]k_live_[A-Za-z0-9]{24,})\b/g, group: 1, severity: 'critical', fix: 'Roll the key in the Stripe dashboard (Developers → API keys). Only pk_live_ publishable keys belong in a browser.' },
  { id: 'stripe-test', name: 'Stripe test secret key', keywords: ['sk_test_'], pattern: /\b(sk_test_[A-Za-z0-9]{24,})\b/g, group: 1, severity: 'low', fix: 'Test keys cannot move money, but they expose your test data: roll it and keep it out of public code.' },
  { id: 'stripe-webhook', name: 'Stripe webhook secret', keywords: ['whsec_'], pattern: /\b(whsec_[A-Za-z0-9]{32,})\b/g, group: 1, severity: 'high', fix: 'Roll the signing secret for the webhook endpoint in the Stripe dashboard.' },
  { id: 'square', name: 'Square access token', keywords: ['sq0atp-', 'sq0csp-', 'eaaa'], pattern: /\b(sq0atp-[0-9A-Za-z_-]{22}|sq0csp-[0-9A-Za-z_-]{43}|EAAA[A-Za-z0-9_-]{60})\b/g, group: 1, severity: 'critical', minEntropy: 3.5, fix: ROTATE },
  { id: 'braintree', name: 'Braintree / PayPal access token', keywords: ['access_token$production$'], pattern: /(access_token\$production\$[0-9a-z]{16}\$[0-9a-f]{32})/g, group: 1, severity: 'critical', fix: ROTATE },
  { id: 'shopify', name: 'Shopify access token', keywords: ['shpat_', 'shpss_', 'shpca_', 'shppa_'], pattern: /\b(shp(?:at|ss|ca|pa)_[a-fA-F0-9]{32})\b/g, group: 1, severity: 'critical', fix: 'Uninstall/reinstall the custom app or regenerate its Admin API token in Shopify admin.' },

  // ---- AI providers
  { id: 'openai', name: 'OpenAI API key', keywords: ['sk-', 't3blbkfj'], pattern: /\b(sk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}T3BlbkFJ[A-Za-z0-9_-]{20,}|sk-proj-[A-Za-z0-9_-]{80,})/g, group: 1, severity: 'critical', fix: 'Revoke it at platform.openai.com/api-keys. Never call the OpenAI API directly from a browser; proxy it through your server.' },
  { id: 'anthropic', name: 'Anthropic API key', keywords: ['sk-ant-'], pattern: /\b(sk-ant-(?:api03|admin01)-[A-Za-z0-9_-]{80,})/g, group: 1, severity: 'critical', fix: 'Disable the key in the Claude Console (API keys) and call the API only from your server.' },
  { id: 'huggingface', name: 'Hugging Face token', keywords: ['hf_'], pattern: /\b(hf_[A-Za-z]{34})\b/g, group: 1, severity: 'high', fix: ROTATE },
  { id: 'groq', name: 'Groq API key', keywords: ['gsk_'], pattern: /\b(gsk_[A-Za-z0-9]{52})\b/g, group: 1, severity: 'high', fix: ROTATE },
  { id: 'replicate', name: 'Replicate API token', keywords: ['r8_'], pattern: /\b(r8_[A-Za-z0-9]{37})\b/g, group: 1, severity: 'high', fix: ROTATE },
  { id: 'perplexity', name: 'Perplexity API key', keywords: ['pplx-'], pattern: /\b(pplx-[A-Za-z0-9]{48})\b/g, group: 1, severity: 'high', fix: ROTATE },
  { id: 'xai', name: 'xAI API key', keywords: ['xai-'], pattern: /\b(xai-[A-Za-z0-9]{80})\b/g, group: 1, severity: 'high', fix: ROTATE },

  // ---- Messaging and email
  { id: 'slack-token', name: 'Slack token', keywords: ['xox'], pattern: /\b(xox[baprse]-[0-9A-Za-z-]{10,})\b/g, group: 1, severity: 'high', minEntropy: 3, fix: 'Revoke the token at api.slack.com/apps (OAuth & Permissions) and reinstall the app.' },
  { id: 'slack-webhook', name: 'Slack incoming webhook', keywords: ['hooks.slack.com'], pattern: /(https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]{24})/g, group: 1, severity: 'medium', fix: 'Remove the webhook in the Slack app settings and create a new one; anyone with the URL can post to the channel.' },
  { id: 'discord-webhook', name: 'Discord webhook', keywords: ['discord'], pattern: /(https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]{60,})/g, group: 1, severity: 'medium', fix: 'Delete the webhook in the Discord channel settings (Integrations → Webhooks).' },
  { id: 'discord-bot', name: 'Discord bot token', keywords: ['discord'], pattern: /\b([MN][A-Za-z\d]{23,25}\.[\w-]{6}\.[\w-]{27,38})\b/g, group: 1, severity: 'high', fix: 'Reset the token in the Discord Developer Portal (Bot → Reset Token).' },
  { id: 'telegram-bot', name: 'Telegram bot token', keywords: [':aa'], pattern: /\b(\d{8,10}:AA[A-Za-z0-9_-]{33})\b/g, group: 1, severity: 'high', fix: 'Revoke it with @BotFather (/revoke) and update the bot.' },
  { id: 'twilio', name: 'Twilio API key', keywords: ['twilio'], pattern: /twilio[\s\S]{0,80}?\b(SK[0-9a-f]{32})\b/gi, group: 1, severity: 'high', fix: ROTATE },
  { id: 'sendgrid', name: 'SendGrid API key', keywords: ['sg.'], pattern: /\b(SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43})\b/g, group: 1, severity: 'critical', fix: 'Delete the key in SendGrid → Settings → API Keys. A leaked key lets anyone send email as you.' },
  { id: 'mailgun', name: 'Mailgun API key', keywords: ['mailgun'], pattern: /mailgun[\s\S]{0,80}?\b(key-[0-9a-f]{32})\b/gi, group: 1, severity: 'critical', fix: ROTATE },
  { id: 'mailchimp', name: 'Mailchimp API key', keywords: ['-us'], pattern: /\b([0-9a-f]{32}-us\d{1,2})\b/g, group: 1, severity: 'high', fix: ROTATE },
  { id: 'postmark', name: 'Postmark server token', keywords: ['postmark'], pattern: /postmark[\s\S]{0,60}?\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/gi, group: 1, severity: 'high', fix: ROTATE },

  // ---- Databases and back-ends
  { id: 'supabase-service-role', name: 'Supabase service_role key', keywords: ['eyj'], pattern: /\b(eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,})/g, group: 1, severity: 'critical', accept: (s) => jwtPayload(s)?.role === 'service_role', fix: 'The service_role key bypasses Row Level Security. Rotate the JWT secret in Supabase → Settings → API and use only the anon key in browsers.' },
  { id: 'database-url', name: 'Database URL with password', keywords: ['://'], pattern: /\b((?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|rediss|amqps?|mssql):\/\/[^:\s'"`/@]+:([^@\s'"`]{4,})@[^\s'"`<>]+)/gi, group: 1, severity: 'critical', accept: (s) => !isPlaceholder(s.split('@')[0].split(':').slice(2).join(':')), fix: 'Change the database password, restrict who can connect (IP allow-list or private network) and load the URL from an environment variable.' },
  { id: 'firebase-admin', name: 'Firebase / Google private key', keywords: ['private_key'], pattern: /"private_key"\s*:\s*"(-----BEGIN PRIVATE KEY-----[^"]{40,})/g, group: 1, severity: 'critical', fix: 'Delete the service account key in Google Cloud IAM and create a new one kept on the server only.' },

  // ---- Developer tools
  { id: 'sentry-token', name: 'Sentry auth token', keywords: ['sntrys_', 'sntryu_'], pattern: /\b(sntrys_[A-Za-z0-9+/=_-]{60,}|sntryu_[a-f0-9]{64})/g, group: 1, severity: 'high', fix: ROTATE },
  { id: 'linear', name: 'Linear API key', keywords: ['lin_api_'], pattern: /\b(lin_api_[A-Za-z0-9]{40})\b/g, group: 1, severity: 'high', fix: ROTATE },
  { id: 'notion', name: 'Notion integration token', keywords: ['secret_', 'ntn_'], pattern: /\b(secret_[A-Za-z0-9]{43}|ntn_[0-9]{11}[A-Za-z0-9]{35})\b/g, group: 1, severity: 'high', minEntropy: 3.5, fix: ROTATE },
  { id: 'airtable', name: 'Airtable personal access token', keywords: ['pat'], pattern: /\b(pat[A-Za-z0-9]{14}\.[a-f0-9]{64})\b/g, group: 1, severity: 'high', fix: ROTATE },
  { id: 'atlassian', name: 'Atlassian API token', keywords: ['atatt3'], pattern: /\b(ATATT3[A-Za-z0-9_=-]{180,})/g, group: 1, severity: 'high', fix: ROTATE },
  { id: 'figma', name: 'Figma personal access token', keywords: ['figd_'], pattern: /\b(figd_[A-Za-z0-9_-]{40})\b/g, group: 1, severity: 'medium', fix: ROTATE },
  { id: 'mapbox-secret', name: 'Mapbox secret token', keywords: ['sk.eyj'], pattern: /\b(sk\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,})/g, group: 1, severity: 'high', fix: 'Delete the secret token in Mapbox; browsers should use pk. public tokens restricted to your URLs.' },
  { id: 'newrelic', name: 'New Relic user API key', keywords: ['nrak-'], pattern: /\b(NRAK-[A-Z0-9]{27})\b/g, group: 1, severity: 'high', fix: ROTATE },

  // ---- Keys and generic secrets
  { id: 'private-key', name: 'Private key', keywords: ['private key'], pattern: /(-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----(?:\\(?:r\\)?n|\r?\n)(?:[A-Za-z0-9-]+: [^\r\n]*(?:\\(?:r\\)?n|\r?\n))*(?:\\(?:r\\)?n|\r?\n)?[A-Za-z0-9+/=\r\n\\nr]{40,}?(?:\\(?:r\\)?n|\r?\n)?-----END)/g, group: 1, severity: 'critical', fix: 'Treat the key as compromised: replace it (new SSH key, TLS certificate or signing key) and remove it from the code and its history.' },
  { id: 'url-credentials', name: 'Password in a URL', keywords: ['://'], pattern: /\b(https?:\/\/[A-Za-z0-9._%-]+:([^@\s'"`/]{6,})@[A-Za-z0-9.-]+)/g, group: 1, severity: 'medium', accept: (s) => !isPlaceholder(s), fix: 'Remove the password from the URL, change it, and send credentials in a header loaded from configuration.' },
  { id: 'generic-secret', name: 'Possible hard-coded secret', keywords: ['secret', 'token', 'apikey', 'api_key', 'api-key', 'password', 'passwd', 'client_secret'], pattern: /\b(?:client[_-]?secret|api[_-]?key|access[_-]?token|auth[_-]?token|secret[_-]?key|private[_-]?key|password|passwd)['"]?\s*[:=]\s*['"`]([^'"`\s]{16,})['"`]/gi, group: 1, severity: 'medium', minEntropy: 3.8, accept: (s) => !isPlaceholder(s) && !/^(true|false|null|undefined)$/i.test(s) && !/^[a-z]+(?:[A-Z][a-z]+)+$/.test(s), fix: 'If this is a real credential, rotate it and load it from an environment variable or secrets manager. If it is a placeholder, rename it so scanners and people do not mistake it for one.' },
];
