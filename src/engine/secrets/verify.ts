/**
 * Sightline Secrets — optional verification (MIT).
 *
 * Asks the provider whether a found key is live, with one read-only "who am I" request per key.
 * Nothing is created, changed, sent or charged. Using someone else's leaked key is unauthorised
 * access, so callers must only verify after the user confirms they own the site or repository;
 * the public web version never verifies.
 */
import { fetchUrl } from '../util';
import type { VerifyState } from './scan';

type Verifier = (secret: string) => Promise<VerifyState>;

const byStatus = (live: number[], dead: number[]) => async (p: Promise<{ status: number }>): Promise<VerifyState> => {
  const r = await p;
  return live.includes(r.status) ? 'verified' : dead.includes(r.status) ? 'invalid' : 'unverified';
};
const get = (url: string, headers: Record<string, string>) => fetchUrl(url, { headers, timeout: 10000, maxRedirects: 0, maxBytes: 64 * 1024 });
const basic = (user: string, pass: string) => `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
const standard = byStatus([200], [401, 403]);

export const VERIFIERS: Record<string, Verifier> = {
  'github-token': (s) => standard(get('https://api.github.com/user', { authorization: `token ${s}`, accept: 'application/vnd.github+json' })),
  'github-fine-grained': (s) => standard(get('https://api.github.com/user', { authorization: `token ${s}`, accept: 'application/vnd.github+json' })),
  'gitlab-token': (s) => standard(get('https://gitlab.com/api/v4/user', { 'private-token': s })),
  'npm-token': (s) => standard(get('https://registry.npmjs.org/-/whoami', { authorization: `Bearer ${s}` })),
  'stripe-secret': (s) => standard(get('https://api.stripe.com/v1/balance', { authorization: basic(s, '') })),
  'stripe-test': (s) => standard(get('https://api.stripe.com/v1/balance', { authorization: basic(s, '') })),
  'openai': (s) => standard(get('https://api.openai.com/v1/models', { authorization: `Bearer ${s}` })),
  'anthropic': (s) => standard(get('https://api.anthropic.com/v1/models', { 'x-api-key': s, 'anthropic-version': '2023-06-01' })),
  'huggingface': (s) => standard(get('https://huggingface.co/api/whoami-v2', { authorization: `Bearer ${s}` })),
  'groq': (s) => standard(get('https://api.groq.com/openai/v1/models', { authorization: `Bearer ${s}` })),
  'replicate': (s) => standard(get('https://api.replicate.com/v1/account', { authorization: `Bearer ${s}` })),
  'sendgrid': (s) => standard(get('https://api.sendgrid.com/v3/scopes', { authorization: `Bearer ${s}` })),
  'mailchimp': (s) => standard(get(`https://${s.split('-').pop()}.api.mailchimp.com/3.0/`, { authorization: basic('sightline', s) })),
  'mailgun': (s) => standard(get('https://api.mailgun.net/v3/domains', { authorization: basic('api', s) })),
  'digitalocean': (s) => standard(get('https://api.digitalocean.com/v2/account', { authorization: `Bearer ${s}` })),
  'cloudflare-api-token': (s) => standard(get('https://api.cloudflare.com/client/v4/user/tokens/verify', { authorization: `Bearer ${s}` })),
  'telegram-bot': async (s) => { const r = await get(`https://api.telegram.org/bot${s}/getMe`, {}); return r.status === 200 && /"ok":true/.test(r.body) ? 'verified' : r.status === 401 || r.status === 404 ? 'invalid' : 'unverified'; },
  'slack-token': async (s) => { const r = await get('https://slack.com/api/auth.test', { authorization: `Bearer ${s}` }); return /"ok":\s*true/.test(r.body) ? 'verified' : /invalid_auth|not_authed|token_revoked|account_inactive/.test(r.body) ? 'invalid' : 'unverified'; },
  'discord-bot': (s) => standard(get('https://discord.com/api/v10/users/@me', { authorization: `Bot ${s}` })),
  'linear': (s) => standard(get('https://api.linear.app/graphql?query=%7Bviewer%7Bid%7D%7D', { authorization: s })),
  'figma': (s) => standard(get('https://api.figma.com/v1/me', { 'x-figma-token': s })),
  'sentry-token': (s) => standard(get('https://sentry.io/api/0/', { authorization: `Bearer ${s}` })),
  'newrelic': (s) => standard(get('https://api.newrelic.com/v2/users.json', { 'api-key': s })),
};

export const canVerify = (detector: string): boolean => detector in VERIFIERS;

/** Verifies one secret; any network problem leaves it "unverified". */
export async function verifySecret(detector: string, secret: string): Promise<VerifyState> {
  const v = VERIFIERS[detector];
  if (!v) return 'not-checked';
  try { return await v(secret); } catch { return 'unverified'; }
}
