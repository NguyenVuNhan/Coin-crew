// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderLedgerPng, type LedgerCardInput } from '../ledgerCard';
import { shareImageFile } from '../qr';

interface Drawn {
  text: string;
  y: number;
  fillStyle: string;
}

function mockCanvas() {
  const drawn: Drawn[] = [];
  const images: { y: number }[] = [];
  const size = { width: 0, height: 0 };
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'top',
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    measureText: (text: string) => ({ width: text.length * 10 }),
    fillText: vi.fn((text: string, _x: number, y: number) => {
      drawn.push({ text, y, fillStyle: ctx.fillStyle });
    }),
    drawImage: vi.fn((_img: unknown, _x: number, y: number) => {
      images.push({ y });
    }),
  };
  vi.spyOn(document, 'createElement').mockReturnValue({
    get width() {
      return size.width;
    },
    set width(w: number) {
      size.width = w;
    },
    get height() {
      return size.height;
    },
    set height(h: number) {
      size.height = h;
    },
    getContext: () => ctx,
    toBlob: (cb: (b: Blob | null) => void) => cb(new Blob(['png'], { type: 'image/png' })),
  } as unknown as HTMLCanvasElement);
  return { drawn, images, size, ctx };
}

/** jsdom never loads images: fire onload as soon as a src is set. */
class LoadingImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_v: string) {
    queueMicrotask(() => this.onload?.());
  }
}

const base: LedgerCardInput = {
  title: 'Đà Lạt · Yêu cầu thanh toán',
  meta: '12/11/2026 · Nhận: Minh',
  nameHeader: 'TÊN',
  amountHeader: 'CẦN CHUYỂN',
  rows: [
    { name: 'An', amount: 385000 },
    { name: 'Bình', amount: 565000 },
    { name: 'Chi', amount: 1245000 },
  ],
  totalLabel: 'TỔNG',
  total: 2195000,
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('renderLedgerPng', () => {
  it('draws title, meta, headers, every row, total label and formatted total', async () => {
    const { drawn } = mockCanvas();
    const blob = await renderLedgerPng(base);
    const texts = drawn.map((d) => d.text);
    expect(blob).not.toBeNull();
    for (const t of ['Đà Lạt · Yêu cầu thanh toán', '12/11/2026 · Nhận: Minh', 'TÊN', 'CẦN CHUYỂN', 'An', '385.000₫', 'TỔNG', '2.195.000₫']) {
      expect(texts).toContain(t);
    }
  });

  it('a muted row is grey and a normal row is the debt colour', async () => {
    const { drawn } = mockCanvas();
    await renderLedgerPng({
      ...base,
      rows: [
        { name: 'Minh', amount: 300000, muted: true, tag: '(người trả)' },
        { name: 'An', amount: 400000 },
      ],
    });
    expect(drawn.find((d) => d.text === '300.000₫')!.fillStyle).not.toBe('#be123c');
    expect(drawn.find((d) => d.text === '400.000₫')!.fillStyle).toBe('#be123c');
    expect(drawn.some((d) => d.text.includes('(người trả)'))).toBe(true);
  });

  it('without qrSvg there is no bank line, hint or drawImage', async () => {
    const { drawn, ctx } = mockCanvas();
    await renderLedgerPng({ ...base, bankLine: 'Minh · VCB · 0123 · NGUYEN MINH', hint: 'Mở link' });
    const texts = drawn.map((d) => d.text);
    expect(ctx.drawImage).not.toHaveBeenCalled();
    expect(texts).not.toContain('Minh · VCB · 0123 · NGUYEN MINH');
    expect(texts).not.toContain('Mở link');
  });

  it('with qrSvg the QR, bank line and hint are drawn below the table', async () => {
    vi.stubGlobal('Image', LoadingImage);
    const { drawn, images } = mockCanvas();
    await renderLedgerPng({ ...base, qrSvg: '<svg/>', bankLine: 'Minh · VCB · 0123 · NGUYEN MINH', hint: 'Mở link' });
    const totalY = drawn.find((d) => d.text === 'TỔNG')!.y;
    expect(images).toHaveLength(1);
    expect(images[0]!.y).toBeGreaterThan(totalY);
    const texts = drawn.map((d) => d.text);
    expect(texts).toContain('Minh · VCB · 0123 · NGUYEN MINH');
    expect(texts).toContain('Mở link');
  });

  it('clips a long name to its column', async () => {
    const { drawn } = mockCanvas();
    const long = 'Nguyễn Thị Phương Thảo (chị họ của Lan) '.repeat(4);
    await renderLedgerPng({ ...base, rows: [{ name: long, amount: 100000 }] });
    const nameText = drawn.find((d) => d.text.startsWith('Nguyễn'))!.text;
    expect(nameText.length).toBeLessThan(long.length);
    expect(nameText.endsWith('…')).toBe(true);
  });

  it('canvas height grows with rows', async () => {
    const small = mockCanvas();
    await renderLedgerPng(base);
    const h3 = small.size.height;
    vi.restoreAllMocks();
    const big = mockCanvas();
    await renderLedgerPng({ ...base, rows: Array.from({ length: 12 }, (_, i) => ({ name: `P${i}`, amount: 1000 })) });
    expect(big.size.height).toBeGreaterThan(h3);
  });
});

describe('shareImageFile', () => {
  it('falls back to download plus copy when navigator.share is missing', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const res = await shareImageFile(new Blob(['png'], { type: 'image/png' }), 'request.png', 'hello');
    expect(res).toBe('saved');
    expect(writeText).toHaveBeenCalledWith('hello');
  });
});
