import { describe, it, expect } from 'vitest';
import { buildTransferNote, buildVietQrPayload, crc16CcittFalse } from '../src/vietqr';

describe('buildTransferNote', () => {
  it('puts sender, for, group, purpose in that order', () =>
    expect(buildTransferNote({ sender: 'Nguyễn Văn An', forName: 'Trần Bình', group: 'Đà Lạt 2026', purpose: 'SETTLE' }))
      .toBe('NGUYEN VAN AN TRAN BINH DA LAT 2026 SETTLE'));
  it('leaves out "for" when it is the sender', () =>
    expect(buildTransferNote({ sender: 'An', forName: 'an', group: 'Team', purpose: 'Dinner' })).toBe('AN TEAM DINNER'));
  it('works without sender or purpose', () => expect(buildTransferNote({ group: 'Cầu lông T5' })).toBe('CAU LONG T5'));
  it('cuts from the end, keeping the names', () => {
    const note = buildTransferNote({ sender: 'Nguyễn Thị Thanh Hương', forName: 'Lê Hoàng Minh Khôi', group: 'Hội cầu lông thứ năm', purpose: 'Tiền sân tháng mười' });
    expect(note.length).toBeLessThanOrEqual(50);
    expect(note.startsWith('NGUYEN THI THANH HUONG LE HOANG MINH KHOI ')).toBe(true);
  });
  it('makes a valid QR with a long note', () => {
    const note = buildTransferNote({ sender: 'Nguyễn Thị Thanh Hương', group: 'Hội cầu lông thứ năm', purpose: 'SETTLE' });
    const p = buildVietQrPayload({ bin: '970407', accountNumber: '1903', amount: 1000, note });
    expect(p).toContain(`08${String(note.length).padStart(2, '0')}${note}`);
    expect(p.slice(-4)).toBe(crc16CcittFalse(p.slice(0, -4)));
  });
});
