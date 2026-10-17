import { normalizeName } from './names';

export interface VietQrInput { bin: string; accountNumber: string; amount: number; note: string }

export function crc16CcittFalse(s: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(s)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

const tlv = (id: string, value: string) => `${id}${String(value.length).padStart(2, '0')}${value}`;

// EMVCo merchant-presented QR with the NAPAS 247 account-transfer service (QRIBFTTA).
export function buildVietQrPayload({ bin, accountNumber, amount, note }: VietQrInput): string {
  const beneficiary = tlv('00', bin) + tlv('01', accountNumber);
  const merchantAccount = tlv('00', 'A000000727') + tlv('01', beneficiary) + tlv('02', 'QRIBFTTA');
  const dynamic = amount > 0;
  const body =
    tlv('00', '01') +
    tlv('01', dynamic ? '12' : '11') +
    tlv('38', merchantAccount) +
    tlv('53', '704') +
    (dynamic ? tlv('54', String(amount)) : '') +
    tlv('58', 'VN') +
    tlv('62', tlv('08', note)) +
    '6304';
  return body + crc16CcittFalse(body);
}

export function toTransferNote(text: string, maxLen = 25): string {
  return normalizeName(text).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLen).trim();
}
