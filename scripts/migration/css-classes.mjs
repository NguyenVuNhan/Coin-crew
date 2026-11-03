// Extracts unique CSS class selectors from apps/api/public/assets/*.css and writes them sorted to a file.
// Usage: node scripts/migration/css-classes.mjs <out.txt>

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const outFile = process.argv[2];
if (!outFile) {
  console.error('Usage: node scripts/migration/css-classes.mjs <out.txt>');
  process.exit(1);
}

const repoRoot = process.cwd();
const assetsDir = path.resolve(repoRoot, 'apps/api/public/assets');

if (!fs.existsSync(assetsDir) || !fs.statSync(assetsDir).isDirectory()) {
  console.error('No CSS files found: apps/api/public/assets directory does not exist');
  process.exit(1);
}

const entries = fs.readdirSync(assetsDir, { withFileTypes: true });
const cssFiles = entries
  .filter((entry) => entry.isFile() && entry.name.endsWith('.css'))
  .map((entry) => path.join(assetsDir, entry.name));

if (cssFiles.length === 0) {
  console.error('No CSS files found matching apps/api/public/assets/*.css');
  process.exit(1);
}

const classRegex = /\.(?:\\.|[A-Za-z0-9_-])+/g;
const uniqueClasses = new Set();

for (const filePath of cssFiles) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const matches = content.match(classRegex);
  if (matches) {
    for (const cls of matches) {
      uniqueClasses.add(cls);
    }
  }
}

const sortedClasses = Array.from(uniqueClasses).sort((a, b) =>
  a < b ? -1 : a > b ? 1 : 0
);

const resolvedOut = path.resolve(repoRoot, outFile);
fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });
fs.writeFileSync(resolvedOut, sortedClasses.join('\n') + '\n', 'utf-8');

console.log(sortedClasses.length);
