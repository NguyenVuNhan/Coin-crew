// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderMemePng, type MemeInput } from '../memeCards';

interface Drawn {
  text: string;
  x: number;
  y: number;
  fillStyle: string;
}

/** 10px per character, whatever the font: easy column arithmetic. */
const measure = (s: string) => Array.from(s).length * 10;

function mockCanvas() {
  const drawn: Drawn[] = [];
  const size = { width: 0, height: 0 };
  const noop = () => undefined;
  const ctx = {
    fillStyle: '' as unknown,
    strokeStyle: '',
    lineWidth: 1,
    lineJoin: 'miter',
    globalAlpha: 1,
    font: '',
    filter: 'none',
    letterSpacing: '0px',
    textAlign: 'left',
    textBaseline: 'top',
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    arcTo: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    createRadialGradient: () => ({ addColorStop: noop }),
    measureText: (text: string) => ({ width: measure(text) }),
    fillText: vi.fn((text: string, x: number, y: number) => {
      drawn.push({ text, x, y, fillStyle: String(ctx.fillStyle) });
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
  return { drawn, size, ctx };
}

const awards: MemeInput = {
  kind: 'awards',
  heading: 'Lễ trao giải chuyên cần',
  subheading: 'THỨ BẢY · THÁNG 11',
  awards: [
    { kind: 'regular', title: 'VUA CHUYÊN CẦN', name: 'An', stat: '12 trận liền' },
    { kind: 'back', title: 'SỰ TRỞ LẠI', name: 'Chi', stat: 'Vắng 6 tuần' },
    { kind: 'guest', title: 'ĐẠI SỨ', name: 'Dũng', stat: '9 khách' },
    { kind: 'noShow', title: 'THÁNH BÙNG KÈO', name: 'Bình', stat: 'Hứa 5, tới 2' },
  ],
  footer: 'CoinCrew · Tiền Đâu',
};

const wanted: MemeInput = {
  kind: 'wanted',
  heading: 'TRUY NÃ',
  group: 'HỘI CẦU LÔNG',
  name: 'BÌNH',
  initials: 'Bì',
  crime: 'Tội danh: bùng kèo 3 trận',
  lastSeen: 'Lần cuối: 18/10',
  reward: 'TIỀN THƯỞNG: 1 QUẢ',
  stamp: 'ĐÃ RA SÂN!',
  footer: 'CoinCrew · Tiền Đâu',
};

const verse: MemeInput = {
  kind: 'verse',
  heading: 'Ca dao sân cầu',
  month: 'tháng mười một',
  verses: [
    { line6: 'Mưa rơi gió thổi', line8: 'An vẫn ra sân', name: 'An', tag: 'vua chuyên cần' },
    { line6: 'Bao lâu vắng bóng', line8: 'Hôm nay Chi về', name: 'Chi', tag: 'người cũ' },
  ],
  seal: 'Tiền Đâu',
  footer: 'CoinCrew · Tiền Đâu',
};

const board: MemeInput = {
  kind: 'board',
  heading: 'BẢNG VÀNG SÂN CẦU',
  subheading: 'SAU TRẬN 15/11',
  rows: [
    { label: 'CHUỖI RA SÂN', name: 'An', value: 12, tone: 'hot' },
    { label: 'TRỞ LẠI SAU', name: 'Chi', value: 6, tone: 'plain' },
    { label: 'CHUỖI BÙNG KÈO', name: 'Bình', value: 3, tone: 'cold' },
  ],
  ticker: 'CHI ĐÃ TRỞ LẠI',
  footer: 'CoinCrew · Tiền Đâu',
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('renderMemePng', () => {
  it('each kind draws its heading and every name', async () => {
    const cases: [MemeInput, string[]][] = [
      [awards, ['THỨ BẢY · THÁNG 11', 'An', 'Chi', 'Dũng', 'Bình', 'VUA CHUYÊN CẦN', '12 trận liền']],
      [wanted, ['TRUY NÃ', 'HỘI CẦU LÔNG', 'BÌNH', 'Bì', 'Lần cuối: 18/10', 'TIỀN THƯỞNG: 1 QUẢ']],
      [verse, ['Ca dao sân cầu', 'tháng mười một', 'Mưa rơi gió thổi', 'An', 'Chi', '— vua chuyên cần']],
      [board, ['CHUỖI RA SÂN', 'An', 'Chi', 'Bình', 'CHI ĐÃ TRỞ LẠI']],
    ];
    for (const [input, expected] of cases) {
      const { drawn, size } = mockCanvas();
      const blob = await renderMemePng(input);
      expect(blob).not.toBeNull();
      expect(size).toEqual({ width: 1080, height: 1920 });
      const texts = drawn.map((d) => d.text);
      for (const t of [...expected, 'CoinCrew · Tiền Đâu']) expect(texts, `${input.kind}: ${t}`).toContain(t);
      // Headings that wrap are drawn over two lines; together they spell the heading.
      const words = input.heading.split(' ');
      expect(texts.join(' ')).toContain(words[0]);
      expect(texts.join(' ')).toContain(words[words.length - 1]);
      vi.restoreAllMocks();
    }
  });

  it('long names fit: a long name is cut with "…" within its column width', async () => {
    const long = 'Nguyễn Thị Phương Thảo';
    const { drawn } = mockCanvas();
    await renderMemePng({ ...awards, awards: [{ kind: 'regular', title: 'VUA', name: long, stat: 'x' }] } as MemeInput);
    const name = drawn.find((d) => d.text.startsWith('Nguyễn'))!;
    expect(name.text).not.toBe(long);
    expect(name.text.endsWith('…')).toBe(true);
    // The award text column runs from x=75 to the row's inner edge (270 - 16 - 11).
    expect(name.x + measure(name.text)).toBeLessThanOrEqual(270 - 16 - 11);
  });

  it('long verse lines and board names are cut too', async () => {
    const long = 'Nguyễn Thị Phương Thảo đến sân rất đúng giờ mỗi tuần';
    const v = mockCanvas();
    await renderMemePng({ ...verse, verses: [{ line6: long, line8: long, name: 'Lan', tag: 't' }] } as MemeInput);
    const lines = v.drawn.filter((d) => d.text.startsWith('Nguyễn'));
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      expect(l.text.endsWith('…')).toBe(true);
      expect(l.x + measure(l.text)).toBeLessThanOrEqual(270 - 22);
    }
    vi.restoreAllMocks();

    const b = mockCanvas();
    await renderMemePng({ ...board, rows: [{ label: 'L', name: long, value: 1, tone: 'hot' }] } as MemeInput);
    const name = b.drawn.find((d) => d.text.startsWith('Nguyễn'))!;
    expect(name.text.endsWith('…')).toBe(true);
  });

  it('wanted draws the stamp only when stamp ≠ null', async () => {
    const withStamp = mockCanvas();
    await renderMemePng(wanted);
    expect(withStamp.drawn.map((d) => d.text)).toContain('ĐÃ RA SÂN!');
    vi.restoreAllMocks();

    const without = mockCanvas();
    await renderMemePng({ ...wanted, stamp: null } as MemeInput);
    expect(without.drawn.map((d) => d.text)).not.toContain('ĐÃ RA SÂN!');
    expect(without.ctx.rotate).not.toHaveBeenCalled();
  });

  it('board pads values to two flip digits', async () => {
    const { drawn } = mockCanvas();
    await renderMemePng({
      ...board,
      rows: [
        { label: 'A', name: 'An', value: 12, tone: 'hot' },
        { label: 'B', name: 'Chi', value: 6, tone: 'plain' },
        { label: 'C', name: 'Bình', value: 140, tone: 'cold' },
      ],
    } as MemeInput);
    const texts = drawn.map((d) => d.text);
    const after = (name: string) => texts.slice(texts.indexOf(name) + 1, texts.indexOf(name) + 3);
    expect(after('An')).toEqual(['1', '2']);
    expect(after('Chi')).toEqual(['0', '6']);
    expect(after('Bình')).toEqual(['9', '9']);
    expect(drawn.find((d) => d.text === '6')!.fillStyle).toBe('#ffffff');
  });

  it('waits for the card faces when document.fonts exists', async () => {
    const load = vi.fn(async () => []);
    Object.defineProperty(document, 'fonts', { value: { load }, configurable: true });
    try {
      mockCanvas();
      await renderMemePng(wanted);
      const specs = load.mock.calls.map((c) => (c as unknown[])[0]);
      expect(specs).toContain('50px "Alfa Slab One"');
      expect(specs.some((s) => String(s).includes('Be Vietnam Pro'))).toBe(true);
      expect(String((load.mock.calls[0] as unknown[])[1])).toContain('TRUY NÃ');
    } finally {
      delete (document as { fonts?: unknown }).fonts;
    }
  });

  it('wanted draws profile photo when avatarUrl loads and falls back to initials on error', async () => {
    class MockImage {
      crossOrigin: string | null = null;
      naturalWidth = 200;
      naturalHeight = 100;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', MockImage);
    const ok = mockCanvas();
    const okBlob = await renderMemePng({ ...wanted, avatarUrl: 'https://cdn.example/binh.jpg' });
    expect(okBlob).not.toBeNull();
    expect(ok.ctx.drawImage).toHaveBeenCalledTimes(1);
    expect(ok.drawn.map((d) => d.text)).not.toContain('Bì');
    vi.restoreAllMocks();

    class FailingImage {
      crossOrigin: string | null = null;
      naturalWidth = 0;
      naturalHeight = 0;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal('Image', FailingImage);
    const fallback = mockCanvas();
    const fallbackBlob = await renderMemePng({ ...wanted, avatarUrl: 'https://cdn.example/blocked.jpg' });
    expect(fallbackBlob).not.toBeNull();
    expect(fallback.ctx.drawImage).not.toHaveBeenCalled();
    expect(fallback.drawn.map((d) => d.text)).toContain('Bì');
  });
});
