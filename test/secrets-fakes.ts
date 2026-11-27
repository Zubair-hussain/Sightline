/**
 * Fake credentials for the secrets tests. They are assembled at run time from pieces, so no
 * credential-shaped string exists in the repository (GitHub push protection and other scanners
 * would otherwise flag this file). None of them is, or ever was, a real key.
 */
const ALNUM = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** Deterministic pseudo-random text over `alphabet` (no "example"-style words, no repeats). */
export function fake(n: number, alphabet = ALNUM, seed = 7): string {
  let x = seed;
  let out = '';
  for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) % 2147483648; out += alphabet[x % alphabet.length]; }
  return out;
}

const j = (...parts: string[]) => parts.join('');
const b64url = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');

export const FAKES: Record<string, string> = {
  'aws-access-key': j('AK', 'IA', fake(16, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567', 3)),
  'github-token': j('gh', 'p_', fake(36, ALNUM, 11)),
  'github-fine-grained': j('github', '_pat_', fake(82, ALNUM + '_', 13)),
  'gitlab-token': j('gl', 'pat-', fake(20, ALNUM, 17)),
  'npm-token': j('np', 'm_', fake(36, ALNUM, 19)),
  'stripe-secret': j('sk', '_live_', fake(24, ALNUM, 23)),
  'openai': j('sk-', 'proj-', fake(20, ALNUM, 29), 'T3Blbk', 'FJ', fake(20, ALNUM, 31)),
  'anthropic': j('sk-', 'ant-', 'api03-', fake(90, ALNUM + '-_', 37)),
  'slack-token': j('xo', 'xb-', fake(12, '0123456789', 41), '-', fake(24, ALNUM, 43)),
  'sendgrid': j('S', 'G.', fake(22, ALNUM, 47), '.', fake(43, ALNUM, 53)),
  'google-api-key': j('AI', 'za', fake(35, ALNUM, 59)),
  'huggingface': j('h', 'f_', fake(34, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 61)),
  'private-key': j('-----BEGIN ', 'RSA PRIVATE KEY-----\n', fake(64, ALNUM + '+/', 67), '\n', fake(64, ALNUM + '+/', 71), '\n-----END RSA PRIVATE KEY-----'),
  'database-url': j('postgres', '://app:', fake(18, ALNUM, 73), '@db.acme-prod.net:5432/main'),
  'supabase-service-role': j(b64url({ alg: 'HS256', typ: 'JWT' }), '.', b64url({ iss: 'supabase', role: 'service_role', ref: fake(20, 'abcdefghijklmnopqrstuvwxyz', 79) }), '.', fake(43, ALNUM + '-_', 83)),
};

/** The public Supabase anon key has the same shape but must not be reported. */
export const SUPABASE_ANON = j(b64url({ alg: 'HS256', typ: 'JWT' }), '.', b64url({ iss: 'supabase', role: 'anon', ref: fake(20, 'abcdefghijklmnopqrstuvwxyz', 89) }), '.', fake(43, ALNUM + '-_', 97));
