import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import QRCode from 'qrcode';
import { withLogo, useQrSvg } from '../qr';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('withLogo', () => {
  it("returns '' for ''", () => {
    expect(withLogo('')).toBe('');
  });

  it('returns an SVG without a viewBox unchanged', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1v1H0z"/></svg>';
    expect(withLogo(input)).toBe(input);
  });

  it('embeds the coincrew brand logo mark into a real QR SVG', async () => {
    const svg = await QRCode.toString(
      '00020101021238570010A00000072701270006970436011312345678900208QRIBFTTA53037045405500005802VN62130809TD-AB12C6304ABCD',
      { type: 'svg', errorCorrectionLevel: 'H', margin: 2 },
    );
    const out = withLogo(svg);

    const matches = out.match(/data-logo="coincrew"/g);
    expect(matches).toHaveLength(1);
    expect(out).toContain('₫');
    expect(out.trim().endsWith('</svg>')).toBe(true);
    expect(out.startsWith(svg.slice(0, svg.lastIndexOf('</svg>')))).toBe(true);
  });

  it('stays well-formed XML, as browsers parse an SVG image strictly', async () => {
    const svg = await QRCode.toString('payload-xml', { type: 'svg', errorCorrectionLevel: 'H', margin: 2 });
    const doc = new DOMParser().parseFromString(withLogo(svg), 'image/svg+xml');
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    expect(doc.querySelector('[data-logo="coincrew"]')).not.toBeNull();
  });

  it('ensures the plate is a centred square between 18% and 30% of the code', async () => {
    const svg = await QRCode.toString(
      '00020101021238570010A00000072701270006970436011312345678900208QRIBFTTA53037045405500005802VN62130809TD-AB12C6304ABCD',
      { type: 'svg', errorCorrectionLevel: 'H', margin: 2 },
    );
    const out = withLogo(svg);

    const viewBoxMatch = svg.match(/viewBox="0 0 (\d+) \d+"/);
    expect(viewBoxMatch).not.toBeNull();
    const N = Number(viewBoxMatch![1]);

    const plateMatch = out.match(/<rect[^>]*\bdata-logo-plate\b[^>]*>/);
    expect(plateMatch).not.toBeNull();
    const plate = plateMatch![0];

    const x = Number(plate.match(/\bx="([^"]+)"/)?.[1]);
    const y = Number(plate.match(/\by="([^"]+)"/)?.[1]);
    const width = Number(plate.match(/\bwidth="([^"]+)"/)?.[1]);
    const height = Number(plate.match(/\bheight="([^"]+)"/)?.[1]);

    expect(width).toBe(height);
    expect(Math.abs(x + width / 2 - N / 2)).toBeLessThan(0.01);
    expect(Math.abs(y + height / 2 - N / 2)).toBeLessThan(0.01);
    expect(width / N).toBeGreaterThanOrEqual(0.18);
    expect(width / N).toBeLessThanOrEqual(0.3);
  });
});

describe('useQrSvg with logo', () => {
  it('calls QRCode.toString with errorCorrectionLevel H and returns SVG with logo', async () => {
    const spy = vi.spyOn(QRCode, 'toString');
    const { result } = renderHook(() => useQrSvg('payload-1'));

    await waitFor(() => {
      expect(result.current).toContain('data-logo="coincrew"');
    });

    expect(spy).toHaveBeenCalledWith('payload-1', expect.objectContaining({ errorCorrectionLevel: 'H' }));
  });
});
