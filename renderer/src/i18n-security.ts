/* Strings for the security audits, keyed by language (not by position, so rows cannot shift). */

export const SECURITY_EN = {
  'cat.security': 'Cloudflare security',
};

export type SecurityKey = keyof typeof SECURITY_EN;

export const SECURITY: Record<string, Partial<Record<SecurityKey, string>>> = {
  es: { 'cat.security': 'Seguridad de Cloudflare' },
  fr: { 'cat.security': 'Sécurité Cloudflare' },
  de: { 'cat.security': 'Cloudflare-Sicherheit' },
  pt: { 'cat.security': 'Segurança da Cloudflare' },
  it: { 'cat.security': 'Sicurezza Cloudflare' },
  ru: { 'cat.security': 'Безопасность Cloudflare' },
  tr: { 'cat.security': 'Cloudflare güvenliği' },
  ar: { 'cat.security': 'أمان Cloudflare' },
  ur: { 'cat.security': 'Cloudflare سیکیورٹی' },
  hi: { 'cat.security': 'Cloudflare सुरक्षा' },
  zh: { 'cat.security': 'Cloudflare 安全' },
  ja: { 'cat.security': 'Cloudflare セキュリティ' },
  ko: { 'cat.security': 'Cloudflare 보안' },
};
