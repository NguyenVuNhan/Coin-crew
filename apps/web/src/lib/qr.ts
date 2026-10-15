import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

const PNG_SIZE = 1024;

/** The VietQR picture for a payload as SVG text; '' while it is being made, and when there is no payload. */
export function useQrSvg(payload: string | null): string {
  const [svg, setSvg] = useState('');

  useEffect(() => {
    if (!payload) {
      setSvg('');
      return;
    }
    let active = true;
    QRCode.toString(payload, { type: 'svg', errorCorrectionLevel: 'M', margin: 2 })
      .then((res) => {
        if (active) setSvg(res);
      })
      .catch(() => {
        if (active) setSvg('');
      });
    return () => {
      active = false;
    };
  }, [payload]);

  return svg;
}

/** The SVG text as an `<img src>`; '' for no picture yet. */
export function qrSrc(svg: string): string {
  return svg ? 'data:image/svg+xml;utf8,' + encodeURIComponent(svg) : '';
}

/** The QR as a 1024px white-backed PNG, or null where the browser cannot draw it. */
export function qrPngBlob(svg: string): Promise<Blob | null> {
  if (!svg || typeof document === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = PNG_SIZE;
      canvas.height = PNG_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(null);
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, PNG_SIZE, PNG_SIZE);

      const img = new Image();
      img.onload = () => {
        try {
          ctx.drawImage(img, 0, 0, PNG_SIZE, PNG_SIZE);
          canvas.toBlob((blob) => resolve(blob), 'image/png');
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = qrSrc(svg);
    } catch {
      resolve(null);
    }
  });
}

function fileName(refCode: string): string {
  return `vietqr-${(refCode || 'qr').replace(/\s+/g, '-')}.png`;
}

function download(blob: Blob, refCode: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.download = fileName(refCode);
  a.href = url;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Downloads the QR as a PNG named after the transfer note. Does nothing where the picture cannot be made. */
export async function saveQr(svg: string, refCode: string): Promise<void> {
  const blob = await qrPngBlob(svg);
  if (blob) download(blob, refCode);
}

/**
 * Shares the QR picture with a message through the share sheet. Without file sharing it saves the picture and copies
 * the message instead ('saved'); 'failed' when neither worked. Closing the share sheet counts as 'shared'.
 */
export async function shareQr(svg: string, text: string, refCode: string): Promise<'shared' | 'saved' | 'failed'> {
  const blob = await qrPngBlob(svg);

  if (blob && typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof File !== 'undefined') {
    const files = [new File([blob], fileName(refCode), { type: 'image/png' })];
    if (navigator.canShare?.({ files })) {
      try {
        await navigator.share({ files, text });
        return 'shared';
      } catch (err) {
        // A DOMException from another frame or realm is not `instanceof Error`, so go by its name.
        if ((err as { name?: unknown } | null)?.name === 'AbortError') return 'shared';
      }
    }
  }

  let saved = false;
  if (blob) {
    try {
      download(blob, refCode);
      saved = true;
    } catch {
      // fall through to the message
    }
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      saved = true;
    } catch {
      // the clipboard is blocked
    }
  }
  return saved ? 'saved' : 'failed';
}
