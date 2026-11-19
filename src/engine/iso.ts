/** ISO 639-1 language codes. */
export const LANGS = new Set(
  ('aa ab ae af ak am an ar as av ay az ba be bg bh bi bm bn bo br bs ca ce ch co cr cs cu cv cy da de dv dz ee el en eo es et eu ' +
    'fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km kn ko ' +
    'kr ks ku kv kw ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj om or os pa pi ' +
    'pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ' +
    'ur uz ve vi vo wa wo xh yi yo za zh zu').split(' '),
);

/** ISO 3166-1 alpha-2 region codes, plus 419 (Latin America) used widely in hreflang. */
export const REGIONS = new Set(
  ('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG ' +
    'CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM ' +
    'GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC ' +
    'LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ ' +
    'OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC ' +
    'TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW 419').split(' '),
);

/** Common mistakes and what was probably meant. */
export const COMMON_MISTAKES: Record<string, string> = {
  uk: 'Region "UK" is invalid — use "GB" (e.g. en-GB). As a language, "uk" means Ukrainian.',
  eu: 'There is no "EU" region code in ISO 3166-1.',
  jp: '"jp" is a region; the Japanese language code is "ja".',
  cn: '"cn" is a region; the Chinese language code is "zh" (e.g. zh-CN, zh-Hans).',
  kr: '"kr" is Kanuri; for Korean use "ko".',
  dk: '"dk" is a region; Danish is "da".',
  se: '"se" is Northern Sami; Swedish is "sv".',
  gr: '"gr" is a region; Greek is "el".',
  cz: '"cz" is a region; Czech is "cs".',
  ua: '"ua" is a region; Ukrainian is "uk".',
};

export const SCRIPTS = new Set(['Hans', 'Hant', 'Latn', 'Cyrl', 'Arab', 'Deva', 'Hebr', 'Grek', 'Thai', 'Beng', 'Guru', 'Taml']);

export interface CodeCheck { valid: boolean; lang?: string; region?: string; reason?: string }

export function validateHreflang(code: string): CodeCheck {
  if (code.toLowerCase() === 'x-default') return { valid: true, lang: 'x-default' };
  if (code.includes('_')) return { valid: false, reason: `Use a hyphen, not an underscore ("${code.replace('_', '-')}").` };
  const parts = code.split('-');
  const lang = parts[0].toLowerCase();
  if (!LANGS.has(lang)) return { valid: false, reason: COMMON_MISTAKES[lang] ?? `"${parts[0]}" is not an ISO 639-1 language code.` };
  let i = 1;
  if (parts[i] && parts[i].length === 4) {
    const s = parts[i][0].toUpperCase() + parts[i].slice(1).toLowerCase();
    if (!SCRIPTS.has(s)) return { valid: false, reason: `Unknown script subtag "${parts[i]}".` };
    i++;
  }
  if (parts[i]) {
    const region = parts[i].toUpperCase();
    if (!REGIONS.has(region)) return { valid: false, reason: COMMON_MISTAKES[region.toLowerCase()] ?? `"${parts[i]}" is not an ISO 3166-1 region code.` };
    i++;
    if (parts.length > i) return { valid: false, reason: 'Too many subtags.' };
    return { valid: true, lang, region };
  }
  if (parts.length > i) return { valid: false, reason: 'Too many subtags.' };
  return { valid: true, lang };
}
