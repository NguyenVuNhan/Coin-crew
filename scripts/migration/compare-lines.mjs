// Compares two files as sorted multisets of lines (or JSON array elements).
// Usage: node scripts/migration/compare-lines.mjs <a> <b>

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const [fileA, fileB] = process.argv.slice(2);
if (!fileA || !fileB) {
  console.error('Usage: node scripts/migration/compare-lines.mjs <a> <b>');
  process.exit(1);
}

function readLines(filePath) {
  const resolved = path.resolve(process.cwd(), filePath);
  const content = fs.readFileSync(resolved, 'utf-8');
  if (filePath.toLowerCase().endsWith('.json')) {
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item));
      }
    } catch {
      // Fall through to text split if parsing fails
    }
  }
  return content.split(/\r?\n/).filter((line) => line.length > 0);
}

const linesA = readLines(fileA);
const linesB = readLines(fileB);

const countsA = new Map();
for (const line of linesA) {
  countsA.set(line, (countsA.get(line) || 0) + 1);
}

const countsB = new Map();
for (const line of linesB) {
  countsB.set(line, (countsB.get(line) || 0) + 1);
}

const allKeys = new Set([...countsA.keys(), ...countsB.keys()]);
const sortedKeys = Array.from(allKeys).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

const removed = [];
const added = [];

for (const key of sortedKeys) {
  const cA = countsA.get(key) || 0;
  const cB = countsB.get(key) || 0;
  if (cA > cB) {
    for (let i = 0; i < cA - cB; i++) {
      removed.push(key);
    }
  } else if (cB > cA) {
    for (let i = 0; i < cB - cA; i++) {
      added.push(key);
    }
  }
}

if (removed.length === 0 && added.length === 0) {
  console.log('identical');
  process.exit(0);
}

for (const line of removed) {
  console.log(`- ${line}`);
}
for (const line of added) {
  console.log(`+ ${line}`);
}
console.log(`${removed.length} removed, ${added.length} added`);
process.exit(1);
