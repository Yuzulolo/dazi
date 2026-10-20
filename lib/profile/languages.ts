// Languages a person speaks (phase 7a PR B). Known languages are stored as ISO 639 codes
// ("en"), anything else as its normalised name ("Swahili"). Matching compares stored values
// exactly (languages && languages in private.match_candidates), so EVERY value goes through
// normalizeLanguage() first: trim, case, accents and aliases ("Englisch" → en, "中文" → zh).
// The database only checks the shape (≤ 10 items, each 1–30 characters, no contact details —
// supabase/migrations/20261020143000_languages_custom.sql). No imports: unit tests load it.

export const MAX_LANGUAGES = 8;
export const MAX_LANGUAGE_LENGTH = 30;

type Language = { value: string; label: string; aliases: string[] };

// Common languages. The first 20 are the original fixed list (existing rows use them).
export const LANGUAGE_LIST: Language[] = [
  { value: "en", label: "English", aliases: ["englisch", "anglais", "inglés", "ingles", "inglese", "英语", "英文", "英語", "영어"] },
  { value: "de", label: "German", aliases: ["deutsch", "allemand", "alemán", "aleman", "tedesco", "德语", "德文", "ドイツ語", "독일어"] },
  { value: "zh", label: "Chinese", aliases: ["mandarin", "chinesisch", "chinois", "chino", "cinese", "中文", "汉语", "漢語", "普通话", "國語", "华语", "中国語", "중국어"] },
  { value: "es", label: "Spanish", aliases: ["español", "espanol", "castellano", "spanisch", "espagnol", "spagnolo", "西班牙语", "スペイン語"] },
  { value: "fr", label: "French", aliases: ["français", "francais", "französisch", "franzosisch", "francés", "frances", "francese", "法语", "フランス語"] },
  { value: "it", label: "Italian", aliases: ["italiano", "italienisch", "italien", "意大利语"] },
  { value: "pt", label: "Portuguese", aliases: ["português", "portugues", "portugiesisch", "portugais", "葡萄牙语"] },
  { value: "ru", label: "Russian", aliases: ["русский", "russisch", "russe", "ruso", "俄语"] },
  { value: "ja", label: "Japanese", aliases: ["日本語", "日语", "japanisch", "japonais", "japonés", "japones", "일본어"] },
  { value: "ko", label: "Korean", aliases: ["한국어", "韩语", "韓国語", "koreanisch", "coréen", "coreen", "coreano"] },
  { value: "ar", label: "Arabic", aliases: ["العربية", "arabisch", "arabe", "árabe", "阿拉伯语"] },
  { value: "tr", label: "Turkish", aliases: ["türkçe", "turkce", "türkisch", "turkisch", "turc", "turco"] },
  { value: "pl", label: "Polish", aliases: ["polski", "polnisch", "polonais", "polaco"] },
  { value: "nl", label: "Dutch", aliases: ["nederlands", "niederländisch", "niederlandisch", "néerlandais", "flemish", "vlaams"] },
  { value: "hi", label: "Hindi", aliases: ["हिन्दी", "हिंदी"] },
  { value: "uk", label: "Ukrainian", aliases: ["українська", "ukrainisch", "ukrainien"] },
  { value: "sv", label: "Swedish", aliases: ["svenska", "schwedisch", "suédois", "suedois"] },
  { value: "da", label: "Danish", aliases: ["dansk", "dänisch", "danisch", "danois"] },
  { value: "el", label: "Greek", aliases: ["ελληνικά", "griechisch", "grec", "griego"] },
  { value: "vi", label: "Vietnamese", aliases: ["tiếng việt", "tieng viet", "vietnamesisch", "越南语"] },
  { value: "yue", label: "Cantonese", aliases: ["粵語", "粤语", "廣東話", "广东话", "kantonesisch"] },
  { value: "th", label: "Thai", aliases: ["ภาษาไทย", "thailändisch", "thailandisch", "泰语"] },
  { value: "id", label: "Indonesian", aliases: ["bahasa indonesia", "indonesisch"] },
  { value: "ms", label: "Malay", aliases: ["bahasa melayu", "malaiisch"] },
  { value: "tl", label: "Tagalog", aliases: ["filipino", "pilipino"] },
  { value: "bn", label: "Bengali", aliases: ["বাংলা", "bangla"] },
  { value: "ur", label: "Urdu", aliases: ["اردو"] },
  { value: "fa", label: "Persian", aliases: ["farsi", "فارسی", "persisch"] },
  { value: "he", label: "Hebrew", aliases: ["עברית", "hebräisch", "hebraisch"] },
  { value: "cs", label: "Czech", aliases: ["čeština", "cestina", "tschechisch"] },
  { value: "sk", label: "Slovak", aliases: ["slovenčina", "slovencina", "slowakisch"] },
  { value: "hu", label: "Hungarian", aliases: ["magyar", "ungarisch"] },
  { value: "ro", label: "Romanian", aliases: ["română", "romana", "rumänisch", "rumanisch"] },
  { value: "bg", label: "Bulgarian", aliases: ["български", "bulgarisch"] },
  { value: "hr", label: "Croatian", aliases: ["hrvatski", "kroatisch"] },
  { value: "sr", label: "Serbian", aliases: ["српски", "srpski", "serbisch"] },
  { value: "sl", label: "Slovenian", aliases: ["slovene", "slovenščina", "slowenisch"] },
  { value: "fi", label: "Finnish", aliases: ["suomi", "finnisch"] },
  { value: "no", label: "Norwegian", aliases: ["norsk", "norwegisch", "bokmål", "bokmal", "nb", "nn"] },
  { value: "is", label: "Icelandic", aliases: ["íslenska", "islenska", "isländisch"] },
  { value: "et", label: "Estonian", aliases: ["eesti", "estnisch"] },
  { value: "lv", label: "Latvian", aliases: ["latviešu", "lettisch"] },
  { value: "lt", label: "Lithuanian", aliases: ["lietuvių", "litauisch"] },
  { value: "ca", label: "Catalan", aliases: ["català", "catala", "katalanisch"] },
  { value: "ga", label: "Irish", aliases: ["gaeilge", "irish gaelic"] },
  { value: "sw", label: "Swahili", aliases: ["kiswahili", "suaheli"] },
  { value: "ta", label: "Tamil", aliases: ["தமிழ்"] },
  { value: "pa", label: "Punjabi", aliases: ["ਪੰਜਾਬੀ", "panjabi"] },
  { value: "asl", label: "Sign language (ASL)", aliases: ["american sign language"] },
  { value: "dgs", label: "German Sign Language (DGS)", aliases: ["deutsche gebärdensprache", "gebärdensprache"] },
];

// Comparison key: Unicode-normalised, lower case, single spaces, accents removed from
// Latin / Greek / Cyrillic letters only — in Devanagari, Thai, … the marks are vowels (review S5).
export function languageKey(raw: string) {
  return raw
    .normalize("NFKD")
    .replace(/([\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}])\p{M}+/gu, "$1")
    .normalize("NFC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const BY_KEY = new Map<string, string>();
for (const l of LANGUAGE_LIST) {
  for (const name of [l.value, l.label, ...l.aliases]) BY_KEY.set(languageKey(name), l.value);
}
const LABELS = new Map(LANGUAGE_LIST.map((l) => [l.value, l.label]));

// One canonical form per custom language, so two people typing it differently still match
// exactly in SQL: "low german" / "LOW German" → "Low German" (review S1). Trade-off: "isiZulu" →
// "Isizulu". Accents still count ("Plattdüütsch" ≠ "Plattduutsch").
function tidyCustom(text: string) {
  return text.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}

// One raw entry → a stored value: a known code, or the tidied custom name. Empty → null.
export function normalizeLanguage(raw: string): string | null {
  const text = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return BY_KEY.get(languageKey(text)) ?? tidyCustom(text);
}

// Raw form values → stored values, de-duplicated (case- and accent-insensitive), order kept.
export function normalizeLanguages(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    const value = normalizeLanguage(r);
    if (value === null || seen.has(languageKey(value))) continue;
    seen.add(languageKey(value));
    out.push(value);
  }
  return out;
}

export function isKnownLanguage(value: string) {
  return LABELS.has(value);
}

// Stored value → what people see ("en" → "English", "Swahili" → "Swahili").
export function languageLabel(value: string) {
  return LABELS.get(value) ?? value;
}

// Known languages whose name, code or alias contains the query. Order: exact code / name /
// alias ("sw" → Swahili, "Englisch" → English), then names starting with it, then the rest.
export function searchLanguages(query: string, exclude: string[] = []) {
  const q = languageKey(query);
  const pool = LANGUAGE_LIST.filter((l) => !exclude.includes(l.value));
  if (!q) return pool;
  const rank = (l: Language) => {
    const name = languageKey(l.label);
    if (BY_KEY.get(q) === l.value) return 0;
    if (name.startsWith(q)) return 1;
    if (name.includes(q)) return 2;
    if (l.aliases.some((a) => languageKey(a).includes(q))) return 3;
    return 4;
  };
  return pool
    .map((l) => ({ l, r: rank(l) }))
    .filter(({ r }) => r < 4)
    .sort((a, b) => a.r - b.r)
    .map(({ l }) => l);
}
