import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const banksJsonPath = resolve(scriptDir, '../src/data/banks.json');
const bankAppsJsonPath = resolve(scriptDir, '../src/data/bank-apps.json');
const logosDir = resolve(scriptDir, '../../../web/screens/src/assets/bank-apps');

const ENDPOINTS = {
  android: 'https://api.vietqr.io/v2/android-app-deeplinks',
  ios: 'https://api.vietqr.io/v2/ios-app-deeplinks',
};

async function fetchPlatformApps(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  if (!data || !Array.isArray(data.apps)) {
    throw new Error(`Unexpected response shape from ${url}`);
  }
  return data.apps;
}

async function downloadLogo(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch logo ${url}: ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(destPath, buf);
}

async function main() {
  const banksRaw = await readFile(banksJsonPath, 'utf8');
  const banks = JSON.parse(banksRaw);
  const bankByName = new Map(banks.map((b) => [b.name, b]));

  await mkdir(logosDir, { recursive: true });

  const result = { android: [], ios: [] };

  for (const [platform, url] of Object.entries(ENDPOINTS)) {
    const rawApps = await fetchPlatformApps(url);
    const mapped = [];

    for (const app of rawApps) {
      const bank = bankByName.get(app.bankName);
      mapped.push({
        appId: app.appId,
        appName: app.appName,
        bankName: app.bankName,
        bankShortName: bank ? bank.shortName : null,
        bankCode: bank ? bank.code : null,
        monthlyInstall: Number(app.monthlyInstall) || 0,
      });

      if (app.appLogo) {
        const logoPath = resolve(logosDir, `${platform}-${app.appId}.webp`);
        await downloadLogo(app.appLogo, logoPath);
      }
    }

    mapped.sort((a, b) => b.monthlyInstall - a.monthlyInstall);
    result[platform] = mapped;
  }

  await writeFile(bankAppsJsonPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
