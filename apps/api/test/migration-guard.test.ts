import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { findMigrationProblems, findMigrationSequenceProblems } from '../scripts/migration-guard.mjs';

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

describe('findMigrationSequenceProblems', () => {
  it('passes on a valid contiguous sequence starting at 0000', () => {
    expect(
      findMigrationSequenceProblems(['0000_init.sql', '0001_sport_groups.sql', '0002_user_profile.sql']),
    ).toEqual([]);
  });

  it('flags files that do not match NNNN_snake_case.sql', () => {
    const problems = findMigrationSequenceProblems([
      '0000_init.sql',
      '001_short.sql',
      '0002-kebab.sql',
      '0003_UpperCase.sql',
    ]);
    expect(problems).toHaveLength(3);
    expect(problems[0]).toContain('001_short.sql');
    expect(problems[1]).toContain('0002-kebab.sql');
    expect(problems[2]).toContain('0003_UpperCase.sql');
  });

  it('flags duplicate migration indices', () => {
    const problems = findMigrationSequenceProblems([
      '0000_init.sql',
      '0001_attendance.sql',
      '0001_push.sql',
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('0001');
    expect(problems[0]).toContain('0001_attendance.sql');
    expect(problems[0]).toContain('0001_push.sql');
  });

  it('flags skipped indices or sequences not starting at 0000', () => {
    const gap = findMigrationSequenceProblems(['0000_init.sql', '0002_skipped.sql']);
    expect(gap).toHaveLength(1);
    expect(gap[0]).toContain('0001');

    const nonZeroStart = findMigrationSequenceProblems(['0001_init.sql']);
    expect(nonZeroStart).toHaveLength(1);
    expect(nonZeroStart[0]).toContain('0000');
  });

  it('validates the actual apps/api/migrations directory', () => {
    const actualFiles = env.TEST_MIGRATIONS!.map((m) => m.name);
    expect(actualFiles.length).toBeGreaterThan(0);
    expect(findMigrationSequenceProblems(actualFiles)).toEqual([]);
  });
});
