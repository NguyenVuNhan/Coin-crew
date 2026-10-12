// Snapshots VietQR's public bank list and bank-app deeplink lists into packages/core/src/data.
// Run manually: node scripts/snapshot-vietqr-data.mjs
import { writeFile } from 'node:fs/promises';

const get = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
};

const banks = (await get('https://api.vietqr.io/v2/banks')).data.map(({ bin, shortName, name, code }) => ({ bin: String(bin), shortName, name, code }));
const apps = async (os) =>
  (await get(`https://api.vietqr.io/v2/${os}-app-deeplinks`)).apps.map(({ appId, appName, autofill }) => ({ appId, appName, autofill: autofill === 1 }));

const out = new URL('../packages/core/src/data/', import.meta.url);
await writeFile(new URL('banks.json', out), JSON.stringify(banks, null, 2) + '\n');
await writeFile(new URL('bank-apps.json', out), JSON.stringify({ android: await apps('android'), ios: await apps('ios') }, null, 2) + '\n');
console.log(`banks: ${banks.length}`);
