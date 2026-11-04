/** 公帳的 LINE webhook：部署時要關 verify_jwt，LINE 不帶 JWT，這裡自己驗 x-line-signature */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { METHOD_LABEL, parseText, todayInTaipei, type Draft, type Method } from './parse.ts';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

interface LineEvent {
  type: string;
  replyToken?: string;
  source?: { userId?: string };
  message?: { type: string; id: string; text?: string };
  postback?: { data: string };
}

interface QuickReplyItem {
  type: 'action';
  action:
    | { type: 'postback'; label: string; data: string; displayText: string }
    | { type: 'uri'; label: string; uri: string };
}

interface Category {
  key: string;
  label: string;
  emoji: string;
  hidden: boolean;
}

/** 草稿放在 postback 裡來回傳：s 步驟、m 原訊息 id、w 記帳的人、a 金額、n 備註、d 日期、c 分類、p 付款方式 */
interface Postback {
  s: 'cat' | 'pay' | 'no' | 'undo';
  w: string;
  m?: string;
  a?: number;
  n?: string;
  d?: string;
  c?: string;
  p?: Method;
}

type ExpenseStep = Postback & { m: string; a: number; n: string; d: string };
type CompleteStep = ExpenseStep & { c: string; p: Method };

interface LedgerRow {
  kind: string;
  amount: number;
  method: string;
  checked: boolean;
  spent_on: string;
  category: string | null;
}

interface UndoResult {
  status: 'deleted' | 'checked' | 'none';
  note: string | null;
  amount: number | null;
}

const METHOD_EMOJI: Record<Method, string> = { card: '💳', account: '🏦', own: '👛' };
const LABEL_MAX = 20;
const CATEGORY_BUTTONS_MAX = 12;
const QUICK_REPLY_MAX = 13;
const NOTE_MAX = 60;
const AMOUNT_MAX = 9_999_999;
const FORM_ORIGIN = 'https://tomisagoodguy.github.io';
const PAGE = 1000;
const FAILURE_TEXT = '⚠️ 沒有成功，請再試一次或到網頁操作';

const money = (n: number) => `$${n.toLocaleString('en-US')}`;
const shortDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

async function verifySignature(body: string, signature: string, secret: string): Promise<boolean> {
  let expected: Uint8Array<ArrayBuffer>;
  try {
    expected = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
  } catch {
    return false;
  }
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  return crypto.subtle.verify('HMAC', key, expected, encoder.encode(body));
}

function loadUsers(): Record<string, string> {
  try {
    const users: unknown = JSON.parse(Deno.env.get('LINE_USER_MAP') ?? '{}');
    if (users && typeof users === 'object' && !Array.isArray(users)) {
      return users as Record<string, string>;
    }
    console.error('[line-webhook] LINE_USER_MAP 必須是物件');
  } catch {
    console.error('[line-webhook] LINE_USER_MAP 不是合法 JSON');
  }
  return {};
}

function base64Utf8(text: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(text)));
}

function passphrase(): string {
  const value = Deno.env.get('DATING_MAP_PASSPHRASE');
  if (!value) throw new Error('DATING_MAP_PASSPHRASE 未設定');
  return value;
}

/** 跟前端同一組權限：anon key＋密碼 header；操作者帶進 header，改帳紀錄才記得到人 */
function dbFor(actor: string): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL 或 SUPABASE_ANON_KEY 未設定');
  return createClient(url, key, {
    auth: { persistSession: false },
    global: {
      headers: { 'x-dating-map-pass': passphrase(), 'x-dating-map-who': base64Utf8(actor) },
    },
  });
}

/** 每則回覆都附表單按鈕；Quick Reply 滿了就不加，選單優先 */
function withFormButton(items: QuickReplyItem[] = []): QuickReplyItem[] {
  const liffId = Deno.env.get('LINE_LIFF_ID');
  if (!liffId || items.length >= QUICK_REPLY_MAX) return items;
  const uri = `https://liff.line.me/${liffId}`;
  return [...items, { type: 'action', action: { type: 'uri', label: '📝 記一筆', uri } }];
}

async function reply(replyToken: string, text: string, items?: QuickReplyItem[]): Promise<void> {
  const token = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
  if (!token) {
    console.error('[line-webhook] LINE_CHANNEL_ACCESS_TOKEN 未設定');
    return;
  }
  const quick = withFormButton(items);
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: 'text', text, ...(quick.length ? { quickReply: { items: quick } } : {}) }],
    }),
  });
  if (!res.ok) console.error('[line-webhook] reply 失敗', res.status, await res.text());
}

function button(label: string, data: Postback): QuickReplyItem {
  const short = Array.from(label).slice(0, LABEL_MAX).join('');
  return {
    type: 'action',
    action: { type: 'postback', label: short, data: JSON.stringify(data), displayText: short },
  };
}

async function fetchCategories(db: SupabaseClient): Promise<Category[]> {
  const { data, error } = await db
    .from('dating_map_ledger_categories')
    .select('key,label,emoji,hidden')
    .order('sort_order');
  if (error) throw error;
  // 密碼不對時 RLS 回空陣列而不是錯誤，這裡不擋會變成沒有分類的空選單
  if (!data?.length) throw new Error('讀不到分類，請確認 DATING_MAP_PASSPHRASE');
  return data as Category[];
}

/** 分頁讀完全部流水，超過 PostgREST 單次上限也算得對 */
async function fetchLedger(db: SupabaseClient): Promise<LedgerRow[]> {
  const rows: LedgerRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('dating_map_ledger')
      .select('kind,amount,method,checked,spent_on,category')
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as LedgerRow[]));
    if (!data || data.length < PAGE) return rows;
  }
}

async function askCategory(
  db: SupabaseClient,
  replyToken: string,
  actor: string,
  messageId: string,
  draft: Draft
): Promise<void> {
  const categories = (await fetchCategories(db)).filter((c) => !c.hidden);
  const base: Postback = {
    s: 'cat',
    w: actor,
    m: messageId,
    a: draft.amount,
    n: draft.note,
    d: draft.date,
    ...(draft.method ? { p: draft.method } : {}),
  };
  const items = categories
    .slice(0, CATEGORY_BUTTONS_MAX)
    .map((c) => button(`${c.emoji} ${c.label}`, { ...base, c: c.key }));
  items.push(button('取消', { s: 'no', w: actor }));
  await reply(replyToken, `💰 ${draft.note} ${money(draft.amount)}（${shortDate(draft.date)}）\n選分類`, items);
}

async function askMethod(replyToken: string, step: ExpenseStep): Promise<void> {
  const items = (Object.entries(METHOD_LABEL) as [Method, string][]).map(([method, label]) =>
    button(`${METHOD_EMOJI[method]} ${label}`, { ...step, s: 'pay', p: method })
  );
  items.push(button('取消', { s: 'no', w: step.w }));
  await reply(replyToken, `💰 ${step.n} ${money(step.a)}\n選付款方式`, items);
}

/** 寫入並組出摘要；同一個 m 重複送出時 created 為 false */
async function recordExpense(
  db: SupabaseClient,
  step: CompleteStep
): Promise<{ created: boolean; summary: string }> {
  const { data, error } = await db.rpc('dating_map_line_save_expense', {
    p_passphrase: passphrase(),
    p_message_id: step.m,
    p_spent_on: step.d,
    p_amount: step.a,
    p_category: step.c,
    p_method: step.p,
    p_actor: step.w,
    p_note: step.n,
  });
  if (error) throw error;

  const created = (data as { created: boolean }[])[0]?.created ?? false;
  const category = (await fetchCategories(db)).find((c) => c.key === step.c);
  const parts = [
    category ? `${category.emoji} ${category.label}` : step.c,
    METHOD_LABEL[step.p],
    step.w,
    shortDate(step.d),
  ];
  return { created, summary: `✅ ${step.n} ${money(step.a)}\n${parts.join('・')}` };
}

async function saveExpense(db: SupabaseClient, replyToken: string, step: CompleteStep): Promise<void> {
  const { created, summary } = await recordExpense(db, step);
  if (!created) {
    await reply(replyToken, '這筆已經記過了');
    return;
  }
  await reply(replyToken, summary, [button('↩️ 復原', { s: 'undo', w: step.w, m: step.m })]);
}

/** 文字 復原 刪最新一筆；按鈕帶 messageId，只刪它顯示的那筆，連點才不會多刪前一筆 */
async function undo(
  db: SupabaseClient,
  replyToken: string,
  actor: string,
  messageId?: string
): Promise<void> {
  const { data, error } = await db.rpc('dating_map_line_undo', {
    p_passphrase: passphrase(),
    p_actor: actor,
    ...(messageId ? { p_message_id: messageId } : {}),
  });
  if (error) throw error;

  const result = (data as UndoResult[])[0];
  if (result?.status === 'deleted') {
    await reply(replyToken, `↩️ 已復原：${result.note ?? '這筆'} ${money(result.amount ?? 0)}`);
  } else if (result?.status === 'checked') {
    await reply(replyToken, '這筆已經核對過，請到網頁修改');
  } else {
    await reply(replyToken, '沒有可以復原的帳');
  }
}

/** 規則同 ledger.ts 的 potEffect：未核對的自己付不影響餘額；改規則要兩邊一起改 */
function potEffect(row: LedgerRow): number {
  if (row.kind !== 'expense') return row.amount;
  return row.method === 'own' && !row.checked ? 0 : -row.amount;
}

async function replyBalance(db: SupabaseClient, replyToken: string, today: string): Promise<void> {
  const rows = await fetchLedger(db);
  const balance = rows.filter((r) => r.spent_on <= today).reduce((sum, r) => sum + potEffect(r), 0);
  await reply(replyToken, `🐷 公帳餘額 ${money(balance)}`);
}

async function replyMonth(db: SupabaseClient, replyToken: string, today: string): Promise<void> {
  const [rows, categories] = await Promise.all([fetchLedger(db), fetchCategories(db)]);
  const month = today.slice(0, 7);
  const spent = rows.filter((r) => r.kind === 'expense' && r.spent_on.startsWith(month));

  const byCategory = new Map<string, number>();
  for (const row of spent) {
    const key = row.category ?? 'other';
    byCategory.set(key, (byCategory.get(key) ?? 0) + row.amount);
  }

  const lines = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, amount]) => {
      const category = categories.find((c) => c.key === key);
      return `${category ? `${category.emoji} ${category.label}` : key} ${money(amount)}`;
    });
  const total = spent.reduce((sum, r) => sum + r.amount, 0);
  await reply(replyToken, [`📅 ${Number(month.slice(5))} 月花了 ${money(total)}`, ...lines].join('\n'));
}

async function onText(
  replyToken: string,
  actor: string,
  messageId: string,
  text: string
): Promise<void> {
  const today = todayInTaipei();
  const parsed = parseText(text, today);
  if (!parsed) return;

  const db = dbFor(actor);
  if (parsed.type === 'draft') await askCategory(db, replyToken, actor, messageId, parsed.draft);
  if (parsed.type === 'form' && Deno.env.get('LINE_LIFF_ID')) await reply(replyToken, '點下面的按鈕記一筆 👇');
  if (parsed.type === 'undo') await undo(db, replyToken, actor);
  if (parsed.type === 'month') await replyMonth(db, replyToken, today);
  if (parsed.type === 'balance') await replyBalance(db, replyToken, today);
}

function isExpenseStep(data: Postback): data is ExpenseStep {
  return (
    typeof data.m === 'string' &&
    typeof data.a === 'number' &&
    typeof data.n === 'string' &&
    typeof data.d === 'string'
  );
}

async function onPostback(replyToken: string, actor: string, raw: string): Promise<void> {
  const data = JSON.parse(raw) as Postback;
  if (data.w !== actor) return;

  if (data.s === 'no') {
    await reply(replyToken, '已取消');
    return;
  }
  if (data.s === 'undo') {
    await undo(dbFor(actor), replyToken, actor, data.m);
    return;
  }
  if (!isExpenseStep(data) || !data.c) return;

  if (data.p) {
    await saveExpense(dbFor(actor), replyToken, { ...data, c: data.c, p: data.p });
  } else {
    await askMethod(replyToken, data);
  }
}

async function handleEvent(event: LineEvent, users: Record<string, string>): Promise<void> {
  const { replyToken } = event;
  const userId = event.source?.userId;
  if (!replyToken || !userId) return;

  const text = event.type === 'message' && event.message?.type === 'text' ? event.message.text?.trim() : undefined;

  if (text === '我的ID' && Deno.env.get('LINE_SETUP_MODE') === '1') {
    await reply(replyToken, userId);
    return;
  }

  const actor = Object.hasOwn(users, userId) ? users[userId] : undefined;
  if (!actor) return;

  try {
    if (text && event.message) await onText(replyToken, actor, event.message.id, text);
    if (event.type === 'postback' && event.postback) await onPostback(replyToken, actor, event.postback.data);
  } catch (err) {
    console.error('[line-webhook] 處理失敗', err instanceof Error ? err.message : JSON.stringify(err));
    await reply(replyToken, FAILURE_TEXT);
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': FORM_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  Vary: 'Origin',
};

const formResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

/** 向 LINE 驗 ID token，回傳 LINE userId；無效回 null */
async function verifyIdToken(idToken: string, channelId: string): Promise<string | null> {
  const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
  });
  if (!res.ok) return null;
  const { sub } = (await res.json()) as { sub?: string };
  return sub ?? null;
}

function isValidDate(date: unknown): date is string {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(date);
}

interface FormRequest {
  action?: string;
  idToken?: string;
  requestId?: unknown;
  date?: unknown;
  amount?: unknown;
  category?: unknown;
  method?: unknown;
  note?: unknown;
}

async function saveFromForm(db: SupabaseClient, actor: string, form: FormRequest): Promise<Response> {
  const { requestId, date, amount, category, method } = form;
  const note = typeof form.note === 'string' ? form.note.trim() : '';
  const key = typeof method === 'string' && Object.hasOwn(METHOD_LABEL, method) ? (method as Method) : null;
  const visible = (await fetchCategories(db)).filter((c) => !c.hidden);
  const picked = visible.find((c) => c.key === category);

  if (
    typeof requestId !== 'string' ||
    !/^liff:[\w-]{8,64}$/.test(requestId) ||
    !isValidDate(date) ||
    typeof amount !== 'number' ||
    !Number.isInteger(amount) ||
    amount < 1 ||
    amount > AMOUNT_MAX ||
    !key ||
    !picked ||
    Array.from(note).length > NOTE_MAX
  ) {
    return formResponse({ error: 'invalid' }, 400);
  }

  const result = await recordExpense(db, {
    s: 'pay',
    w: actor,
    m: requestId,
    a: amount,
    n: note || picked.label,
    d: date,
    c: picked.key,
    p: key,
  });
  return formResponse(result);
}

/** 記帳表單的 API：身分靠 LIFF ID token，頁面不經手網頁密碼 */
async function handleForm(req: Request): Promise<Response> {
  if (req.headers.get('origin') !== FORM_ORIGIN) return new Response('Forbidden', { status: 403 });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return formResponse({ error: 'method' }, 405);

  const channelId = Deno.env.get('LINE_LOGIN_CHANNEL_ID');
  if (!channelId) {
    console.error('[line-webhook] LINE_LOGIN_CHANNEL_ID 未設定');
    return formResponse({ error: 'unavailable' }, 503);
  }

  let form: FormRequest;
  try {
    form = (await req.json()) as FormRequest;
  } catch {
    return formResponse({ error: 'invalid' }, 400);
  }

  try {
    const userId = form.idToken ? await verifyIdToken(form.idToken, channelId) : null;
    const users = loadUsers();
    const actor = userId && Object.hasOwn(users, userId) ? users[userId] : undefined;
    if (!actor) return formResponse({ error: 'forbidden' }, 403);

    const db = dbFor(actor);
    if (form.action === 'save') return await saveFromForm(db, actor, form);

    const categories = (await fetchCategories(db))
      .filter((c) => !c.hidden)
      .map(({ key, label, emoji }) => ({ key, label, emoji }));
    return formResponse({ name: actor, categories });
  } catch (err) {
    console.error('[line-webhook] 表單處理失敗', err instanceof Error ? err.message : JSON.stringify(err));
    return formResponse({ error: 'failed' }, 500);
  }
}

Deno.serve(async (req) => {
  if (new URL(req.url).pathname.endsWith('/liff')) return handleForm(req);
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const secret = Deno.env.get('LINE_CHANNEL_SECRET');
  if (!secret) {
    console.error('[line-webhook] LINE_CHANNEL_SECRET 未設定');
    return new Response('Service unavailable', { status: 503 });
  }

  const body = await req.text();
  const signature = req.headers.get('x-line-signature') ?? '';
  if (!(await verifySignature(body, signature, secret))) {
    return new Response('Invalid signature', { status: 403 });
  }

  let events: LineEvent[];
  try {
    events = (JSON.parse(body) as { events?: LineEvent[] }).events ?? [];
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const users = loadUsers();
  EdgeRuntime.waitUntil(Promise.all(events.map((event) => handleEvent(event, users))));
  return new Response('ok');
});
