import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const EXTENSIONS = ['', '.ts', '.tsx', '.mts', '/index.ts', '/index.tsx'];
const KNOWN_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx', '.json', '.css']);

/**
 * Scan root package.json "workspaces" globs and extract workspace package information.
 */
export function getWorkspacePackages(root) {
  const rootPkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(rootPkgPath)) return [];
  const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));
  const patterns = Array.isArray(rootPkg.workspaces)
    ? rootPkg.workspaces
    : (rootPkg.workspaces?.packages || []);

  const pkgDirs = new Set();

  function expandGlob(currentDir, segments) {
    if (segments.length === 0) {
      if (fs.existsSync(path.join(currentDir, 'package.json'))) {
        pkgDirs.add(path.relative(root, currentDir).replace(/\\/g, '/'));
      }
      return;
    }
    const [seg, ...rest] = segments;
    if (seg === '*') {
      if (!fs.existsSync(currentDir)) return;
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'dist') {
          expandGlob(path.join(currentDir, entry.name), rest);
        }
      }
    } else {
      const nextDir = path.join(currentDir, seg);
      if (fs.existsSync(nextDir)) {
        expandGlob(nextDir, rest);
      }
    }
  }

  for (const pattern of patterns) {
    const segments = pattern.split('/').filter(Boolean);
    expandGlob(root, segments);
  }

  const packages = [];
  for (const relDir of pkgDirs) {
    const pkgJsonPath = path.join(root, relDir, 'package.json');
    try {
      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
      if (pkgJson.name) {
        let exportsMap = {};
        if (typeof pkgJson.exports === 'string') {
          exportsMap = { '.': pkgJson.exports };
        } else if (pkgJson.exports && typeof pkgJson.exports === 'object') {
          exportsMap = { ...pkgJson.exports };
        }
        packages.push({
          name: pkgJson.name,
          dir: relDir,
          exports: exportsMap,
        });
      }
    } catch {
      // ignore invalid package.json
    }
  }

  // Sort longest dir first for correct ownership matching
  packages.sort((a, b) => b.dir.length - a.dir.length);
  return packages;
}

/**
 * Determine which workspace package owns the given file path.
 */
export function getOwningPackage(filePath, packages) {
  for (const pkg of packages) {
    if (filePath === pkg.dir || filePath.startsWith(pkg.dir + '/')) {
      return pkg;
    }
  }
  return null;
}

/**
 * Check if candidate file exists on disk trying standard extensions.
 */
function probeFile(root, basePath) {
  const cleanBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
  for (const ext of EXTENSIONS) {
    const candidate = cleanBase + ext;
    const full = path.join(root, candidate);
    if (fs.existsSync(full)) {
      try {
        if (fs.statSync(full).isFile()) {
          return candidate.replace(/\\/g, '/');
        }
      } catch {
        // ignore
      }
    }
  }
  // TypeScript's NodeNext style: './app.js' names './app.ts' (and '.mjs' names '.mts').
  const jsExt = cleanBase.match(/\.(m?)js$/);
  if (jsExt) {
    const stem = cleanBase.slice(0, -jsExt[0].length);
    for (const ext of jsExt[1] ? ['.mts'] : ['.ts', '.tsx']) {
      const candidate = stem + ext;
      const full = path.join(root, candidate);
      if (fs.existsSync(full) && fs.statSync(full).isFile()) return candidate.replace(/\\/g, '/');
    }
  }
  return null;
}

/**
 * Find all import/export/mock specifiers in TypeScript/JavaScript file contents.
 */
function findSpecifiers(content) {
  const specifiers = [];

  function isInsideComment(idx) {
    const lineStart = content.lastIndexOf('\n', idx) + 1;
    const beforeOnLine = content.slice(lineStart, idx);
    if (beforeOnLine.trimStart().startsWith('//')) return true;
    const lastBlockOpen = content.lastIndexOf('/*', idx);
    if (lastBlockOpen !== -1) {
      const lastBlockClose = content.lastIndexOf('*/', idx);
      if (lastBlockClose === -1 || lastBlockClose < lastBlockOpen) {
        return true;
      }
    }
    return false;
  }

  // 1. import ... from '...' or export ... from '...'
  const fromRegex = /(?:^|[;\s])(?:import|export)\b(?:(?!import|export)[\s\S])*?\bfrom\s*(['"])([^'"]+)\1/g;
  let match;
  while ((match = fromRegex.exec(content)) !== null) {
    const quote = match[1];
    const raw = match[2];
    const full = match[0];
    const quoteWithSpec = quote + raw + quote;
    const quoteIdx = full.lastIndexOf(quoteWithSpec);
    const start = match.index + quoteIdx + 1;
    const end = start + raw.length;
    if (!isInsideComment(start)) {
      specifiers.push({ start, end, quote, raw });
    }
  }

  // 2. Side-effect import '...'
  const sideEffectRegex = /(?:^|[;\s])import\s*(['"])([^'"]+)\1/g;
  while ((match = sideEffectRegex.exec(content)) !== null) {
    const quote = match[1];
    const raw = match[2];
    const full = match[0];
    const quoteWithSpec = quote + raw + quote;
    const quoteIdx = full.lastIndexOf(quoteWithSpec);
    const start = match.index + quoteIdx + 1;
    const end = start + raw.length;
    if (!isInsideComment(start)) {
      specifiers.push({ start, end, quote, raw });
    }
  }

  // 3. Dynamic import('...')
  const dynamicImportRegex = /\bimport\s*\(\s*(['"])([^'"]+)\1/g;
  while ((match = dynamicImportRegex.exec(content)) !== null) {
    const quote = match[1];
    const raw = match[2];
    const full = match[0];
    const quoteWithSpec = quote + raw + quote;
    const quoteIdx = full.lastIndexOf(quoteWithSpec);
    const start = match.index + quoteIdx + 1;
    const end = start + raw.length;
    if (!isInsideComment(start)) {
      specifiers.push({ start, end, quote, raw });
    }
  }

  // 4. vi.mock / vi.doMock / vi.unmock / vi.importActual / vi.importMock
  const viRegex = /\bvi\.(?:mock|doMock|unmock|importActual|importMock)(?:<(?:[^<>]|<[^>]*>)*>)?\s*\(\s*(['"])([^'"]+)\1/g;
  while ((match = viRegex.exec(content)) !== null) {
    const quote = match[1];
    const raw = match[2];
    const full = match[0];
    const quoteWithSpec = quote + raw + quote;
    const quoteIdx = full.lastIndexOf(quoteWithSpec);
    const start = match.index + quoteIdx + 1;
    const end = start + raw.length;
    if (!isInsideComment(start)) {
      specifiers.push({ start, end, quote, raw });
    }
  }

  // Deduplicate by start position and sort ascending
  const seen = new Set();
  const unique = [];
  for (const s of specifiers) {
    if (!seen.has(s.start)) {
      seen.add(s.start);
      unique.push(s);
    }
  }
  unique.sort((a, b) => a.start - b.start);
  return unique;
}

/**
 * Resolve specifier against the pre-move tree.
 */
function resolveSpecifier(root, importerPre, spec, aliases, workspacePackages) {
  // 1. Relative
  if (spec.startsWith('./') || spec.startsWith('../') || spec === '.' || spec === '..') {
    const importerDir = path.posix.dirname(importerPre);
    const candidate = path.posix.normalize(path.posix.join(importerDir, spec));
    const resolved = probeFile(root, candidate);
    if (resolved) {
      return { type: 'workspace', file: resolved };
    }
    throw new Error(`Cannot resolve '${spec}' from ${importerPre}`);
  }

  // 2. Alias
  for (const [prefix, aliasDir] of Object.entries(aliases)) {
    if (spec.startsWith(prefix)) {
      const rest = spec.slice(prefix.length);
      const candidate = path.posix.normalize(path.posix.join(aliasDir, rest));
      const resolved = probeFile(root, candidate);
      if (resolved) {
        return { type: 'workspace', file: resolved };
      }
      throw new Error(`Cannot resolve '${spec}' from ${importerPre}`);
    }
  }

  // 3. Workspace package
  for (const pkg of workspacePackages) {
    if (spec === pkg.name || spec.startsWith(pkg.name + '/')) {
      const subpath = spec === pkg.name ? '.' : '.' + spec.slice(pkg.name.length);
      let targetPattern = null;
      if (pkg.exports && pkg.exports[subpath]) {
        targetPattern = pkg.exports[subpath];
      } else if (pkg.exports) {
        let bestPrefixLen = -1;
        for (const [key, val] of Object.entries(pkg.exports)) {
          if (key.includes('*')) {
            const [pfx, sfx] = key.split('*');
            if (subpath.startsWith(pfx) && subpath.endsWith(sfx)) {
              if (pfx.length > bestPrefixLen) {
                bestPrefixLen = pfx.length;
                const star = subpath.slice(pfx.length, subpath.length - sfx.length);
                targetPattern = val.replace('*', star);
              }
            }
          }
        }
      }
      if (targetPattern) {
        const candidate = path.posix.normalize(path.posix.join(pkg.dir, targetPattern));
        const resolved = probeFile(root, candidate);
        if (resolved) {
          return { type: 'workspace', file: resolved };
        }
      }
      return null;
    }
  }

  // Externals, node:, virtual:, cloudflare:, non-workspace packages
  return null;
}

/**
 * Format rewritten specifier based on Rule 4.
 */
function formatSpecifier(importerPost, targetPost, targetPkgPost, importerPkgPost, origSpec, importerPre) {
  const sameProject = importerPkgPost && targetPkgPost && importerPkgPost.name === targetPkgPost.name;

  if (sameProject) {
    const importerDir = path.posix.dirname(importerPost);
    let rel = path.posix.relative(importerDir, targetPost);
    if (!rel.startsWith('./') && !rel.startsWith('../')) {
      rel = './' + rel;
    }

    // Preserve directory-index style
    const mentionsIndex = origSpec.endsWith('/index') ||
      origSpec.endsWith('/index.ts') ||
      origSpec.endsWith('/index.tsx') ||
      origSpec === 'index' ||
      origSpec === './index';

    if (!mentionsIndex) {
      if (rel.endsWith('/index.ts')) {
        rel = rel.slice(0, -'/index.ts'.length);
      } else if (rel.endsWith('/index.tsx')) {
        rel = rel.slice(0, -'/index.tsx'.length);
      } else if (rel.endsWith('/index.mts')) {
        rel = rel.slice(0, -'/index.mts'.length);
      }
      if (rel === '.') rel = './';
    }

    // Preserve extension style
    const origExt = path.posix.extname(origSpec);
    const hadExtension = KNOWN_EXTENSIONS.has(origExt);
    if (!hadExtension) {
      const targetExt = path.posix.extname(rel);
      if (KNOWN_EXTENSIONS.has(targetExt)) {
        rel = rel.slice(0, -targetExt.length);
      }
    }

    return rel;
  }

  // Different project -> package export
  if (!targetPkgPost) {
    throw new Error(`No export matches ${targetPost} (imported by ${importerPre})`);
  }

  let targetRelInPkg = path.posix.relative(targetPkgPost.dir, targetPost);
  if (!targetRelInPkg.startsWith('./')) {
    targetRelInPkg = './' + targetRelInPkg;
  }

  // 1. Exact match
  if (targetPkgPost.exports) {
    for (const [key, val] of Object.entries(targetPkgPost.exports)) {
      if (!val.includes('*')) {
        const normVal = val.startsWith('./') ? val : './' + val;
        if (normVal === targetRelInPkg) {
          if (key === '.') {
            return targetPkgPost.name;
          }
          const sub = key.startsWith('./') ? key.slice(1) : (key.startsWith('/') ? key : '/' + key);
          return targetPkgPost.name + sub;
        }
      }
    }
  }

  // 2. Single-* pattern with longest literal prefix
  if (targetPkgPost.exports) {
    let bestPrefixLen = -1;
    let bestMatch = null;

    for (const [key, val] of Object.entries(targetPkgPost.exports)) {
      if (val.includes('*')) {
        const normVal = val.startsWith('./') ? val : './' + val;
        const [valPfx, valSfx] = normVal.split('*');
        if (targetRelInPkg.startsWith(valPfx) && targetRelInPkg.endsWith(valSfx)) {
          if (valPfx.length > bestPrefixLen) {
            bestPrefixLen = valPfx.length;
            const star = targetRelInPkg.slice(valPfx.length, targetRelInPkg.length - valSfx.length);
            const resolvedKey = key.replace('*', star);
            if (resolvedKey === '.') {
              bestMatch = targetPkgPost.name;
            } else {
              const sub = resolvedKey.startsWith('./') ? resolvedKey.slice(1) : (resolvedKey.startsWith('/') ? resolvedKey : '/' + resolvedKey);
              bestMatch = targetPkgPost.name + sub;
            }
          }
        }
      }
    }

    if (bestMatch) {
      return bestMatch;
    }
  }

  throw new Error(`No export of ${targetPkgPost.name} matches ${targetPost} (imported by ${importerPre})`);
}

/**
 * Expand folder and file moves into concrete file moves.
 */
function expandMoves(root, moves) {
  const concreteMoves = [];
  const moveMap = new Map();

  for (const move of moves) {
    let from = move.from.replace(/\\/g, '/');
    let to = move.to.replace(/\\/g, '/');

    if (from.endsWith('/')) {
      if (!to.endsWith('/')) to += '/';
      const fromDirFull = path.join(root, from);
      if (fs.existsSync(fromDirFull)) {
        function walk(dir) {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const entryFull = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              if (entry.name !== 'node_modules' && entry.name !== 'dist') {
                walk(entryFull);
              }
            } else if (entry.isFile()) {
              const rel = path.relative(fromDirFull, entryFull).replace(/\\/g, '/');
              const fileFrom = from + rel;
              const fileTo = to + rel;
              if (!moveMap.has(fileFrom)) {
                concreteMoves.push({ from: fileFrom, to: fileTo });
                moveMap.set(fileFrom, fileTo);
              }
            }
          }
        }
        walk(fromDirFull);
      }
    } else {
      let fileTo = to;
      if (to.endsWith('/')) {
        fileTo = to + path.posix.basename(from);
      }
      if (!moveMap.has(from)) {
        concreteMoves.push({ from, to: fileTo });
        moveMap.set(from, fileTo);
      }
    }
  }

  return { concreteMoves, moveMap };
}

/**
 * Collect all .ts/.tsx/.mts/.mjs files in scan directories.
 */
function scanFiles(root, scanDirs) {
  const files = [];
  const exts = new Set(['.ts', '.tsx', '.mts', '.mjs']);

  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) {
        continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (exts.has(ext)) {
          files.push(path.relative(root, full).replace(/\\/g, '/'));
        }
      }
    }
  }

  for (const scanDir of scanDirs) {
    walk(path.join(root, scanDir));
  }
  return files;
}

/**
 * Move TypeScript modules between workspace packages and rewrite import specifiers.
 */
export async function moveModules({ root, moves, aliases = {}, scan, git = true }) {
  const normRoot = path.resolve(root);
  const workspacePackages = getWorkspacePackages(normRoot);
  const { concreteMoves, moveMap } = expandMoves(normRoot, moves);
  const scannedFiles = scanFiles(normRoot, scan);

  const allRewrites = [];
  const fileRewritesMap = new Map();

  for (const file of scannedFiles) {
    const fullPath = path.join(normRoot, file);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, 'utf8');
    const specifiers = findSpecifiers(content);
    if (specifiers.length === 0) continue;

    const fileRewrites = [];
    const importerPost = moveMap.get(file) ?? file;
    const importerMoved = moveMap.has(file);

    for (const specObj of specifiers) {
      const raw = specObj.raw;
      const qIndex = raw.indexOf('?');
      const specWithoutQuery = qIndex !== -1 ? raw.slice(0, qIndex) : raw;
      const query = qIndex !== -1 ? raw.slice(qIndex) : '';

      const resolved = resolveSpecifier(normRoot, file, specWithoutQuery, aliases, workspacePackages);
      if (!resolved || resolved.type !== 'workspace') continue;

      const targetPre = resolved.file;
      const targetPost = moveMap.get(targetPre) ?? targetPre;
      const targetMoved = moveMap.has(targetPre);

      // Rewrite only when importer or target moves
      if (!importerMoved && !targetMoved) continue;

      const importerPkgPost = getOwningPackage(importerPost, workspacePackages);
      const targetPkgPost = getOwningPackage(targetPost, workspacePackages);

      const newSpecWithoutQuery = formatSpecifier(
        importerPost,
        targetPost,
        targetPkgPost,
        importerPkgPost,
        specWithoutQuery,
        file
      );

      const newRaw = newSpecWithoutQuery + query;
      if (newRaw !== raw) {
        fileRewrites.push({
          start: specObj.start,
          end: specObj.end,
          from: raw,
          to: newRaw,
        });
        allRewrites.push({
          file: importerPost,
          from: raw,
          to: newRaw,
        });
      }
    }

    if (fileRewrites.length > 0) {
      fileRewritesMap.set(file, { content, importerPost, rewrites: fileRewrites });
    }
  }

  // Compute all rewritten contents in memory first
  const newContentMap = new Map();
  for (const [, item] of fileRewritesMap.entries()) {
    let content = item.content;
    const sorted = [...item.rewrites].sort((a, b) => b.start - a.start);
    for (const r of sorted) {
      content = content.slice(0, r.start) + r.to + content.slice(r.end);
    }
    newContentMap.set(item.importerPost, content);
  }

  // Move files on disk
  if (git) {
    for (const { from, to } of concreteMoves) {
      const toFull = path.join(normRoot, to);
      fs.mkdirSync(path.dirname(toFull), { recursive: true });
      execFileSync('git', ['mv', from, to], { cwd: normRoot, stdio: 'pipe' });
    }
  } else {
    for (const { from, to } of concreteMoves) {
      const fromFull = path.join(normRoot, from);
      const toFull = path.join(normRoot, to);
      fs.mkdirSync(path.dirname(toFull), { recursive: true });
      fs.renameSync(fromFull, toFull);
    }
  }

  // Write rewritten contents at new paths
  for (const [importerPost, content] of newContentMap.entries()) {
    const full = path.join(normRoot, importerPost);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
  }

  return {
    moved: concreteMoves.map(m => m.to),
    rewrites: allRewrites,
  };
}

/**
 * Walk a file path backwards through history moves.
 */
function walkBackwards(p, history) {
  let curr = p;
  for (let i = history.length - 1; i >= 0; i--) {
    const { from, to } = history[i];
    if (to.endsWith('/')) {
      if (curr.startsWith(to)) {
        curr = from + curr.slice(to.length);
      }
    } else {
      if (curr === to) {
        curr = from;
      }
    }
  }
  return curr;
}

/**
 * Walk a file path forward through history moves.
 */
function walkForward(p, history) {
  let curr = p;
  for (let i = 0; i < history.length; i++) {
    const { from, to } = history[i];
    if (from.endsWith('/')) {
      if (curr.startsWith(from)) {
        curr = to + curr.slice(from.length);
      }
    } else {
      if (curr === from) {
        curr = to;
      }
    }
  }
  return curr;
}

/**
 * Fix import specifiers that were written against the old workspace layout.
 */
export async function repairImports({ root, history, scan, aliases = { '@/': 'libs/web/screens/src/' } }) {
  const normRoot = path.resolve(root);
  const workspacePackages = getWorkspacePackages(normRoot);
  const scannedFiles = scanFiles(normRoot, scan);

  const allRewrites = [];
  const unresolvable = [];
  const newContentMap = new Map();

  for (const file of scannedFiles) {
    const fullPath = path.join(normRoot, file);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, 'utf8');
    const specifiers = findSpecifiers(content);
    if (specifiers.length === 0) continue;

    const fileRewrites = [];

    for (const specObj of specifiers) {
      const raw = specObj.raw;
      const qIndex = raw.indexOf('?');
      const specWithoutQuery = qIndex !== -1 ? raw.slice(0, qIndex) : raw;
      const query = qIndex !== -1 ? raw.slice(qIndex) : '';

      // Only relative or alias specifiers can be repaired
      const isRelative = specWithoutQuery.startsWith('./') ||
        specWithoutQuery.startsWith('../') ||
        specWithoutQuery === '.' ||
        specWithoutQuery === '..';
      const isAlias = Object.keys(aliases).some(pfx => specWithoutQuery.startsWith(pfx));

      if (!isRelative && !isAlias) {
        continue;
      }

      // Check if it resolves today
      let resolvesToday = false;
      if (isRelative) {
        const cand = path.posix.normalize(path.posix.join(path.posix.dirname(file), specWithoutQuery));
        resolvesToday = probeFile(normRoot, cand) !== null;
      } else {
        for (const [pfx, dir] of Object.entries(aliases)) {
          if (specWithoutQuery.startsWith(pfx)) {
            const cand = path.posix.normalize(path.posix.join(dir, specWithoutQuery.slice(pfx.length)));
            resolvesToday = probeFile(normRoot, cand) !== null;
            break;
          }
        }
      }

      if (resolvesToday) {
        continue;
      }

      // Find importer's pre-history path
      const importerPre = walkBackwards(file, history);

      // Compute pre-history target candidate
      let candPre = '';
      if (isRelative) {
        candPre = path.posix.normalize(path.posix.join(path.posix.dirname(importerPre), specWithoutQuery));
      } else {
        for (const [pfx, dir] of Object.entries(aliases)) {
          if (specWithoutQuery.startsWith(pfx)) {
            candPre = path.posix.normalize(path.posix.join(dir, specWithoutQuery.slice(pfx.length)));
            break;
          }
        }
      }

      // Try extensions and walk forward through history
      let targetCurrent = null;
      for (const ext of EXTENSIONS) {
        const candWithExt = candPre + ext;
        const forwardPath = walkForward(candWithExt, history);
        const full = path.join(normRoot, forwardPath);
        if (fs.existsSync(full)) {
          try {
            if (fs.statSync(full).isFile()) {
              targetCurrent = forwardPath.replace(/\\/g, '/');
              break;
            }
          } catch {
            // ignore
          }
        }
      }

      if (targetCurrent) {
        const importerPkg = getOwningPackage(file, workspacePackages);
        const targetPkg = getOwningPackage(targetCurrent, workspacePackages);

        const newSpecWithoutQuery = formatSpecifier(
          file,
          targetCurrent,
          targetPkg,
          importerPkg,
          specWithoutQuery,
          importerPre
        );

        const newRaw = newSpecWithoutQuery + query;
        if (newRaw !== raw) {
          fileRewrites.push({
            start: specObj.start,
            end: specObj.end,
            from: raw,
            to: newRaw,
          });
          allRewrites.push({
            file,
            from: raw,
            to: newRaw,
          });
        }
      } else {
        unresolvable.push({ file, spec: raw });
      }
    }

    if (fileRewrites.length > 0) {
      let updatedContent = content;
      const sorted = [...fileRewrites].sort((a, b) => b.start - a.start);
      for (const r of sorted) {
        updatedContent = updatedContent.slice(0, r.start) + r.to + updatedContent.slice(r.end);
      }
      newContentMap.set(file, updatedContent);
    }
  }

  if (unresolvable.length > 0) {
    const list = unresolvable.map(u => `${u.file}: '${u.spec}'`).join('\n');
    throw new Error(`Cannot repair imports:\n${list}`);
  }

  for (const [file, content] of newContentMap.entries()) {
    const full = path.join(normRoot, file);
    fs.writeFileSync(full, content, 'utf8');
  }

  return { rewrites: allRewrites };
}

/**
 * CLI execution handler.
 */
async function runCli() {
  const args = process.argv.slice(2);
  const root = process.cwd();

  if (args.includes('--repair')) {
    const movesDir = path.join(root, 'scripts', 'migration', 'moves');
    const history = [];
    if (fs.existsSync(movesDir)) {
      const files = fs.readdirSync(movesDir).filter(f => f.endsWith('.json')).sort();
      for (const f of files) {
        const content = fs.readFileSync(path.join(movesDir, f), 'utf8');
        try {
          const json = JSON.parse(content);
          if (Array.isArray(json.moves)) {
            history.push(...json.moves);
          }
        } catch (e) {
          console.error(`Failed to parse ${f}: ${e.message}`);
        }
      }
    }
    const result = await repairImports({ root, history, scan: ['apps', 'libs'] });
    for (const r of result.rewrites) {
      console.log(`${r.file}: '${r.from}' -> '${r.to}'`);
    }
    console.log(`${result.rewrites.length} rewrite${result.rewrites.length === 1 ? '' : 's'}`);
    return;
  }

  if (args.length > 0 && !args[0].startsWith('-')) {
    const planFile = path.resolve(root, args[0]);
    if (!fs.existsSync(planFile)) {
      console.error(`Plan file not found: ${planFile}`);
      process.exit(1);
    }
    const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
    const result = await moveModules({
      root,
      moves: plan.moves || [],
      aliases: plan.aliases || {},
      scan: plan.scan || ['apps', 'libs'],
      git: true,
    });
    for (const r of result.rewrites) {
      console.log(`${r.file}: '${r.from}' -> '${r.to}'`);
    }
    console.log(`${result.rewrites.length} rewrite${result.rewrites.length === 1 ? '' : 's'}`);
    return;
  }

  console.error('Usage: node scripts/migration/move-modules.mjs <plan.json> | --repair');
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runCli().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
