// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import {
  renderSportPlanningPng,
  compressBookingImage,
  shareSportPlanning,
  type SportPlanningCardInput,
} from '../qr';

describe('renderSportPlanningPng', () => {
  it('renders Style A 3-column headcount table without THÀNH TIỀN or CHI PHÍ rows', async () => {
    const fillTextCalls: string[] = [];
    let canvasWidth = 0;
    const mockCtx = {
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
      arcTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn((text: string) => fillTextCalls.push(text)),
      drawImage: vi.fn(),
    };
    vi.spyOn(document, 'createElement').mockReturnValue({
      get width() {
        return canvasWidth;
      },
      set width(w: number) {
        canvasWidth = w;
      },
      height: 0,
      getContext: () => mockCtx,
      toBlob: (cb: (b: Blob | null) => void) => cb(new Blob(['png'], { type: 'image/png' })),
    } as unknown as HTMLCanvasElement);

    const input: SportPlanningCardInput = {
      description: 'Cầu lông sáng CN',
      spentOn: '08/11/2026',
      groupName: '5AM BADMINTON',
      location: { name: 'Sân Putin', address: '158 Phú Diễn', phone: '0345747800' },
      courtSlots: [{ courtName: 'Cầu Lông 6', timeRange: '05:00 - 07:00' }],
      bookingCode: '#4139',
      totalDuration: '3h30p',
      totalFemaleSlots: 1,
      totalMaleSlots: 1,
      rows: [
        { name: 'Thủy Nguyễn', femaleSlots: 1, maleSlots: 0 },
        { name: 'Quang', femaleSlots: 0, maleSlots: 1 },
      ],
    };

    const blob = await renderSportPlanningPng(input);
    expect(blob).not.toBeNull();
    expect(canvasWidth).toBe(1080);
    expect(fillTextCalls).toContain('TÊN');
    expect(fillTextCalls).toContain('NỮ');
    expect(fillTextCalls).toContain('NAM');
    expect(fillTextCalls).toContain('TỔNG SUẤT (2 suất)');
    expect(fillTextCalls).not.toContain('THÀNH TIỀN');
    expect(fillTextCalls).not.toContain('CHI PHÍ');
    expect(fillTextCalls).not.toContain('MỖI SUẤT');
    vi.restoreAllMocks();
  });

  it('renders Style B with 1488px canvas width and draws proof image on the right', async () => {
    const fillTextCalls: string[] = [];
    let canvasWidth = 0;
    let canvasHeight = 0;
    const mockCtx = {
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
      arcTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn((text: string) => fillTextCalls.push(text)),
      drawImage: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      clip: vi.fn(),
    };
    const mockCanvas = {
      get width() {
        return canvasWidth;
      },
      set width(w: number) {
        canvasWidth = w;
      },
      get height() {
        return canvasHeight;
      },
      set height(h: number) {
        canvasHeight = h;
      },
      getContext: () => mockCtx,
      toBlob: (cb: (b: Blob | null) => void) => cb(new Blob(['png'], { type: 'image/png' })),
    };
    vi.spyOn(document, 'createElement').mockReturnValue(mockCanvas as unknown as HTMLCanvasElement);

    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      width = 600;
      height = 800;
      set src(_s: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', MockImage);

    const input: SportPlanningCardInput = {
      description: 'Cầu lông sáng CN',
      spentOn: '08/11/2026',
      groupName: '5AM BADMINTON',
      location: { name: 'Sân Putin', address: '158 Phú Diễn' },
      totalFemaleSlots: 1,
      totalMaleSlots: 1,
      rows: [
        { name: 'Thủy', femaleSlots: 1, maleSlots: 0 },
        { name: 'Quang', femaleSlots: 0, maleSlots: 1 },
      ],
      includeProofImage: true,
      bookingImageDataUrl: 'data:image/png;base64,fakeimage',
    };

    const blob = await renderSportPlanningPng(input);
    expect(blob).not.toBeNull();
    expect(canvasWidth).toBe(1488);
    expect(mockCtx.drawImage).toHaveBeenCalled();
    expect(fillTextCalls).toContain('TÊN');
    expect(fillTextCalls).toContain('TỔNG SUẤT (2 suất)');

    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});

describe('compressBookingImage', () => {
  it('compresses an image to WebP when under 80k chars', async () => {
    const toDataUrlCalls: string[] = [];
    const mockCtx = {
      drawImage: vi.fn(),
    };
    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: () => mockCtx,
      toDataURL: vi.fn((type: string) => {
        toDataUrlCalls.push(type);
        return 'data:image/webp;base64,small';
      }),
    };
    vi.spyOn(document, 'createElement').mockReturnValue(mockCanvas as unknown as HTMLCanvasElement);
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();

    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      width = 1200;
      height = 800;
      set src(_s: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', MockImage);

    const blob = new Blob(['image data'], { type: 'image/png' });
    const result = await compressBookingImage(blob);

    expect(result).toBe('data:image/webp;base64,small');
    expect(mockCanvas.width).toBe(720);
    expect(mockCanvas.height).toBe(480);
    expect(toDataUrlCalls).toContain('image/webp');

    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('falls back to JPEG when WebP output exceeds 80k chars', async () => {
    const mockCtx = {
      drawImage: vi.fn(),
    };
    const largeWebp = 'data:image/webp;base64,' + 'a'.repeat(85_000);
    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: () => mockCtx,
      toDataURL: vi.fn((type: string) => {
        if (type === 'image/webp') return largeWebp;
        return 'data:image/jpeg;base64,smaller';
      }),
    };
    vi.spyOn(document, 'createElement').mockReturnValue(mockCanvas as unknown as HTMLCanvasElement);
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();

    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      width = 600;
      height = 600;
      set src(_s: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', MockImage);

    const blob = new Blob(['image data'], { type: 'image/png' });
    const result = await compressBookingImage(blob);

    expect(result).toBe('data:image/jpeg;base64,smaller');

    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});

describe('shareSportPlanning', () => {
  it('calls navigator.share with plan-{refCode}.png file when canShare is true', async () => {
    const mockCtx = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      arcTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      drawImage: vi.fn(),
    };
    vi.spyOn(document, 'createElement').mockReturnValue({
      width: 0,
      height: 0,
      getContext: () => mockCtx,
      toBlob: (cb: (b: Blob | null) => void) => cb(new Blob(['png'], { type: 'image/png' })),
    } as unknown as HTMLCanvasElement);

    const share = vi.fn(async () => {});
    vi.stubGlobal('navigator', {
      ...navigator,
      share,
      canShare: () => true,
    });

    const input: SportPlanningCardInput = {
      description: 'Cầu lông sáng CN',
      spentOn: '08/11/2026',
      groupName: '5AM BADMINTON',
      totalFemaleSlots: 1,
      totalMaleSlots: 1,
      rows: [{ name: 'An', femaleSlots: 0, maleSlots: 1 }],
    };

    const res = await shareSportPlanning(input, 'Zalo share message', 'SUN123');
    expect(res).toBe('shared');
    expect(share).toHaveBeenCalledTimes(1);
    const data = (share.mock.calls[0] as unknown as [ShareData])[0];
    expect(data.text).toBe('Zalo share message');
    expect(data.files?.[0]?.name).toBe('plan-SUN123.png');

    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});
