import { describe, it, expect } from 'vitest';
import { readSplitInput, fromEntryValue } from '../splitInput';

describe('readSplitInput', () => {
  it('a blank exact or percent box is automatic', () => {
    expect(readSplitInput('amounts', '')).toEqual({ ok: true, value: null });
    expect(readSplitInput('amounts', '   ')).toEqual({ ok: true, value: null });
    expect(readSplitInput('percent', '')).toEqual({ ok: true, value: null });
  });

  it('blank shares count as 1 share, blank adjust as 0, equal as 1', () => {
    expect(readSplitInput('shares', '')).toEqual({ ok: true, value: 100 });
    expect(readSplitInput('adjust', '')).toEqual({ ok: true, value: 0 });
    expect(readSplitInput('equal', '')).toEqual({ ok: true, value: 1 });
  });

  it('typed values parse as before, and a typed 0 is kept', () => {
    expect(readSplitInput('percent', '40')).toEqual({ ok: true, value: 4000 });
    expect(readSplitInput('amounts', '0')).toEqual({ ok: true, value: 0 });
    expect(readSplitInput('amounts', '50k')).toEqual({ ok: true, value: 50000 });
  });

  it('junk is not ok', () => expect(readSplitInput('percent', 'abc')).toEqual({ ok: false }));
});

describe('fromEntryValue', () => {
  it('an automatic value shows as an empty box', () => {
    expect(fromEntryValue('percent', null)).toBe('');
    expect(fromEntryValue('amounts', null)).toBe('');
  });
});
