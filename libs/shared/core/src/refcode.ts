import { normalizeName } from './names';

export const REF_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function makeRefCode(tripName: string, random: () => number): string {
  const words = normalizeName(tripName).replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(Boolean);
  const slug = words.slice(0, 2).join('').toUpperCase().slice(0, 6) || 'TRIP';
  let code = '';
  for (let i = 0; i < 4; i++) code += REF_CODE_ALPHABET[Math.floor(random() * REF_CODE_ALPHABET.length)];
  return `${slug} ${code}`;
}
