// Pure checks behind check-remote-migrations.mjs (no Node imports, so the Workers test pool can load it).
// D1 tracks migrations by file name, so a migration applied from a branch and then renamed or renumbered
// before merging is re-run under its new name and fails ("table already exists"), blocking every deploy.

/** Branches allowed to change the live database. */
export const DEPLOY_BRANCHES = ['main'];

const MIGRATION_FILE_RE = /^(\d{4})_[a-z0-9_]+\.sql$/;

/**
 * Checks migration filenames for format, duplicate indices, and gaps.
 * @param {string[]} files
 * @returns {string[]} problems; empty when the migration sequence is valid
 */
export function findMigrationSequenceProblems(files) {
  const problems = [];
  const byIndex = new Map();

  for (const name of files) {
    const match = MIGRATION_FILE_RE.exec(name);
    if (!match) {
      problems.push(`${name} does not match expected migration format NNNN_snake_case.sql.`);
      continue;
    }
    const index = Number(match[1]);
    const existing = byIndex.get(index) ?? [];
    existing.push(name);
    byIndex.set(index, existing);
  }

  const indices = [...byIndex.keys()].sort((a, b) => a - b);
  for (const index of indices) {
    const group = byIndex.get(index);
    if (group.length > 1) {
      const prefix = String(index).padStart(4, '0');
      problems.push(`Duplicate migration index ${prefix}: ${group.sort().join(', ')}.`);
    }
  }

  if (indices.length > 0) {
    let expected = 0;
    for (const index of indices) {
      if (index !== expected) {
        const missing = String(expected).padStart(4, '0');
        const found = String(index).padStart(4, '0');
        problems.push(`Migration index gap: expected ${missing}_*.sql before ${found}_*.sql.`);
      }
      expected = index + 1;
    }
  }

  return problems;
}

/**
 * @param {{ applied: string[], files: string[], branch: string | null }} input
 * @returns {string[]} problems; empty when it is safe to apply migrations
 */
export function findMigrationProblems({ applied, files, branch }) {
  const problems = [];
  const known = new Set(files);
  const done = new Set(applied);

  if (!branch || !DEPLOY_BRANCHES.includes(branch)) {
    problems.push(
      `Remote migrations run only from ${DEPLOY_BRANCHES.join(', ')} (current branch: ${branch ?? 'unknown'}). ` +
        'Use --local for branch work.',
    );
  }

  for (const name of applied) {
    if (!known.has(name)) {
      problems.push(
        `The live database recorded ${name}, but migrations/ has no such file. ` +
          'It was probably applied from a branch and renamed before merging. ' +
          'Compare its schema with the renamed file, then fix the row in d1_migrations.',
      );
    }
  }

  const lastApplied = applied.filter((name) => known.has(name)).sort().at(-1);
  if (lastApplied) {
    for (const name of files) {
      if (!done.has(name) && name < lastApplied) {
        problems.push(`${name} is pending but sorts before the already applied ${lastApplied}. Renumber it after the latest migration.`);
      }
    }
  }

  return problems;
}
