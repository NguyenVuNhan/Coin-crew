import QRCodeCore from 'qrcode/lib/core/qrcode.js';

/** The link-preview size the meta tags announce (og:image:width / height). */
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/** Palette indexes: brand teal background, white plate, black modules. */
const TEAL = 0;
const WHITE = 1;
const BLACK = 2;
const PALETTE = new Uint8Array([0x0f, 0x76, 0x6e, 0xff, 0xff, 0xff, 0x11, 0x18, 0x27]);

/** Modules of quiet zone around the code, on the white plate. */
const QUIET = 3;
/** The plate's side, at most: leaves a teal band above and below on a 630px card. */
const PLATE_MAX = 570;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

async function zlib(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * A link-preview card (1200x630 PNG) with the QR for `text` on a white plate in the middle of a teal card, so it
 * still shows whole when a chat app crops the preview to a square.
 */
export async function qrCardPng(text: string): Promise<Uint8Array<ArrayBuffer>> {
  const qr = QRCodeCore.create(text, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const scale = Math.max(1, Math.floor(PLATE_MAX / (size + QUIET * 2)));
  const plate = (size + QUIET * 2) * scale;
  const plateX = Math.floor((OG_WIDTH - plate) / 2);
  const plateY = Math.floor((OG_HEIGHT - plate) / 2);
  const codeX = plateX + QUIET * scale;
  const codeY = plateY + QUIET * scale;

  const stride = OG_WIDTH + 1; // one filter byte (0, none) per scanline
  const raw = new Uint8Array(stride * OG_HEIGHT);
  for (let y = 0; y < OG_HEIGHT; y++) {
    const row = y * stride;
    const onPlateRow = y >= plateY && y < plateY + plate;
    const moduleRow = Math.floor((y - codeY) / scale);
    for (let x = 0; x < OG_WIDTH; x++) {
      let px = TEAL;
      if (onPlateRow && x >= plateX && x < plateX + plate) {
        px = WHITE;
        const moduleCol = Math.floor((x - codeX) / scale);
        if (moduleRow >= 0 && moduleRow < size && moduleCol >= 0 && moduleCol < size && qr.modules.get(moduleRow, moduleCol)) {
          px = BLACK;
        }
      }
      raw[row + 1 + x] = px;
    }
  }

  const header = new Uint8Array(13);
  const hv = new DataView(header.buffer);
  hv.setUint32(0, OG_WIDTH);
  hv.setUint32(4, OG_HEIGHT);
  header[8] = 8; // bit depth
  header[9] = 3; // indexed colour
  // compression, filter, interlace: 0

  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('PLTE', PALETTE),
    chunk('IDAT', await zlib(raw)),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
