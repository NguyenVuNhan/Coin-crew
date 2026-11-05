/// <reference types="node" />
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const langs = ['vi', 'en'] as const;
const sizes = [
  { name: 'phone', width: 375, height: 812 },
  { name: 'desktop', width: 1280, height: 800 },
] as const;

function getPath(urlStr: string): string {
  try {
    const u = new URL(urlStr);
    return u.pathname + u.search;
  } catch {
    return urlStr;
  }
}

for (const lang of langs) {
  for (const size of sizes) {
    test.describe(`${lang}-${size.name}`, () => {
      test.skip(process.env.WALKTHROUGH !== '1', 'Opt-in: WALKTHROUGH=1');
      test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });

      test('walkthrough', async ({ browser }, testInfo) => {
        test.setTimeout(600_000);

        const shotsDir = path.join(process.cwd(), 'walkthrough-shots', `${lang}-${size.name}`);
        await fs.promises.mkdir(shotsDir, { recursive: true });

        const logEntries: Array<{ file: string; path: string }> = [];
        const failedSteps: Array<{ name: string; message: string }> = [];
        let shotCounter = 1;

        let activePage: Page | undefined = undefined;

        async function createContext(options?: { userAgent?: string }): Promise<BrowserContext> {
          const context = await browser.newContext({
            viewport: { width: size.width, height: size.height },
            locale: 'en-US',
            userAgent: options?.userAgent,
          });
          await context.addInitScript((l: string) => localStorage.setItem('lang', l), lang);
          return context;
        }

        async function shot(stepName: string, pageOverride?: Page) {
          const p = pageOverride ?? activePage;
          if (!p || p.isClosed()) return;
          const nn = String(shotCounter++).padStart(2, '0');
          const filename = `${nn}-${stepName}.png`;
          const filePath = path.join(shotsDir, filename);
          await p.waitForTimeout(500);
          await p.screenshot({ path: filePath, fullPage: true });
          logEntries.push({ file: filename, path: getPath(p.url()) });
        }

        async function step(name: string, fn: () => Promise<void>) {
          try {
            await test.step(name, async () => {
              await fn();
            });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            testInfo.annotations.push({
              type: 'walkthrough-failed',
              description: `${name}: ${message}`,
            });
            failedSteps.push({ name, message });
            if (activePage && !activePage.isClosed()) {
              try {
                const nn = String(shotCounter++).padStart(2, '0');
                const file = `${nn}-${name}-FAILED.png`;
                const filePath = path.join(shotsDir, file);
                await activePage.waitForTimeout(500);
                await activePage.screenshot({ path: filePath, fullPage: true });
                logEntries.push({ file, path: getPath(activePage.url()) });
                try {
                  fs.copyFileSync(filePath, path.join(shotsDir, `${name}-FAILED.png`));
                } catch {
                  // ignore copy failure
                }
              } catch {
                // ignore screenshot failure
              }
            }
          }
        }

        // Shared variables across steps
        const minhSub = `${lang}-${size.name}-minh`;
        let minhContext: BrowserContext | undefined;
        let minh: Page | undefined;
        let sportTripUrl = '';
        let sportTripId = '';
        let sportGroupToken = '';
        let expenseId = '';

        let daLatTripId = '';
        let daLatGroupToken = '';
        let minhPid = '';
        let anPid = '';
        let binhPid = '';
        let chiPid = '';
        let dungPid = '';

        let noBankTripId = '';
        let noBankGroupToken = '';
        let noBankMinhPid = '';

        let chiGuestContext: BrowserContext | undefined;
        let chiGuestPage: Page | undefined;

        // Step 1: Minh signs in and consents (setup through the API), then creates sport group in UI
        await step('01-minh-create-sport-group', async () => {
          minhContext = await createContext();
          minh = await minhContext.newPage();
          activePage = minh;

          const loginRes = await minh.request.post('/api/test/login', {
            data: { sub: minhSub, name: 'Minh', email: `${minhSub}@example.com` },
          });
          expect(loginRes.ok()).toBe(true);

          const consentRes = await minh.request.post('/api/me/consent');
          expect(consentRes.ok()).toBe(true);

          await minh.goto('/groups');

          const newGroupBtn = minh
            .getByRole('link', { name: lang === 'vi' ? 'Tạo nhóm mới' : 'New group' })
            .or(minh.getByRole('button', { name: lang === 'vi' ? 'Tạo nhóm mới' : 'New group' }))
            .or(minh.locator('a[href="/trips/new"]'));
          await newGroupBtn.first().click();

          await minh.getByRole('radio', { name: lang === 'vi' ? 'Nhóm thể thao' : 'Sport group' }).click();

          const groupNameInput = minh.getByLabel(lang === 'vi' ? 'Tên nhóm' : 'Group name');
          await groupNameInput.fill('Cầu lông CN');

          const peopleNames = ['Bình', 'Chi', 'Tuấn Anh', 'Dũng', 'Nguyễn Thị Thanh Hương'];
          const namePlaceholder = lang === 'vi' ? 'Tên' : 'Name';
          const addPersonBtnName = lang === 'vi' ? 'Thêm người' : 'Add person';

          for (let i = 0; i < peopleNames.length; i++) {
            const inputs = minh.getByPlaceholder(namePlaceholder);
            await inputs.nth(i).fill(peopleNames[i]!);
            if (i < peopleNames.length - 1) {
              await minh.getByRole('button', { name: addPersonBtnName }).click();
            }
          }

          const bankDetailsText =
            lang === 'vi'
              ? 'Thông tin ngân hàng của bạn (không bắt buộc)'
              : 'Your bank details (optional)';
          await minh.getByText(bankDetailsText).click();

          const bankCombobox = minh.getByRole('combobox', { name: lang === 'vi' ? 'Ngân hàng' : 'Bank' });
          await bankCombobox.click();

          const bankSearch = minh.getByPlaceholder(lang === 'vi' ? 'Tìm ngân hàng' : 'Search banks');
          await bankSearch.fill('Techcombank');

          await minh.getByRole('option', { name: /^Techcombank/ }).first().click();
          await expect(bankCombobox).toContainText('Techcombank');

          await minh.getByLabel(lang === 'vi' ? 'Số tài khoản' : 'Account number').fill('19031234565678');
          await minh
            .getByLabel(lang === 'vi' ? 'Tên chủ tài khoản' : 'Account holder name')
            .fill('Nguyen Van Minh');

          await shot('01-create-sport-group');

          await minh.getByRole('button', { name: lang === 'vi' ? 'Tạo nhóm' : 'Create group' }).click();
          await expect(minh).toHaveURL(/\/t\/[^/]+$/);

          sportTripUrl = minh.url();
          sportTripId = sportTripUrl.match(/\/t\/([^/]+)$/)![1]!;

          const tripViewRes = await minh.request.get(`/api/trips/${sportTripId}`);
          const tripView = await tripViewRes.json();
          sportGroupToken = tripView.links.group;
        });

        // Step 2: Minh records the session in UI, screenshots group page, opens session details, screenshots
        await step('02-minh-record-session', async () => {
          if (!minh) return;
          activePage = minh;

          // The add button sits in a different place on phones and desktops: open the form by its address.
          await minh.goto(`${sportTripUrl}/expenses/new`);

          const whatFor = minh
            .getByLabel(lang === 'vi' ? 'Chi tiêu cho' : 'What for')
            .or(minh.locator('#expense-what-for'));
          await whatFor.fill('Sunday badminton');

          const courtInput = minh
            .getByLabel(lang === 'vi' ? /^Tiền sân/ : /^Court/)
            .or(minh.locator('#sport-court'));
          await courtInput.fill('400k');

          const addShuttleBtn = minh.getByRole('button', {
            name: lang === 'vi' ? /Thêm tiền cầu/ : /Add shuttlecock/,
          });
          if (await addShuttleBtn.isVisible()) {
            await addShuttleBtn.click();
          }

          const qtyInput = minh
            .getByLabel(lang === 'vi' ? /SL/ : /Qty/)
            .or(minh.locator('.fsl-input--qty'))
            .first();
          await qtyInput.fill('6');

          const unitPriceInput = minh
            .getByLabel(lang === 'vi' ? /Đơn giá/ : /Unit price/)
            .or(minh.locator('.fsl-input--unit-price'))
            .first();
          await unitPriceInput.fill('26k');

          const addExpenseSubmit = minh.getByRole('button', {
            name: lang === 'vi' ? 'Thêm khoản chi' : 'Add expense',
          });
          await addExpenseSubmit.click();
          // The form lives at /expenses/new; wait for the saved bill's own page.
          await expect(minh).toHaveURL(/\/expenses\/(?!new$)[^/?#]+$/);
          expenseId = minh.url().match(/\/expenses\/([^/?#]+)$/)![1]!;

          await shot('03-session-details');

          await minh.goto(sportTripUrl);
          await shot('02-sport-group-page');
        });

        // Step 3: Minh's People page and Settings page
        await step('03-minh-people-and-settings', async () => {
          if (!minh) return;
          activePage = minh;

          await minh.goto(`${sportTripUrl}/people`);
          await shot('04-sport-people-page');

          await minh.goto(`${sportTripUrl}/settings`);
          await shot('05-sport-settings-page');
        });

        // Step 4: Zalo userAgent session details -> tap "Share bill & QR" -> wait 1.5s -> screenshot
        await step('04-zalo-share-bill-qr', async () => {
          if (!expenseId) throw new Error('no expense id from step 2');

          const zaloContext = await createContext({
            userAgent:
              'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36 Zalo/1.0',
          });
          const zaloPage = await zaloContext.newPage();
          activePage = zaloPage;

          await zaloPage.request.post('/api/test/login', {
            data: { sub: minhSub, name: 'Minh', email: `${minhSub}@example.com` },
          });

          await zaloPage.goto(`${sportTripUrl}/expenses/${expenseId}`);

          const shareBillBtn = zaloPage.getByRole('button', {
            name: lang === 'vi' ? 'Chia sẻ bill & QR' : 'Share bill & QR',
          });
          await shareBillBtn.click();

          await zaloPage.waitForTimeout(1500);
          await shot('06-zalo-bill-image', zaloPage);
          await zaloContext.close();

          activePage = minh;
        });

        // Step 5: Setup through API
        await step('05-setup-api-dalat-and-nobank', async () => {
          if (!minh) return;

          // Minh creates trip group "Đà Lạt" with bank and An, Bình, Chi, Dũng
          const daLatRes = await minh.request.post('/api/trips', {
            data: {
              name: 'Đà Lạt',
              preset: 'trip',
              // Guests see a group in its own language, so the group carries this run's language.
              defaultLang: lang,
              people: ['An', 'Bình', 'Chi', 'Dũng'],
              myBank: {
                bin: '970407',
                accountNumber: '19031234565678',
                holderName: 'Nguyen Van Minh',
              },
            },
          });
          expect(daLatRes.ok()).toBe(true);
          const daLatJson = await daLatRes.json();
          daLatTripId = daLatJson.tripId;

          const daLatViewRes = await minh.request.get(`/api/trips/${daLatTripId}`);
          const daLatView = await daLatViewRes.json();
          daLatGroupToken = daLatView.links.group;

          minhPid = daLatView.me.participantId;
          anPid = daLatView.people.find((p: { name: string; id: string }) => p.name === 'An')!.id;
          binhPid = daLatView.people.find((p: { name: string; id: string }) => p.name === 'Bình')!.id;
          chiPid = daLatView.people.find((p: { name: string; id: string }) => p.name === 'Chi')!.id;
          dungPid = daLatView.people.find((p: { name: string; id: string }) => p.name === 'Dũng')!.id;

          // "Homestay" 800.000 paid by Minh split equally between Minh, An, Bình, Chi
          const homestayRes = await minh.request.post(`/api/trips/${daLatTripId}/expenses`, {
            data: {
              description: 'Homestay',
              amount: 800000,
              spentOn: '2026-11-05',
              payerId: minhPid,
              mode: 'equal',
              entries: [minhPid, anPid, binhPid, chiPid].map((id) => ({ participantId: id, value: 1 })),
            },
          });
          expect(homestayRes.ok()).toBe(true);

          // "Taxi" 200.000 paid by Bình split equally between Minh, Bình, Chi, An
          const taxiRes = await minh.request.post(`/api/trips/${daLatTripId}/expenses`, {
            data: {
              description: 'Taxi',
              amount: 200000,
              spentOn: '2026-11-05',
              payerId: binhPid,
              mode: 'equal',
              entries: [minhPid, binhPid, chiPid, anPid].map((id) => ({ participantId: id, value: 1 })),
            },
          });
          expect(taxiRes.ok()).toBe(true);

          // Group "Không ngân hàng" with no bank details and people Chi, An
          const noBankRes = await minh.request.post('/api/trips', {
            data: {
              name: 'Không ngân hàng',
              preset: 'trip',
              defaultLang: lang,
              people: ['Chi', 'An'],
            },
          });
          expect(noBankRes.ok()).toBe(true);
          const noBankJson = await noBankRes.json();
          noBankTripId = noBankJson.tripId;

          const noBankViewRes = await minh.request.get(`/api/trips/${noBankTripId}`);
          const noBankView = await noBankViewRes.json();
          noBankGroupToken = noBankView.links.group;
          noBankMinhPid = noBankView.me.participantId;
          const noBankChiPid = noBankView.people.find((p: { name: string; id: string }) => p.name === 'Chi')!.id;
          const noBankAnPid = noBankView.people.find((p: { name: string; id: string }) => p.name === 'An')!.id;

          // "Ăn tối" 300.000 paid by Minh split equally among Minh, Chi, An
          const dinnerRes = await minh.request.post(`/api/trips/${noBankTripId}/expenses`, {
            data: {
              description: 'Ăn tối',
              amount: 300000,
              spentOn: '2026-11-05',
              // An paid: bank details belong to an account, so Minh's would show here too; An has none.
              payerId: noBankAnPid,
              mode: 'equal',
              entries: [noBankMinhPid, noBankChiPid, noBankAnPid].map((id) => ({ participantId: id, value: 1 })),
            },
          });
          expect(dinnerRes.ok()).toBe(true);
        });

        // Step 5b: the "pay me" link (/owe) on new phones: Chi owes two people, Dũng owes nothing,
        // and in the group without bank details Chi owes one person (straight to that pay screen).
        await step('05b-pay-links', async () => {
          const openOwe = async (token: string, who: string, shotName: string) => {
            const ctx = await createContext();
            const page = await ctx.newPage();
            activePage = page;
            await page.goto(`/j/${token}/owe`);
            await page.getByRole('radio', { name: new RegExp(who) }).click();
            await page
              .getByRole('button', { name: lang === 'vi' ? `Tiếp tục với tên ${who}` : `Continue as ${who}` })
              .click();
            await page.waitForURL((u) => !u.pathname.endsWith('/who'));
            await shot(shotName, page);
            await ctx.close();
          };
          await openOwe(daLatGroupToken, 'Chi', 'pay-link-chi-owes-two');
          await openOwe(daLatGroupToken, 'Dũng', 'pay-link-dung-all-set');
          await openOwe(noBankGroupToken, 'Chi', 'pay-link-nobank-owes-one');
        });

        // Step 6: Guest phone on Đà Lạt link -> screenshot "Who are you?" -> pick Chi -> Continue -> screenshot landing -> follow pay link for Minh if visible -> screenshot
        await step('06-guest-chi-dalat', async () => {
          chiGuestContext = await createContext();
          chiGuestPage = await chiGuestContext.newPage();
          activePage = chiGuestPage;

          await chiGuestPage.goto(`/j/${daLatGroupToken}`);
          await expect(chiGuestPage).toHaveURL(/\/who(\?.*)?$/);
          await shot('07-dalat-who-are-you', chiGuestPage);

          await chiGuestPage.getByRole('radio', { name: /Chi/ }).click();

          const continueChiBtn = chiGuestPage.getByRole('button', {
            name: lang === 'vi' ? /Tiếp tục.*Chi/ : /Continue as Chi/,
          });
          await continueChiBtn.click();
          await expect(chiGuestPage).toHaveURL(new RegExp(`/j/${daLatGroupToken}$`));
          await shot('08-dalat-chi-landing-page', chiGuestPage);

          const payMinhBtn = chiGuestPage
            .getByRole('link', {
              name: lang === 'vi' ? /Pay with VietQR|VietQR/ : /Pay with VietQR/,
            })
            .or(chiGuestPage.locator(`a[href*="/pay/${minhPid}"]`));

          if (await payMinhBtn.isVisible()) {
            await payMinhBtn.click();
            await shot('09-dalat-chi-pay-screen', chiGuestPage);
          }
        });

        // Step 7: Guest phone on Đà Lạt group link picks Dũng -> screenshot landing page
        await step('07-guest-dung-dalat', async () => {
          const dungGuestContext = await createContext();
          const dungGuestPage = await dungGuestContext.newPage();
          activePage = dungGuestPage;

          await dungGuestPage.goto(`/j/${daLatGroupToken}`);
          await expect(dungGuestPage).toHaveURL(/\/who(\?.*)?$/);
          await dungGuestPage.getByRole('radio', { name: /Dũng/ }).click();

          const continueDungBtn = dungGuestPage.getByRole('button', {
            name: lang === 'vi' ? /Tiếp tục.*Dũng/ : /Continue as Dũng/,
          });
          await continueDungBtn.click();
          await expect(dungGuestPage).toHaveURL(new RegExp(`/j/${daLatGroupToken}$`));

          await shot('10-dalat-dung-landing-page', dungGuestPage);
          await dungGuestContext.close();

          activePage = chiGuestPage;
        });

        // Step 8: Guest phone on "Không ngân hàng"'s link picks Chi -> screenshot -> open pay screen for Minh if reachable -> screenshot
        await step('08-guest-chi-nobank', async () => {
          const noBankChiContext = await createContext();
          const noBankChiPage = await noBankChiContext.newPage();
          activePage = noBankChiPage;

          await noBankChiPage.goto(`/j/${noBankGroupToken}`);
          await expect(noBankChiPage).toHaveURL(/\/who(\?.*)?$/);
          await noBankChiPage.getByRole('radio', { name: /Chi/ }).click();

          const continueNoBankChiBtn = noBankChiPage.getByRole('button', {
            name: lang === 'vi' ? /Tiếp tục.*Chi/ : /Continue as Chi/,
          });
          await continueNoBankChiBtn.click();
          await expect(noBankChiPage).toHaveURL(new RegExp(`/j/${noBankGroupToken}$`));

          await shot('11-nobank-chi-landing-page', noBankChiPage);

          const noBankPayBtn = noBankChiPage
            .getByRole('link', {
              name: lang === 'vi' ? /Pay with VietQR|VietQR/ : /Pay with VietQR/,
            })
            .or(noBankChiPage.locator(`a[href*="/pay/"]`));

          if (await noBankPayBtn.isVisible()) {
            await noBankPayBtn.click();
            await shot('12-nobank-chi-pay-screen', noBankChiPage);
          } else {
            try {
              await noBankChiPage.goto(`/j/${noBankGroupToken}/pay/${noBankMinhPid}`);
              await shot('12-nobank-chi-pay-screen', noBankChiPage);
            } catch {
              // pay screen not reachable
            }
          }

          await noBankChiContext.close();
          activePage = chiGuestPage;
        });

        // Step 9: Chi marks "I've paid" on pay screen for Minh -> screenshot -> Minh confirms it -> screenshot Minh's page -> reload Chi's -> screenshot
        await step('09-chi-pays-minh-confirms', async () => {
          if (!chiGuestPage || !minh) return;
          activePage = chiGuestPage;

          if (!chiGuestPage.url().includes(`/pay/${minhPid}`)) {
            const payMinhBtn = chiGuestPage
              .getByRole('link', {
                name: lang === 'vi' ? /Pay with VietQR|VietQR/ : /Pay with VietQR/,
              })
              .or(chiGuestPage.locator(`a[href*="/pay/${minhPid}"]`));
            if (await payMinhBtn.isVisible()) {
              await payMinhBtn.click();
            } else {
              await chiGuestPage.goto(`/j/${daLatGroupToken}/pay/${minhPid}`);
            }
          }

          const iPaidBtn = chiGuestPage.getByRole('button', {
            name: lang === 'vi' ? 'Tôi đã chuyển' : "I've paid",
          });
          await iPaidBtn.click();
          await shot('13-chi-marked-paid', chiGuestPage);

          activePage = minh;
          await minh.goto(`/t/${daLatTripId}`);

          try {
            const approvals = minh.getByRole('region', {
              name: lang === 'vi' ? 'Cần duyệt' : 'Needs approval',
            });
            const confirmBtn = approvals.getByRole('button', {
              name: lang === 'vi' ? 'Xác nhận' : 'Confirm',
            });
            await confirmBtn.waitFor({ state: 'visible', timeout: 5000 });
            await confirmBtn.click();
          } catch {
            const viewRes = await minh.request.get(`/api/trips/${daLatTripId}`);
            const viewData = await viewRes.json();
            const payment = viewData.payments?.find(
              (p: { status: string; toId: string; id: string }) => p.status === 'says_paid' && p.toId === minhPid,
            );
            if (payment) {
              await minh.request.post(`/api/trips/${daLatTripId}/payments/${payment.id}/confirm`);
            }
            await minh.reload();
          }

          await shot('14-minh-confirmed-page', minh);

          activePage = chiGuestPage;
          await chiGuestPage.reload();
          await shot('15-chi-reloaded-settled', chiGuestPage);
        });

        // Step 10: Bill link on new guest phone -> screenshot first screen -> pick Bình -> Continue -> screenshot -> reload same link in same context -> screenshot
        await step('10-guest-bill-link-binh', async () => {
          if (!expenseId) throw new Error('no expense id from step 2');

          const billGuestContext = await createContext();
          const billGuestPage = await billGuestContext.newPage();
          activePage = billGuestPage;

          await billGuestPage.goto(`/j/${sportGroupToken}/e/${expenseId}`);
          await shot('16-bill-guest-first-screen', billGuestPage);

          await billGuestPage.getByRole('radio', { name: /Bình/ }).click();

          const continueBinhBtn = billGuestPage.getByRole('button', {
            name: lang === 'vi' ? /Tiếp tục.*Bình/ : /Continue as Bình/,
          });
          await continueBinhBtn.click();
          await shot('17-bill-guest-binh-screen', billGuestPage);

          // The bill opens in a sheet over the QR.
          await billGuestPage.getByRole('button', { name: lang === 'vi' ? 'Xem bill' : 'View the bill' }).click();
          await shot('17b-bill-sheet', billGuestPage);
          await billGuestPage.keyboard.press('Escape');

          await billGuestPage.goto(`/j/${sportGroupToken}/e/${expenseId}`);
          await shot('18-bill-guest-binh-reloaded', billGuestPage);

          await billGuestContext.close();
        });

        // Step 11: Minh opens his own bill link `/j/<sport token>/e/<expenseId>` -> screenshot
        await step('11-minh-opens-own-bill-link', async () => {
          if (!expenseId) throw new Error('no expense id from step 2');
          if (!minh) return;
          activePage = minh;

          await minh.goto(`/j/${sportGroupToken}/e/${expenseId}`);
          await shot('19-minh-own-bill-link', minh);
        });

        // Step 12: Signed-in newcomer "Nhân" opens sport group link -> screenshot -> taps "Join as Nhân" -> screenshot
        await step('12-nhan-join-sport-group', async () => {
          const nhanContext = await createContext();
          const nhanPage = await nhanContext.newPage();
          activePage = nhanPage;

          const nhanSub = `${lang}-${size.name}-nhan`;
          await nhanPage.request.post('/api/test/login', {
            data: { sub: nhanSub, name: 'Nhân', email: `${nhanSub}@example.com` },
          });
          await nhanPage.request.post('/api/me/consent');

          await nhanPage.goto(`/j/${sportGroupToken}`);
          await shot('20-nhan-opens-sport-group', nhanPage);

          const joinBtn = nhanPage.getByRole('button', {
            name: lang === 'vi' ? /Tham gia với tên Nhân/ : /Join as Nhân/,
          });
          await joinBtn.click();
          await shot('21-nhan-tapped-join', nhanPage);

          await nhanContext.close();
        });

        // Step 13: Signed-in newcomer "Hoa" opens the bill link -> screenshot
        await step('13-hoa-opens-bill-link', async () => {
          if (!expenseId) throw new Error('no expense id from step 2');

          const hoaContext = await createContext();
          const hoaPage = await hoaContext.newPage();
          activePage = hoaPage;

          const hoaSub = `${lang}-${size.name}-hoa`;
          await hoaPage.request.post('/api/test/login', {
            data: { sub: hoaSub, name: 'Hoa', email: `${hoaSub}@example.com` },
          });
          await hoaPage.request.post('/api/me/consent');

          await hoaPage.goto(`/j/${sportGroupToken}/e/${expenseId}`);
          await shot('22-hoa-opens-bill-link', hoaPage);

          // Join from the bill link (a new account has no gender, so a sport group asks first).
          await hoaPage.getByRole('button', { name: lang === 'vi' ? /Tham gia với tên Hoa$/ : /Join as Hoa$/ }).first().click();
          await hoaPage.getByRole('button', { name: lang === 'vi' ? 'Giới tính của Hoa' : 'Gender for Hoa' }).click();
          await shot('23-hoa-join-gender', hoaPage);
          await hoaPage
            .getByRole('button', { name: lang === 'vi' ? 'Tham gia với tên Hoa' : 'Join as Hoa', exact: true })
            .click();
          await hoaPage.waitForURL(/\/pay$/);
          await shot('24-hoa-after-join', hoaPage);

          await hoaContext.close();
        });

        // Cleanup contexts
        const toCloseChi = chiGuestContext as BrowserContext | undefined;
        if (toCloseChi) {
          await toCloseChi.close().catch(() => {});
        }
        const toCloseMinh = minhContext as BrowserContext | undefined;
        if (toCloseMinh) {
          await toCloseMinh.close().catch(() => {});
        }

        // Write log.txt
        const logLines: string[] = [];
        for (const entry of logEntries) {
          logLines.push(`${entry.file} ${entry.path}`);
        }
        if (failedSteps.length > 0) {
          logLines.push('');
          logLines.push('Failed steps:');
          for (const f of failedSteps) {
            logLines.push(`${f.name}: ${f.message}`);
          }
        } else {
          logLines.push('');
          logLines.push('Failed steps: none');
        }

        await fs.promises.writeFile(path.join(shotsDir, 'log.txt'), logLines.join('\n'), 'utf-8');
      });
    });
  }
}
