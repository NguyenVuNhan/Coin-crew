import { describe, it, expect } from 'vitest';
import { expenseMessage } from '../src/notifications/push/messages';

describe('push messages', () => {
  it('expenseMessage falls back to Có người when actorName is empty or whitespace', () => {
    const empty = expenseMessage({
      actorName: '',
      description: 'Ăn tối',
      groupName: 'Đà Lạt',
      share: 150000,
      tripId: 't-1',
      rootId: 'r-1',
    });
    expect(empty.title).toBe('Có người thêm Ăn tối · Đà Lạt');

    const whitespace = expenseMessage({
      actorName: '   ',
      description: 'Ăn tối',
      groupName: 'Đà Lạt',
      share: 150000,
      tripId: 't-1',
      rootId: 'r-1',
    });
    expect(whitespace.title).toBe('Có người thêm Ăn tối · Đà Lạt');
  });
});
