// Pure checks behind check-remote-migrations.mjs (no Node imports, so the Workers test pool can load it).
// D1 tracks migrations by file name, so a migration applied from a branch and then renamed or renumbered
// before merging is re-run under its new name and fails ("table already exists"), blocking every deploy.

/** Branches allowed to change the live database. */
export const DEPLOY_BRANCHES = ['main'];

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
