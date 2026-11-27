/* Strings for the security audits, keyed by language (not by position, so rows cannot shift). */

export const SECURITY_EN = {
  'cat.security': 'Cloudflare security',
  'cat.secrets': 'Exposed secrets',
};

export type SecurityKey = keyof typeof SECURITY_EN;

export const SECURITY: Record<string, Partial<Record<SecurityKey, string>>> = {
  es: { 'cat.security': 'Seguridad de Cloudflare', 'cat.secrets': 'Secretos expuestos' },
  fr: { 'cat.security': 'Sécurité Cloudflare', 'cat.secrets': 'Secrets exposés' },
  de: { 'cat.security': 'Cloudflare-Sicherheit', 'cat.secrets': 'Offengelegte Geheimnisse' },
  pt: { 'cat.security': 'Segurança da Cloudflare', 'cat.secrets': 'Segredos expostos' },
  it: { 'cat.security': 'Sicurezza Cloudflare', 'cat.secrets': 'Segreti esposti' },
  ru: { 'cat.security': 'Безопасность Cloudflare', 'cat.secrets': 'Утёкшие секреты' },
  tr: { 'cat.security': 'Cloudflare güvenliği', 'cat.secrets': 'Açığa çıkan gizli anahtarlar' },
  ar: { 'cat.security': 'أمان Cloudflare', 'cat.secrets': 'أسرار مكشوفة' },
  ur: { 'cat.security': 'Cloudflare سیکیورٹی', 'cat.secrets': 'ظاہر شدہ خفیہ کلیدیں' },
  hi: { 'cat.security': 'Cloudflare सुरक्षा', 'cat.secrets': 'उजागर सीक्रेट्स' },
  zh: { 'cat.security': 'Cloudflare 安全', 'cat.secrets': '泄露的密钥' },
  ja: { 'cat.security': 'Cloudflare セキュリティ', 'cat.secrets': '漏えいした秘密情報' },
  ko: { 'cat.security': 'Cloudflare 보안', 'cat.secrets': '노출된 비밀 키' },
};
