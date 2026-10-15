// Walks the Finance Sheet Lover web app through its main screens with Playwright,
// capturing full-page screenshots at 375, 768, and 1280px wide and asserting no sideways scroll.
//
// How to run:
// 1. Start the server: npm run e2e:server -w @fsl/api
// 2. Run the audit script: node scripts/ui-audit.mjs
// (On Windows, run this command outside the shell sandbox).

import fs from 'node:fs';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';

const BASE = process.env.AUDIT_BASE ?? 'http://localhost:8787';
const OUT = 'test-results/ui-audit';

fs.mkdirSync(OUT, { recursive: true });
for (const file of fs.readdirSync(OUT)) {
  if (file.endsWith('.png')) {
    fs.unlinkSync(path.join(OUT, file));
  }
}

try {
  const healthRes = await fetch(`${BASE}/api/health`);
  if (!healthRes.ok) {
    console.log(`Server not reachable at ${BASE}. Start it with: npm run e2e:server -w @fsl/api`);
    process.exit(1);
  }
} catch {
  console.log(`Server not reachable at ${BASE}. Start it with: npm run e2e:server -w @fsl/api`);
  process.exit(1);
}

const WIDTHS = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 }
];

const shots = [];
const overflows = [];
const failures = [];

async function shotAll(page, name) {
  const savedSize = page.viewportSize();
  const screenOverflows = [];
  for (const size of WIDTHS) {
    await page.setViewportSize(size);
    await page.waitForTimeout(400);
    const fileName = `${name}-${size.width}.png`;
    await page.screenshot({ path: path.join(OUT, fileName), fullPage: true });
    shots.push(fileName);
    const { sw, iw } = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      iw: window.innerWidth
    }));
    if (sw > iw) {
      const overflowLine = `${name}@${size.width}: scrollWidth ${sw} > innerWidth ${iw}`;
      overflows.push(overflowLine);
      screenOverflows.push(overflowLine);
    }
  }
  if (savedSize) {
    await page.setViewportSize(savedSize);
  }
  await page.waitForTimeout(300);
  if (screenOverflows.length === 0) {
    console.log(`shot ${name} ok`);
  } else {
    for (const line of screenOverflows) {
      console.log(line);
    }
  }
}

async function step(name, fn) {
  try {
    await fn();
  } catch (err) {
    const message = (err?.message ?? String(err)).split('\n')[0];
    failures.push(`${name}: ${message}`);
    console.log(`STEP FAILED ${name}: ${message}`);
  }
}

let tripUrl;
let tripId;
let groupLink;
let viewLink;
let minhContext;
let minh;
let chiContext;
let chi;

const browser = await chromium.launch({ channel: 'chrome' });

async function createContext() {
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    locale: 'en-US',
    deviceScaleFactor: 1
  });
  context.setDefaultTimeout(15000);
  return context;
}

try {
  await step('landing', async () => {
    const anonContext = await createContext();
    const anon = await anonContext.newPage();
    await anon.goto(BASE + '/');
    await shotAll(anon, '01-landing');
    await anon.goto(BASE + '/privacy');
    await shotAll(anon, '02-privacy');
  });

  await step('minh signs in', async () => {
    minhContext = await createContext();
    minh = await minhContext.newPage();
    await minhContext.request.post(BASE + '/api/test/login', {
      // A new account every run, so each run starts at the privacy notice and an empty trip list.
      data: { sub: `audit-minh-${Date.now()}`, name: 'Minh', email: 'minh@example.com' }
    });
    await minh.goto(BASE + '/trips');
    const consent = minh.getByRole('checkbox', { name: 'I agree to the privacy notice' });
    await consent.waitFor({ timeout: 15000 });
    await shotAll(minh, '03-consent');
    await consent.check();
    await minh.getByRole('button', { name: 'Continue' }).click();
    const newTrip = minh.getByRole('link', { name: 'New trip' });
    await newTrip.waitFor({ timeout: 15000 });
    await shotAll(minh, '04-my-trips-empty');
  });

  await step('account menu', async () => {
    const accountBtn = minh.getByRole('button', { name: 'Account' });
    await accountBtn.click();
    const accountDialog = minh.getByRole('dialog', { name: 'Account' });
    await accountDialog.waitFor({ timeout: 15000 });
    await shotAll(minh, '05-account-menu');
    await minh.keyboard.press('Escape');
    await minh.waitForTimeout(300);
    if (await accountDialog.isVisible()) {
      await accountBtn.click();
    }
  });

  await step('create trip', async () => {
    await minh.getByRole('link', { name: 'New trip' }).click();
    const tripName = minh.getByLabel('Trip name');
    await tripName.waitFor({ timeout: 15000 });
    await shotAll(minh, '06-create-trip-blank');
    await tripName.fill('Đà Lạt tháng 10');
    const others = minh.getByPlaceholder('Name');
    await others.nth(0).fill('An');
    await minh.getByRole('button', { name: 'Add person' }).click();
    await others.nth(1).fill('Bình');
    await minh.getByRole('button', { name: 'Add person' }).click();
    await others.nth(2).fill('Chi');
    await minh.getByText('Your bank details (optional)').click();
    await minh.getByLabel('Bank').selectOption('970407');
    await minh.getByLabel('Account number').fill('19031234565678');
    await minh.getByLabel('Account holder name').fill('Nguyen Van Minh');
    await shotAll(minh, '07-create-trip-filled');
    await minh.getByRole('button', { name: 'Create trip' }).click();
    await minh.waitForURL(/\/t\/[^/]+$/, { timeout: 15000 });
    tripUrl = minh.url();
    tripId = tripUrl.split('/t/')[1].split(/[?#]/)[0];
    await shotAll(minh, '08-member-trip-new');
  });

  await step('first expense', async () => {
    await minh.getByRole('link', { name: '+ Add expense' }).click();
    const whatFor = minh.getByLabel('What for');
    await whatFor.waitFor({ timeout: 15000 });
    await shotAll(minh, '09-expense-form-blank');
    await whatFor.fill('Homestay Bloom');
    await minh.getByLabel('Amount', { exact: true }).fill('800.000');
    await shotAll(minh, '10-expense-form-filled');
    await minh.getByRole('button', { name: 'Add expense' }).click();
    await minh.waitForURL(tripUrl, { timeout: 15000 });
    await minh.getByText('Homestay Bloom').waitFor({ timeout: 15000 });
    await shotAll(minh, '11-member-trip-one-expense');
  });

  await step('invite sheet', async () => {
    await minh.getByRole('button', { name: 'Invite' }).click();
    const invite = minh.getByRole('dialog', { name: 'Invite' });
    await invite.waitFor({ timeout: 15000 });
    groupLink = await invite.getByLabel('Group link').inputValue();
    viewLink = await invite.getByLabel('View-only link').inputValue();
    await shotAll(minh, '12-invite-sheet');
    await minh.keyboard.press('Escape');
    await expect(invite).toHaveCount(0, { timeout: 15000 });
  });

  await step('chi joins', async () => {
    chiContext = await createContext();
    chi = await chiContext.newPage();
    await chi.goto(groupLink);
    await chi.waitForURL(/\/who$/, { timeout: 15000 });
    await shotAll(chi, '13-who-are-you');
    await chi.getByRole('radio', { name: /Chi/ }).click();
    await chi.getByRole('button', { name: 'Continue as Chi' }).click();
    await chi.getByText('Viewing as Chi').waitFor({ timeout: 15000 });
    await shotAll(chi, '14-guest-trip');
  });

  await step('chi adds two expenses', async () => {
    await chi.getByRole('link', { name: '+ Add expense' }).click();
    const whatFor1 = chi.getByLabel('What for');
    await whatFor1.waitFor({ timeout: 15000 });
    await whatFor1.fill('Bánh tráng nướng');
    await chi.getByLabel('Amount', { exact: true }).fill('180.000');
    await shotAll(chi, '15-guest-expense-form');
    await chi.getByRole('button', { name: 'Send for approval' }).click();
    await chi.getByText('Viewing as Chi').waitFor({ timeout: 15000 });

    await chi.getByRole('link', { name: '+ Add expense' }).click();
    const whatFor2 = chi.getByLabel('What for');
    await whatFor2.waitFor({ timeout: 15000 });
    await whatFor2.fill('Cà phê sữa đá');
    await chi.getByLabel('Amount', { exact: true }).fill('60.000');
    await chi.getByRole('button', { name: 'Send for approval' }).click();
    await chi.getByText('Viewing as Chi').waitFor({ timeout: 15000 });

    await chi.getByText('Waiting').first().waitFor({ timeout: 15000 });
    await shotAll(chi, '16-guest-trip-waiting');
  });

  await step('approvals', async () => {
    await minh.reload();
    const queue = minh.getByRole('region', { name: 'Needs approval' });
    await queue.getByText('1 of 2 waiting').waitFor({ timeout: 15000 });
    await shotAll(minh, '17-approval-queue');
    await queue.getByRole('link', { name: 'See all 2' }).click();
    await minh.getByText('Cà phê sữa đá').first().waitFor({ timeout: 15000 });
    await shotAll(minh, '18-approvals-list');
    for (let i = 0; i < 2; i++) {
      await minh.getByRole('button', { name: 'Approve' }).first().click();
      await minh.waitForTimeout(800);
    }
    await minh.goto(tripUrl);
    await expect(minh.getByRole('region', { name: 'Needs approval' })).toHaveCount(0, { timeout: 15000 });
  });

  await step('expense details', async () => {
    await minh.getByRole('button', { name: /^Homestay Bloom/ }).click();
    await minh.getByText('Paid by').first().waitFor({ timeout: 15000 });
    await shotAll(minh, '19-expense-details');
    await minh.goto(tripUrl);
    await minh.getByText('Homestay Bloom').waitFor({ timeout: 15000 });
  });

  await step('transfers', async () => {
    const anRow = minh.getByRole('button', { name: /^An → You/ });
    await anRow.click();
    await minh.getByRole('img', { name: /VietQR/ }).first().waitFor({ timeout: 15000 });
    await shotAll(minh, '20-transfer-open');
    await anRow.click();
    await minh.getByRole('button', { name: /^Mark .* from An as received$/ }).click();
    await minh.getByRole('button', { name: 'Undo' }).waitFor({ timeout: 15000 });
    await shotAll(minh, '21-transfer-ticked');
    await minh.waitForTimeout(7000);
    await minh.reload();
  });

  await step('payment details', async () => {
    const paidRow = minh.getByRole('button', { name: /^An → You, .*Paid ✓$/ });
    await paidRow.waitFor({ timeout: 15000 });
    await paidRow.click();
    await minh.getByText('Amount received').first().waitFor({ timeout: 15000 });
    await shotAll(minh, '22-payment-details');
    await minh.goto(tripUrl);
  });

  await step('chi pays', async () => {
    await chi.goto(tripUrl);
    await chi.getByText('You owe Minh').waitFor({ timeout: 15000 });
    await shotAll(chi, '23-guest-owes');
    await chi.getByRole('link', { name: 'Pay with VietQR' }).click();
    await chi.getByRole('img', { name: /VietQR code to pay Minh/ }).waitFor({ timeout: 15000 });
    await shotAll(chi, '24-pay-screen');
    await chi.getByRole('button', { name: "I've paid" }).click();
    // .first(): the status live region repeats the card's text.
    await chi.getByText(/^Payment sent · /).first().waitFor({ timeout: 15000 });
    await shotAll(chi, '25-pay-sent');
  });

  await step('minh confirms', async () => {
    await minh.goto(tripUrl);
    const card = minh.getByRole('region', { name: 'Needs approval' });
    await card.getByText(/^Chi says they paid you /).waitFor({ timeout: 15000 });
    await shotAll(minh, '26-confirm-card');
    await card.getByRole('button', { name: 'Confirm' }).click();
    await expect(card).toHaveCount(0, { timeout: 15000 });
    await shotAll(minh, '27-member-trip-after-confirm');
  });

  await step('settings, people, activity', async () => {
    const tabs = [
      ['settings', '28-settings', 'Danger zone'],
      ['people', '29-people', 'Organiser'],
      ['activity', '30-activity', 'Today']
    ];
    for (const [p, name, waitText] of tabs) {
      await minh.goto(`${BASE}/t/${tripId}/${p}`);
      await minh.getByText(waitText).first().waitFor({ timeout: 15000 });
      await shotAll(minh, name);
    }
  });

  await step('my trips', async () => {
    await minh.goto(BASE + '/trips');
    await minh.getByText('Đà Lạt tháng 10').first().waitFor({ timeout: 15000 });
    await shotAll(minh, '31-my-trips');
  });

  await step('view only', async () => {
    const viewerContext = await createContext();
    const viewer = await viewerContext.newPage();
    await viewer.goto(viewLink);
    await viewer.getByText('View only').first().waitFor({ timeout: 15000 });
    await shotAll(viewer, '32-view-only');
  });

  await step('guest settled', async () => {
    await chi.goto(tripUrl);
    // .first(): the balance card and Your transfers both say it.
    await chi.getByText("You're all settled").first().waitFor({ timeout: 15000 });
    await shotAll(chi, '33-guest-settled');
  });
} finally {
  await browser.close();
}

console.log(`${shots.length} screenshots in test-results/ui-audit`);
for (const overflow of overflows) {
  console.log(overflow);
}
for (const failure of failures) {
  console.log(failure);
}
process.exit(overflows.length || failures.length ? 1 : 0);
