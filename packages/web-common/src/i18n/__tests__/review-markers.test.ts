import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('review markers', () => {
  it('every vi key line is marked for review except the two shared words', () => {
    const content = readFileSync(join(import.meta.dirname, '..', 'vi.ts'), 'utf8');
    const result = content
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => /^\s+'[\w.]+': /.test(line) && !line.endsWith('// REVIEW'))
      .map((line) => {
        const match = line.match(/^\s+('[\w.]+'): /);
        return match ? match[1]! : '';
      });

    expect(result).toEqual(["'people.genderMale'", "'people.genderFemale'"]);
  });
});
