/** LINE 訊息的文字解析：固定規則、無副作用；之後接 Gemini 只換這一層 */

export type Method = 'card' | 'account' | 'own';

export const METHOD_LABEL: Record<Method, string> = {
  card: '公帳卡',
  account: '公帳帳戶',
  own: '自己付',
};

export interface Draft {
  note: string;
  amount: number;
  /** YYYY-MM-DD */
  date: string;
  method?: Method;
}

export type Parsed =
  | { type: 'draft'; draft: Draft }
  | { type: 'form' }
  | { type: 'undo' }
  | { type: 'month' }
  | { type: 'balance' };

const NOTE_MAX = 60;
const AMOUNT_MAX = 9_999_999;

const COMMANDS: Record<string, Parsed> = {
  記帳: { type: 'form' },
  復原: { type: 'undo' },
  這個月: { type: 'month' },
  餘額: { type: 'balance' },
};

const METHOD_WORDS = new Map(
  (Object.entries(METHOD_LABEL) as [Method, string][]).map(([method, label]) => [label, method])
);

/** 午餐120 這種沒空格的寫法；數字前是 / : . - 的是日期或時間，不算 */
const GLUED_AMOUNT = /^(.*[^\d,+\/:.\-])([\d,+]+)$/;

const DAYS_AGO: Record<string, number> = { 今天: 0, 昨天: 1, 前天: 2 };

/** 台北今天的 YYYY-MM-DD */
export function todayInTaipei(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(now);
}

function shiftDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10);
}

/** 正整數用 + 連起來，每個可有千分位逗號；不是金額回 null */
function parseAmount(token: string): number | null {
  let sum = 0;
  for (const term of token.split('+')) {
    if (!/^(\d+|\d{1,3}(,\d{3})+)$/.test(term)) return null;
    const value = Number(term.replaceAll(',', ''));
    if (value < 1) return null;
    sum += value;
  }
  return sum <= AMOUNT_MAX ? sum : null;
}

/** M/D 取不晚於今天的最近一次；2/29 會往前找到閏年，不存在的日期回 null */
function resolveMonthDay(token: string, today: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})$/.exec(token);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const thisYear = Number(today.slice(0, 4));

  for (let year = thisYear; year >= thisYear - 8; year--) {
    const utc = new Date(Date.UTC(year, month - 1, day));
    if (utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) continue;
    const date = utc.toISOString().slice(0, 10);
    if (date <= today) return date;
  }
  return null;
}

function resolveDate(token: string, today: string): string | null {
  if (Object.hasOwn(DAYS_AGO, token)) return shiftDays(today, DAYS_AGO[token]);
  return resolveMonthDay(token, today);
}

/** 不是指令也不是記帳格式就回 null，bot 不回應 */
export function parseText(text: string, today: string): Parsed | null {
  const trimmed = text.trim();
  if (Object.hasOwn(COMMANDS, trimmed)) return COMMANDS[trimmed];

  let method: Method | undefined;
  const tokens = trimmed.split(/\s+/).filter((token) => {
    const found = METHOD_WORDS.get(token);
    if (found) method = found;
    return !found;
  });

  const last = tokens.at(-1) ?? '';
  const rest = tokens.slice(0, -1);
  let amount = parseAmount(last);

  if (amount === null) {
    const glued = GLUED_AMOUNT.exec(last);
    if (!glued) return null;
    amount = parseAmount(glued[2]);
    if (amount === null) return null;
    rest.push(glued[1]);
  }

  const date = rest.length > 1 ? resolveDate(rest[0], today) : null;
  const noteTokens = date ? rest.slice(1) : rest;
  if (noteTokens.length === 0) return null;

  const note = Array.from(noteTokens.join(' ')).slice(0, NOTE_MAX).join('');
  return { type: 'draft', draft: { note, amount, date: date ?? today, method } };
}
