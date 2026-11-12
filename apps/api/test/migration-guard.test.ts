import { describe, expect, it } from 'vitest';
import { findMigrationProblems } from '../scripts/migration-guard.mjs';

const files = ['0000_init.sql', '0008_player_ratings.sql', '0021_notifications.sql'];

describe('findMigrationProblems', () => {
  it('passes on main when the live database matches migrations/', () => {
    expect(findMigrationProblems({ applied: ['0000_init.sql', '0008_player_ratings.sql'], files, branch: 'main' })).toEqual([]);
  });

  it('passes on a fresh database', () => {
    expect(findMigrationProblems({ applied: [], files, branch: 'main' })).toEqual([]);
  });

  it('flags a migration applied from a branch and renamed before merging', () => {
    const problems = findMigrationProblems({
      applied: ['0000_init.sql', '0008_notifications.sql', '0008_player_ratings.sql'],
      files,
      branch: 'main',
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('0008_notifications.sql');
  });

  it('flags a pending migration numbered before one already applied', () => {
    const problems = findMigrationProblems({ applied: ['0000_init.sql', '0021_notifications.sql'], files, branch: 'main' });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('0008_player_ratings.sql');
  });

  it('refuses to run off main', () => {
    expect(findMigrationProblems({ applied: [], files, branch: 'feat/x' })[0]).toContain('feat/x');
    expect(findMigrationProblems({ applied: [], files, branch: null })[0]).toContain('unknown');
  });
});
