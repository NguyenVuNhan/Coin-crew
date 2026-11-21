import { expect, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test';

export const MINUS = '\u2212';

export interface Variant {
  lang: 'vi' | 'en';
  size: 'phone' | 'desktop';
  width: number;
  height: number;
}

export const MATRIX: readonly Variant[] = [
  { lang: 'vi', size: 'phone', width: 375, height: 812 },
  { lang: 'en', size: 'desktop', width: 1024, height: 768 },
] as const;

export const PHONE_VI: Variant = MATRIX[0]!;

export function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function currentMonth(): string {
  return todayIso().slice(0, 7);
}

/** 1st day of the previous calendar month (YYYY-MM-01). */
export function firstOfLastMonth(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** A date strictly before `firstOfLastMonth()` (the 15th of two months ago). */
export function beforeStartDate(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 2, 15);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-15`;
}

export function monthBounds(ym: string): { from: string; to: string } {
  const [yStr, mStr] = ym.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    from: `${ym}-01`,
    to: `${ym}-${String(lastDay).padStart(2, '0')}`,
  };
}

export async function createActorContext(browser: Browser, variant: Variant): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: { width: variant.width, height: variant.height },
    locale: 'en-US',
  });
  await context.addInitScript((l: string) => localStorage.setItem('lang', l), variant.lang);
  return context;
}

export async function signIn(
  page: Page,
  opts: { sub: string; name: string; email?: string },
): Promise<{ userId: string }> {
  const loginRes = await page.request.post('/api/test/login', {
    data: {
      sub: opts.sub,
      name: opts.name,
      email: opts.email ?? `${opts.sub}@example.com`,
    },
  });
  expect(loginRes.ok(), `login failed for ${opts.sub}: ${loginRes.status()}`).toBe(true);
  const { userId } = (await loginRes.json()) as { userId: string };

  const consentRes = await page.request.post('/api/me/consent');
  expect(consentRes.ok(), `consent failed for ${opts.sub}: ${consentRes.status()}`).toBe(true);

  return { userId };
}

export async function setBookEnabled(page: Page, enabled: boolean): Promise<void> {
  const res = await page.request.patch('/api/me/personal', { data: { enabled } });
  expect(res.ok(), `setBookEnabled(${enabled}) failed: ${res.status()} ${res.ok() ? '' : await res.text()}`).toBe(true);
}

export interface WalletRecord {
  id: string;
  name: string;
  currency: string;
  balance: number;
  isDefault: boolean;
  kind: string;
  startAmount: number;
  startDate: string;
  archived: boolean;
}

export interface NhanWallets {
  tcb: WalletRecord;
  cash: WalletRecord;
  usd: WalletRecord;
}

/**
 * Turns Sổ chi tiêu on and creates Nhan's three catalogue wallets:
 * - "Techcombank" (VND, default, startDate = 1st of last month)
 * - "Tiền mặt" (VND, everyday)
 * - "USD" (USD, everyday)
 */
export async function setupNhanBook(
  page: Page,
  opts?: { tcbStart?: number; cashStart?: number; tcbStartDate?: string },
): Promise<NhanWallets> {
  await setBookEnabled(page, true);
  const startDate = opts?.tcbStartDate ?? firstOfLastMonth();
  const tcbStart = opts?.tcbStart ?? 1_000_000;
  const cashStart = opts?.cashStart ?? 500_000;

  const tcbRes = await page.request.post('/api/me/personal/wallets', {
    data: {
      name: 'Techcombank',
      currency: 'VND',
      kind: 'everyday',
      startAmount: tcbStart,
      startDate,
    },
  });
  expect(tcbRes.ok(), `create Techcombank failed: ${tcbRes.status()}`).toBe(true);
  const { wallet: tcb } = (await tcbRes.json()) as { wallet: WalletRecord };

  const cashRes = await page.request.post('/api/me/personal/wallets/add', {
    data: {
      name: 'Tiền mặt',
      currency: 'VND',
      kind: 'everyday',
      startAmount: cashStart,
      startDate,
    },
  });
  expect(cashRes.ok(), `create Tiền mặt failed: ${cashRes.status()}`).toBe(true);
  const { wallet: cash } = (await cashRes.json()) as { wallet: WalletRecord };

  const usdRes = await page.request.post('/api/me/personal/wallets/add', {
    data: {
      name: 'USD',
      currency: 'USD',
      kind: 'everyday',
      startAmount: 10000,
      startCostVnd: 2_500_000,
      startDate,
    },
  });
  expect(usdRes.ok(), `create USD wallet failed: ${usdRes.status()}`).toBe(true);
  const { wallet: usd } = (await usdRes.json()) as { wallet: WalletRecord };

  return { tcb, cash, usd };
}

export async function getWallets(page: Page): Promise<WalletRecord[]> {
  const res = await page.request.get('/api/me/personal/wallets');
  expect(res.ok(), `getWallets failed: ${res.status()} ${res.ok() ? '' : await res.text()}`).toBe(true);
  const data = (await res.json()) as { wallets: WalletRecord[] };
  return data.wallets;
}

export interface CategoryRecord {
  id: string;
  parentId: string | null;
  type: 'expense' | 'income';
  name: string;
  icon: string;
  hidden: boolean;
}

export async function getCategories(page: Page): Promise<CategoryRecord[]> {
  const res = await page.request.get('/api/me/personal/categories');
  expect(res.ok(), `getCategories failed: ${res.status()} ${res.ok() ? '' : await res.text()}`).toBe(true);
  const data = (await res.json()) as { categories: CategoryRecord[] };
  return data.categories;
}

export async function createCategory(
  page: Page,
  data: { name: string; type: 'expense' | 'income'; icon?: string },
): Promise<CategoryRecord> {
  const res = await page.request.post('/api/me/personal/categories', {
    data: { name: data.name, type: data.type, icon: data.icon ?? 'plane' },
  });
  expect(res.ok(), `createCategory failed: ${res.status()} ${res.ok() ? '' : await res.text()}`).toBe(true);
  const json = (await res.json()) as { category: CategoryRecord };
  return json.category;
}

export async function createPersonalEntry(
  page: Page,
  data: {
    type: 'expense' | 'income';
    walletId: string;
    categoryId: string;
    amount: number;
    date: string;
    note?: string;
    tags?: string[];
  },
): Promise<{ id: string }> {
  const res = await page.request.post('/api/me/personal/transactions', { data });
  expect(res.ok(), `createPersonalEntry failed: ${res.status()} ${res.ok() ? '' : await res.text()}`).toBe(true);
  const json = (await res.json()) as { entries: Array<{ id: string }> };
  return json.entries[0]!;
}

export interface ListTotals {
  currency: string;
  spent: number;
  income: number;
}

export interface PersonalListData {
  rows: Array<{ kind: string; entry?: { id: string; note: string | null; source?: string } }>;
  groupRows?: Array<{
    kind: 'group';
    id: string;
    rootId: string;
    tripId: string;
    title: string;
    myShare: number;
    total: number;
    pending: boolean;
    link: { walletId: string | null; categoryId: string | null; tagIds: string[]; intent: string | null } | null;
  }>;
  totals: ListTotals[];
}

export async function getPersonalList(
  page: Page,
  params: Record<string, string>,
): Promise<PersonalListData> {
  const qs = new URLSearchParams(params);
  const res = await page.request.get(`/api/me/personal/transactions?${qs.toString()}`);
  expect(res.ok(), `getPersonalList failed: ${res.status()} ${res.ok() ? '' : await res.text()}`).toBe(true);
  return (await res.json()) as PersonalListData;
}

export async function updateGroupLink(
  page: Page,
  rootId: string,
  input: {
    walletId?: string | null;
    categoryId?: string | null;
    tagIds?: string[];
    intent?: 'shared' | 'loan' | null;
    excludeFromReports?: boolean;
  },
): Promise<void> {
  const res = await page.request.put(`/api/me/personal/group-links/${rootId}`, { data: input });
  expect(res.ok(), `updateGroupLink(${rootId}) failed: ${res.status()} ${res.ok() ? '' : await res.text()}`).toBe(true);
}

export interface CreatedTrip {
  tripId: string;
  groupToken: string;
  myPid: string;
  people: Array<{ id: string; name: string }>;
  pidByName: (name: string) => string;
}

export async function createTrip(
  page: Page,
  opts: {
    name: string;
    preset?: 'trip' | 'sport';
    defaultLang?: 'vi' | 'en';
    people: Array<string | { name: string; gender?: 'M' | 'F' }>;
    myGender?: 'M' | 'F';
    myBank?: { bin: string; accountNumber: string; holderName: string };
  },
): Promise<CreatedTrip> {
  const createRes = await page.request.post('/api/trips', {
    data: {
      name: opts.name,
      preset: opts.preset ?? 'trip',
      defaultLang: opts.defaultLang ?? 'vi',
      people: opts.people,
      ...(opts.myGender ? { myGender: opts.myGender } : {}),
      ...(opts.myBank ? { myBank: opts.myBank } : {}),
    },
  });
  expect(createRes.ok(), `createTrip(${opts.name}) failed: ${createRes.status()}`).toBe(true);
  const { tripId } = (await createRes.json()) as { tripId: string };

  const viewRes = await page.request.get(`/api/trips/${tripId}`);
  expect(viewRes.ok(), `getTrip(${tripId}) failed: ${viewRes.status()}`).toBe(true);
  const view = (await viewRes.json()) as {
    links: { group: string };
    me: { participantId: string };
    people: Array<{ id: string; name: string }>;
  };

  return {
    tripId,
    groupToken: view.links.group,
    myPid: view.me.participantId,
    people: view.people,
    pidByName(name: string) {
      const found = view.people.find((p) => p.name === name);
      if (!found) throw new Error(`Participant "${name}" not found in trip ${opts.name}`);
      return found.id;
    },
  };
}

export async function joinTrip(
  page: Page,
  tripId: string,
  groupToken: string,
  opts?: { name?: string; gender?: 'M' | 'F' },
): Promise<string> {
  const res = await page.request.post(`/api/trips/${tripId}/join`, {
    headers: { 'X-Link-Token': groupToken },
    data: opts ?? {},
  });
  expect(res.ok(), `joinTrip(${tripId}) failed: ${res.status()} ${res.ok() ? '' : await res.text()}`).toBe(true);
  const { participantId } = (await res.json()) as { participantId: string };
  return participantId;
}

export async function addTripExpense(
  page: Page,
  tripId: string,
  data: {
    description: string;
    amount: number;
    spentOn: string;
    payerId: string;
    mode: 'equal' | 'amounts' | 'percent' | 'shares' | 'adjust';
    entries: Array<{ participantId: string; value: number }>;
    meta?: Record<string, unknown>;
  },
  groupToken?: string,
): Promise<{ expenseId: string }> {
  const res = await page.request.post(`/api/trips/${tripId}/expenses`, {
    ...(groupToken ? { headers: { 'X-Link-Token': groupToken } } : {}),
    data,
  });
  expect(res.ok(), `addTripExpense(${data.description}) failed: ${res.status()} ${res.ok() ? '' : await res.text()}`).toBe(true);
  return (await res.json()) as { expenseId: string };
}

export async function editTripExpense(
  page: Page,
  tripId: string,
  expenseId: string,
  data: {
    description: string;
    amount: number;
    spentOn: string;
    payerId: string;
    mode: 'equal' | 'amounts' | 'percent' | 'shares' | 'adjust';
    entries: Array<{ participantId: string; value: number }>;
  },
): Promise<{ expenseId: string; rootId: string }> {
  const res = await page.request.patch(`/api/trips/${tripId}/expenses/${expenseId}`, { data });
  expect(res.ok(), `editTripExpense(${expenseId}) failed: ${res.status()} ${res.ok() ? '' : await res.text()}`).toBe(true);
  return (await res.json()) as { expenseId: string; rootId: string };
}

export async function disableTripExpense(page: Page, tripId: string, expenseId: string): Promise<void> {
  const res = await page.request.post(`/api/trips/${tripId}/expenses/${expenseId}/disable`);
  expect(res.ok(), `disableTripExpense(${expenseId}) failed: ${res.status()} ${res.ok() ? '' : await res.text()}`).toBe(true);
}

export async function enableTripExpense(page: Page, tripId: string, expenseId: string): Promise<void> {
  const res = await page.request.post(`/api/trips/${tripId}/expenses/${expenseId}/enable`);
  expect(res.ok(), `enableTripExpense(${expenseId}) failed: ${res.status()} ${res.ok() ? '' : await res.text()}`).toBe(true);
}

export async function approveTripExpense(page: Page, tripId: string, expenseId: string): Promise<void> {
  const res = await page.request.post(`/api/trips/${tripId}/expenses/${expenseId}/approve`);
  expect(res.ok(), `approveTripExpense(${expenseId}) failed: ${res.status()} ${res.ok() ? '' : await res.text()}`).toBe(true);
}

export async function addFundIncome(
  page: Page,
  tripId: string,
  data: { description: string; amount: number; spentOn: string },
): Promise<{ incomeId: string }> {
  const res = await page.request.post(`/api/trips/${tripId}/fund/incomes`, { data });
  expect(res.ok(), `addFundIncome failed: ${res.status()} ${res.ok() ? '' : await res.text()}`).toBe(true);
  return (await res.json()) as { incomeId: string };
}

export async function recordPayment(
  page: Page,
  tripId: string,
  data: { fromId: string; toId: string; amount: number },
): Promise<{ paymentId: string; status: string }> {
  const res = await page.request.post(`/api/trips/${tripId}/payments`, { data });
  expect(res.ok(), `recordPayment failed: ${res.status()} ${res.ok() ? '' : await res.text()}`).toBe(true);
  return (await res.json()) as { paymentId: string; status: string };
}

export async function confirmPayment(page: Page, tripId: string, paymentId: string): Promise<void> {
  const res = await page.request.post(`/api/trips/${tripId}/payments/${paymentId}/confirm`);
  expect(res.ok(), `confirmPayment failed: ${res.status()} ${res.ok() ? '' : await res.text()}`).toBe(true);
}

export async function getDirectLedger(page: Page): Promise<{ tripId: string; ownerPid: string }> {
  const res = await page.request.get('/api/me/ledger');
  expect(res.ok(), `getDirectLedger failed: ${res.status()} ${res.ok() ? '' : await res.text()}`).toBe(true);
  return (await res.json()) as { tripId: string; ownerPid: string };
}

export async function addLedgerPerson(page: Page, name: string): Promise<string> {
  const res = await page.request.post('/api/me/ledger/people', { data: { name } });
  expect(res.ok(), `addLedgerPerson(${name}) failed: ${res.status()} ${res.ok() ? '' : await res.text()}`).toBe(true);
  const { participantId } = (await res.json()) as { participantId: string };
  return participantId;
}

export async function saveShot(
  page: Page,
  testInfo: TestInfo,
  id: string,
  variant: Variant,
): Promise<void> {
  await page.screenshot({
    path: testInfo.outputPath(`${id}-${variant.lang}-${variant.size}.png`),
    fullPage: true,
  });
}

export interface DaLatSetup {
  nhanContext: BrowserContext;
  nhan: Page;
  minhContext: BrowserContext;
  minh: Page;
  hungContext: BrowserContext;
  hung: Page;
  wallets: NhanWallets;
  tripId: string;
  groupToken: string;
  nhanPid: string;
  minhPid: string;
  hungPid: string;
  lanPid: string;
  close: () => Promise<void>;
}

/**
 * Sets up independent actors (Nhan with Sổ chi tiêu + 3 wallets, Minh, Hùng) and trip "Đà Lạt"
 * with Nhan, Minh, Hùng (signed-in members) and Lan (unclaimed name).
 */
export async function setupDaLatScenario(
  browser: Browser,
  variant: Variant,
  idPrefix: string,
  opts?: {
    tcbStart?: number;
    cashStart?: number;
    tcbStartDate?: string;
    hungBank?: { bin: string; accountNumber: string; holderName: string };
    nhanBank?: { bin: string; accountNumber: string; holderName: string };
  },
): Promise<DaLatSetup> {
  const suffix = `${idPrefix}-${variant.lang}-${variant.size}`;
  const nhanContext = await createActorContext(browser, variant);
  const minhContext = await createActorContext(browser, variant);
  const hungContext = await createActorContext(browser, variant);

  const nhan = await nhanContext.newPage();
  const minh = await minhContext.newPage();
  const hung = await hungContext.newPage();

  await signIn(nhan, { sub: `e2e-gs-${suffix}-nhan`, name: 'Nhan' });
  await signIn(minh, { sub: `e2e-gs-${suffix}-minh`, name: 'Minh' });
  await signIn(hung, { sub: `e2e-gs-${suffix}-hung`, name: 'Hùng' });

  const wallets = await setupNhanBook(nhan, opts);

  const trip = await createTrip(nhan, {
    name: 'Đà Lạt',
    preset: 'trip',
    defaultLang: variant.lang,
    people: ['Lan'],
    myBank: opts?.nhanBank,
  });

  const minhPid = await joinTrip(minh, trip.tripId, trip.groupToken, { name: 'Minh' });
  const hungPid = await joinTrip(hung, trip.tripId, trip.groupToken, { name: 'Hùng' });
  const lanPid = trip.pidByName('Lan');

  if (opts?.hungBank) {
    const bankRes = await hung.request.put('/api/me/bank', { data: { ...opts.hungBank, consent: true } });
    expect(bankRes.ok(), `set Hùng bank failed: ${bankRes.status()} ${bankRes.ok() ? '' : await bankRes.text()}`).toBe(true);
  }

  return {
    nhanContext,
    nhan,
    minhContext,
    minh,
    hungContext,
    hung,
    wallets,
    tripId: trip.tripId,
    groupToken: trip.groupToken,
    nhanPid: trip.myPid,
    minhPid,
    hungPid,
    lanPid,
    close: async () => {
      await nhanContext.close();
      await minhContext.close();
      await hungContext.close();
    },
  };
}

export interface DirectLedgerView {
  trip: { id: string; name: string; currency: string; preset: string };
  me: { participantId: string };
  people: Array<{ id: string; name: string; status: string }>;
  balances: Record<string, number>;
  expenses: Array<{
    id: string;
    description: string;
    amount: number;
    payerId: string;
    mode: string;
    shares: Array<{ participantId: string; amount: number }>;
  }>;
  payments: Array<{ id: string; fromId: string; toId: string; amount: number; status: string }>;
}

/** Opens `/entries/new` (optionally with `?type=...`) and waits for the amount field or keypad. */
export async function openEntry(
  page: Page,
  type?: 'expense' | 'income' | 'loan-debt',
): Promise<void> {
  const path = type ? `/entries/new?type=${type}` : '/entries/new';
  await page.goto(path);
  await expect(page.getByTestId('amount-input').or(page.getByTestId('amount-keypad'))).toBeVisible();
}

/** Enters `digits` into the desktop amount textbox or phone keypad (clicking `key-done` on phone). */
export async function typeAmount(page: Page, _variant: Variant, digits: string): Promise<void> {
  const input = page.getByTestId('amount-input');
  const keypad = page.getByTestId('amount-keypad');
  await expect(input.or(keypad)).toBeVisible();
  if (await input.isVisible()) {
    await input.fill(digits);
    return;
  }
  for (const ch of digits) {
    const testId = ch === ',' ? 'key-comma' : `key-${ch}`;
    await page.getByTestId(testId).click();
  }
  await page.getByTestId('key-done').click();
}

/** Fetches the current user's direct-ledger trip view (`GET /api/trips/<direct>`). */
export async function directView(page: Page): Promise<DirectLedgerView> {
  const { tripId } = await getDirectLedger(page);
  const res = await page.request.get(`/api/trips/${tripId}`);
  expect(res.ok(), `directView(${tripId}) failed: ${res.status()} ${res.ok() ? '' : await res.text()}`).toBe(true);
  return (await res.json()) as DirectLedgerView;
}

/** Picks people on the entry page the way a group expense does: open the "Chia cho" line, add each, Xong. */
export async function pickPeople(page: Page, names: readonly string[]): Promise<void> {
  await page.getByTestId('entry-people').getByRole('button').first().click();
  for (const name of names) {
    await page.getByRole('button', { name: new RegExp(`^(Thêm|Add) ${name}$`) }).click();
  }
  await page.getByRole('button', { name: /^(Xong|Done)$/ }).click();
}
