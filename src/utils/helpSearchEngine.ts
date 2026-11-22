import type {
  HelpAssistantRole,
  HelpKbCategory,
  HelpKbItem,
  HelpKbPayload,
} from '../types';

export interface HelpSearchResult {
  item: HelpKbItem;
  score: number;
  matchedTokens: number;
}

interface NormalizedToken {
  raw: string;
  folded: string;
  stem: string;
  isMalayalam: boolean;
  mask: number;
  rawMask: number;
}

interface NormalizedQuery {
  tokens: NormalizedToken[];
  normalizedPhrase: string;
  rawLower: string;
}

interface IndexedHelpItem {
  item: HelpKbItem;
  latinSingleTokens: NormalizedToken[];
  latinPhraseTokens: NormalizedToken[];
  latinQuestionTokens: NormalizedToken[];
  mlSingleTokens: NormalizedToken[];
  mlPhraseTokens: NormalizedToken[];
  mlQuestionTokens: NormalizedToken[];
  normalizedPhrases: string[];
  rawPhrasesLower: string[];
  questionLower: string;
  answerLower: string;
  keywordsJoinedLower: string;
}

const STOPWORDS = new Set([
  'how',
  'to',
  'is',
  'the',
  'in',
  'for',
  'a',
  'an',
  'of',
  'on',
  'my',
  'i',
  'me',
  'do',
  'can',
  'oru',
  'entha',
  'enthanu',
  'engane',
  'aanu',
  'anu',
  'aayo',
  'ayo',
  'ano',
  'aano',
  'എങ്ങനെ',
  'എന്താണ്',
  'ആണ്',
  'ഒരു',
]);

const MALAYALAM_SUFFIXES = [
  'കളിൽ',
  'കളുടെ',
  'കൾക്ക്',
  'യിൽ',
  'യുടെ',
  'ക്ക്',
  'ന്റെ',
  'കൾ',
  'ആണ്',
];

const MALAYALAM_RE = /[\u0D00-\u0D7F]/;

const QUICK_QUESTION_IDS: Record<HelpAssistantRole, readonly string[]> = {
  ADMIN: [
    'admin_direct_order',
    'admin_reset_requests',
    'admin_settings_control',
    'rep_pdf_csv',
  ],
  SECTOR: [
    'sector_manage_units',
    'order_edit_delete',
    'pay_mark_as_paid',
    'rep_pdf_csv',
  ],
  UNIT: [
    'order_unit_add',
    'code_find_unit_code',
    'pay_mark_as_paid',
    'rep_whatsapp_receipt',
  ],
  LOGIN: [
    'auth_forgot_password',
    'auth_login_failed',
    'auth_first_login',
    'auth_session_14days',
  ],
  PUBLIC: [
    'code_public_order',
    'code_find_unit_code',
    'order_global_lock',
    'tech_install_pwa',
  ],
};

const indexedKbCache = new WeakMap<HelpKbPayload, IndexedHelpItem[]>();

export function foldManglish(raw: string): string {
  const clean = raw.toLowerCase().replace(/[^a-z0-9.]/g, '');
  if (!clean) return '';

  return clean
    .replace(/ch/g, '~')
    .replace(/ck/g, 'k')
    .replace(/aa/g, 'a')
    .replace(/ee|ea|ey/g, 'i')
    .replace(/oo|ou/g, 'u')
    .replace(/ai/g, 'e')
    .replace(/th/g, 't')
    .replace(/dh/g, 'd')
    .replace(/kh/g, 'k')
    .replace(/gh/g, 'g')
    .replace(/bh/g, 'b')
    .replace(/ph/g, 'f')
    .replace(/sh/g, 's')
    .replace(/zh/g, 'l')
    .replace(/c(?=[aoulr]|$)/g, 'k')
    .replace(/c(?=[eiy])/g, 's')
    .replace(/~/g, 'c')
    .replace(/([a-z])\1+/g, '$1');
}

function stemLatin(tok: string): string {
  if (tok.length >= 5 && tok.endsWith('s') && !tok.endsWith('ss')) {
    return tok.slice(0, -1);
  }
  return tok;
}

function stripMalayalamSuffix(tok: string): string {
  for (const suffix of MALAYALAM_SUFFIXES) {
    if (tok.endsWith(suffix) && tok.length - suffix.length >= 3) {
      return tok.slice(0, tok.length - suffix.length);
    }
  }
  return tok;
}

function computeCharMask(s: string): number {
  let mask = 0;
  for (let i = 0; i < s.length; i += 1) {
    const code = s.charCodeAt(i);
    if (code >= 97 && code <= 122) {
      mask |= 1 << (code - 97);
    } else if (code >= 48 && code <= 57) {
      mask |= 1 << (26 + ((code - 48) % 6));
    }
  }
  return mask;
}

function popcount32(x: number): number {
  let n = x - ((x >>> 1) & 0x55555555);
  n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
  return (((n + (n >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

function tokenizeText(input: string, dropStopwords: boolean): NormalizedToken[] {
  const nfc = input.normalize('NFC').toLowerCase().trim();
  if (!nfc) return [];

  const withSymbols =
    nfc === '-'
      ? 'minus'
      : nfc
          .replace(/%/g, ' percent ')
          .replace(/(\d)\.(\d)/g, '$1__DEC_DOT__$2')
          .replace(/[?!.,'"()/:;+•&₹\-]+/g, ' ')
          .replace(/__DEC_DOT__/g, '.');

  const rawParts = withSymbols.split(/\s+/).filter(Boolean);
  const tokens: NormalizedToken[] = [];

  for (const part of rawParts) {
    if (MALAYALAM_RE.test(part)) {
      const cleanedMl = part.replace(/[^\u0D00-\u0D7Fa-z0-9]/g, '');
      if (!cleanedMl) continue;
      const stripped = stripMalayalamSuffix(cleanedMl);
      tokens.push({
        raw: cleanedMl,
        folded: stripped,
        stem: stripped,
        isMalayalam: true,
        mask: 0,
        rawMask: 0,
      });
    } else {
      const cleanedLatin = part.replace(/[^a-z0-9.]/g, '');
      if (!cleanedLatin) continue;
      const folded = foldManglish(cleanedLatin);
      if (!folded) continue;
      tokens.push({
        raw: cleanedLatin,
        folded,
        stem: stemLatin(folded),
        isMalayalam: false,
        mask: computeCharMask(folded),
        rawMask: computeCharMask(cleanedLatin),
      });
    }
  }

  if (!dropStopwords || tokens.length <= 1) {
    return tokens;
  }

  const meaningful = tokens.filter(
    (tok) => !STOPWORDS.has(tok.raw) && !STOPWORDS.has(tok.folded)
  );
  return meaningful.length > 0 ? meaningful : tokens;
}

export function normalizeQuery(input: string): NormalizedQuery {
  const rawLower = input.normalize('NFC').toLowerCase().trim();
  const tokens = tokenizeText(rawLower, true);
  return {
    tokens,
    normalizedPhrase: tokens.map((t) => t.folded).join(' '),
    rawLower,
  };
}

const MAX_STACK_DP_LEN = 64;
const dpRowBuf0 = new Int32Array(MAX_STACK_DP_LEN);
const dpRowBuf1 = new Int32Array(MAX_STACK_DP_LEN);
const dpRowBuf2 = new Int32Array(MAX_STACK_DP_LEN);

export function boundedEditDistance(
  a: string,
  b: string,
  maxDist = 2
): number {
  if (a === b) return 0;
  const lenA = a.length;
  const lenB = b.length;
  if (Math.abs(lenA - lenB) > maxDist) return maxDist + 1;
  if (lenA === 0) return lenB;
  if (lenB === 0) return lenA;

  const needed = lenB + 1;
  let r0 = needed <= MAX_STACK_DP_LEN ? dpRowBuf0 : new Int32Array(needed);
  let r1 = needed <= MAX_STACK_DP_LEN ? dpRowBuf1 : new Int32Array(needed);
  let r2 = needed <= MAX_STACK_DP_LEN ? dpRowBuf2 : new Int32Array(needed);

  for (let j = 0; j <= lenB; j += 1) {
    r1[j] = j;
  }

  for (let i = 1; i <= lenA; i += 1) {
    r2[0] = i;
    let rowMin = i;
    const ca = a.charCodeAt(i - 1);
    const caPrev = i > 1 ? a.charCodeAt(i - 2) : 0;

    for (let j = 1; j <= lenB; j += 1) {
      const cb = b.charCodeAt(j - 1);
      let val = r1[j] + 1;
      const ins = r2[j - 1] + 1;
      if (ins < val) val = ins;
      const sub = r1[j - 1] + (ca === cb ? 0 : 1);
      if (sub < val) val = sub;

      // Adjacent transposition (Damerau-Levenshtein OSA) with cost 1
      if (
        i > 1 &&
        j > 1 &&
        ca === b.charCodeAt(j - 2) &&
        caPrev === cb
      ) {
        const trans = r0[j - 2] + 1;
        if (trans < val) val = trans;
      }

      r2[j] = val;
      if (val < rowMin) rowMin = val;
    }

    if (rowMin > maxDist) {
      return maxDist + 1;
    }

    const tmp = r0;
    r0 = r1;
    r1 = r2;
    r2 = tmp;
  }

  return r1[lenB];
}

function getIndexedKb(kb: HelpKbPayload): IndexedHelpItem[] {
  const cached = indexedKbCache.get(kb);
  if (cached) return cached;

  const indexed: IndexedHelpItem[] = kb.items.map((item) => {
    const latinSingleTokens: NormalizedToken[] = [];
    const latinPhraseTokens: NormalizedToken[] = [];
    const mlSingleTokens: NormalizedToken[] = [];
    const mlPhraseTokens: NormalizedToken[] = [];
    const normalizedPhrases: string[] = [];
    const rawPhrasesLower: string[] = [];

    for (const kw of item.keywords) {
      const trimmed = kw.normalize('NFC').trim();
      if (!trimmed) continue;

      const kTokens = tokenizeText(trimmed, false);
      if (kTokens.length === 1) {
        const tok = kTokens[0];
        if (tok.isMalayalam) mlSingleTokens.push(tok);
        else latinSingleTokens.push(tok);
      } else if (kTokens.length > 1) {
        const meaningful = kTokens.filter(
          (t) => !STOPWORDS.has(t.raw) && !STOPWORDS.has(t.folded)
        );
        const phraseTokens = meaningful.length > 0 ? meaningful : kTokens;
        for (const tok of phraseTokens) {
          if (tok.isMalayalam) mlPhraseTokens.push(tok);
          else latinPhraseTokens.push(tok);
        }

        normalizedPhrases.push(phraseTokens.map((t) => t.folded).join(' '));
        rawPhrasesLower.push(trimmed.toLowerCase());
      }
    }

    const qTokens = tokenizeText(item.question, true);
    const latinQuestionTokens: NormalizedToken[] = [];
    const mlQuestionTokens: NormalizedToken[] = [];
    for (const qt of qTokens) {
      if (qt.isMalayalam) mlQuestionTokens.push(qt);
      else latinQuestionTokens.push(qt);
    }

    return {
      item,
      latinSingleTokens,
      latinPhraseTokens,
      latinQuestionTokens,
      mlSingleTokens,
      mlPhraseTokens,
      mlQuestionTokens,
      normalizedPhrases,
      rawPhrasesLower,
      questionLower: item.question.normalize('NFC').toLowerCase(),
      answerLower: item.answer.normalize('NFC').toLowerCase(),
      keywordsJoinedLower: item.keywords
        .join(' ')
        .normalize('NFC')
        .toLowerCase(),
    };
  });

  indexedKbCache.set(kb, indexed);
  return indexed;
}

export function isItemVisibleForRole(
  item: HelpKbItem,
  role: HelpAssistantRole
): boolean {
  if (item.roles.includes('ALL')) return true;
  if (role === 'ADMIN' || role === 'SECTOR' || role === 'UNIT') {
    return item.roles.includes(role);
  }
  return false;
}

export function getVisibleCategories(
  kb: HelpKbPayload,
  role: HelpAssistantRole
): HelpKbCategory[] {
  const activeCategoryIds = new Set<string>();
  for (const item of kb.items) {
    if (isItemVisibleForRole(item, role)) {
      activeCategoryIds.add(item.category);
    }
  }
  return kb.categories.filter((cat) => activeCategoryIds.has(cat.id));
}

export function getQuickQuestionsForRole(
  kb: HelpKbPayload,
  role: HelpAssistantRole,
  limit = 4
): HelpKbItem[] {
  const visibleItems = kb.items.filter((item) =>
    isItemVisibleForRole(item, role)
  );
  const byId = new Map(visibleItems.map((item) => [item.id, item]));
  const selected: HelpKbItem[] = [];
  const used = new Set<string>();

  for (const id of QUICK_QUESTION_IDS[role]) {
    const found = byId.get(id);
    if (found && !used.has(found.id)) {
      selected.push(found);
      used.add(found.id);
    }
    if (selected.length >= limit) break;
  }

  for (const item of visibleItems) {
    if (selected.length >= limit) break;
    if (!used.has(item.id)) {
      selected.push(item);
      used.add(item.id);
    }
  }

  return selected;
}

function scoreMalayalamToken(
  tok: NormalizedToken,
  entry: IndexedHelpItem
): number {
  let best = 0;

  for (const kw of entry.mlSingleTokens) {
    if (tok.raw === kw.raw || tok.stem === kw.stem) {
      return 40;
    }
    if (
      Math.min(tok.stem.length, kw.stem.length) >= 3 &&
      (kw.stem.startsWith(tok.stem) || tok.stem.startsWith(kw.stem))
    ) {
      best = Math.max(best, 26);
    }
  }

  for (const kw of entry.mlPhraseTokens) {
    if (tok.raw === kw.raw || tok.stem === kw.stem) {
      best = Math.max(best, 34);
    } else if (
      Math.min(tok.stem.length, kw.stem.length) >= 3 &&
      (kw.stem.startsWith(tok.stem) || tok.stem.startsWith(kw.stem))
    ) {
      best = Math.max(best, 24);
    }
  }

  for (const qt of entry.mlQuestionTokens) {
    if (tok.raw === qt.raw || tok.stem === qt.stem) {
      best = Math.max(best, 30);
    } else if (
      Math.min(tok.stem.length, qt.stem.length) >= 3 &&
      (qt.stem.startsWith(tok.stem) || tok.stem.startsWith(qt.stem))
    ) {
      best = Math.max(best, 24);
    }
  }

  if (
    best < 22 &&
    (entry.questionLower.includes(tok.stem) ||
      entry.keywordsJoinedLower.includes(tok.stem))
  ) {
    best = 22;
  }

  if (
    best < 12 &&
    tok.stem.length >= 3 &&
    entry.answerLower.includes(tok.stem)
  ) {
    best = 12;
  }

  return best;
}

function scoreLatinKeywordGroup(
  tok: NormalizedToken,
  keywords: NormalizedToken[],
  exactScore: number
): number {
  if (keywords.length === 0) return 0;
  let best = 0;

  // Fast pass: exact & prefix checks without fuzzy edit-distance calls
  for (const kw of keywords) {
    if (
      tok.folded === kw.folded ||
      tok.raw === kw.raw ||
      tok.stem === kw.stem
    ) {
      return exactScore;
    }

    if (
      tok.folded.length >= 3 &&
      (kw.folded.startsWith(tok.folded) || kw.raw.startsWith(tok.raw))
    ) {
      best = 26;
    } else if (
      best < 16 &&
      tok.folded.length === 2 &&
      (kw.folded.startsWith(tok.folded) || kw.raw.startsWith(tok.raw))
    ) {
      best = 16;
    }
  }

  if (best >= 26) {
    return best;
  }

  // Fuzzy pass: bitmask pre-filter eliminates >90% of edit-distance calls safely
  for (const kw of keywords) {
    const maxLen = Math.max(tok.folded.length, kw.folded.length);
    const minLen = Math.min(tok.folded.length, kw.folded.length);
    if (minLen < 3 || maxLen < 3) continue;

    let d = 3;
    if (
      Math.abs(tok.folded.length - kw.folded.length) <= 2 &&
      popcount32(tok.mask & ~kw.mask) <= 2 &&
      popcount32(kw.mask & ~tok.mask) <= 2
    ) {
      d = boundedEditDistance(tok.folded, kw.folded, 2);
    }

    if (
      d > 1 &&
      (tok.raw !== tok.folded || kw.raw !== kw.folded) &&
      Math.abs(tok.raw.length - kw.raw.length) <= 2 &&
      popcount32(tok.rawMask & ~kw.rawMask) <= 2 &&
      popcount32(kw.rawMask & ~tok.rawMask) <= 2
    ) {
      const dRaw = boundedEditDistance(tok.raw, kw.raw, 2);
      if (dRaw < d) d = dRaw;
    }

    if (
      d > 1 &&
      (tok.stem !== tok.folded || kw.stem !== kw.folded) &&
      Math.abs(tok.stem.length - kw.stem.length) <= 2 &&
      popcount32(tok.mask & ~kw.mask) <= 2 &&
      popcount32(kw.mask & ~tok.mask) <= 2
    ) {
      const dStem = boundedEditDistance(tok.stem, kw.stem, 2);
      if (dStem < d) d = dStem;
    }

    if (
      d === 1 &&
      (maxLen >= 4 || tok.folded.charCodeAt(0) === kw.folded.charCodeAt(0))
    ) {
      return 18;
    }
    if (d === 2 && minLen >= 5 && maxLen >= 6 && best < 10) {
      best = 10;
    }
  }

  return best;
}

function scoreLatinToken(
  tok: NormalizedToken,
  entry: IndexedHelpItem
): number {
  let best = scoreLatinKeywordGroup(tok, entry.latinSingleTokens, 40);
  if (best >= 40) return best;

  if (best < 32) {
    best = Math.max(
      best,
      scoreLatinKeywordGroup(tok, entry.latinPhraseTokens, 32)
    );
  }
  if (best < 24) {
    best = Math.max(
      best,
      scoreLatinKeywordGroup(tok, entry.latinQuestionTokens, 24)
    );
  }

  if (
    best < 14 &&
    tok.raw.length >= 3 &&
    (entry.questionLower.includes(tok.raw) ||
      entry.keywordsJoinedLower.includes(tok.raw))
  ) {
    best = 14;
  }

  if (best < 8 && tok.raw.length >= 4 && entry.answerLower.includes(tok.raw)) {
    best = 8;
  }

  return best;
}

export function searchHelpKb(
  kb: HelpKbPayload,
  query: string,
  role: HelpAssistantRole,
  limit = 5
): HelpSearchResult[] {
  const trimmed = query.trim();
  if (trimmed.length < 2 && trimmed !== '-' && trimmed !== '%' && trimmed !== '0') {
    return [];
  }

  const normalized = normalizeQuery(trimmed);
  if (normalized.tokens.length === 0) return [];

  const indexed = getIndexedKb(kb);
  const results: HelpSearchResult[] = [];

  for (let idx = 0; idx < indexed.length; idx += 1) {
    const entry = indexed[idx];
    if (!isItemVisibleForRole(entry.item, role)) {
      continue;
    }

    let rawScore = 0;
    let matchedTokens = 0;

    for (const tok of normalized.tokens) {
      const tokenScore = tok.isMalayalam
        ? scoreMalayalamToken(tok, entry)
        : scoreLatinToken(tok, entry);
      if (tokenScore > 0) {
        rawScore += tokenScore;
        matchedTokens += 1;
      }
    }

    let hasPhraseMatch = false;
    for (let p = 0; p < entry.normalizedPhrases.length; p += 1) {
      const phrase = entry.normalizedPhrases[p];
      const rawPhrase = entry.rawPhrasesLower[p];
      if (
        (phrase.length >= 4 && normalized.normalizedPhrase.includes(phrase)) ||
        (rawPhrase.length >= 4 && normalized.rawLower.includes(rawPhrase))
      ) {
        hasPhraseMatch = true;
        break;
      }
    }

    if (hasPhraseMatch) {
      rawScore += 45;
      matchedTokens = Math.max(
        matchedTokens,
        Math.min(2, normalized.tokens.length)
      );
    }

    if (rawScore === 0) continue;

    let finalScore =
      rawScore * (1 + 0.35 * Math.max(0, matchedTokens - 1));

    if (
      (role === 'ADMIN' || role === 'SECTOR' || role === 'UNIT') &&
      entry.item.roles.includes(role)
    ) {
      finalScore += 14;
    } else if (entry.item.roles.includes('ALL')) {
      finalScore += 6;
    }

    results.push({
      item: entry.item,
      score: Math.round(finalScore * 100) / 100,
      matchedTokens,
    });
  }

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.matchedTokens - a.matchedTokens;
  });

  return results.slice(0, limit);
}
