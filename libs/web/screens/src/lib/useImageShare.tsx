import { useCallback, useState, type JSX } from 'react';
import { usePlatform, type ShareCard } from '@cc/web-platform';
import { copyText } from '@cc/web-util/clipboard';
import { useIsMousePointer } from '@cc/web-util/media';
import { shareImageFile } from '@cc/web-util/qr';
import { isZaloWebView } from '@cc/web-util/zaloEnv';
import { useImageSheet } from '../components/SaveImageSheet';

export type ImageShareStatus = 'saved' | 'copied' | 'failed' | null;

export interface ImageShareRequest {
  render: () => Promise<Blob | null>;
  text: string;
  fileName: string;
  /** What the Mini App shares into the chat. */
  card: ShareCard;
  /** On a PC, also open the picture sheet after copying the text (the link preview carries no QR). */
  pcPicture: boolean;
  /** Phone browser: share through this instead of `shareImageFile(await render())` (the sport bill keeps its own). */
  shareFile?: () => Promise<'shared' | 'saved' | 'failed'>;
}

/**
 * Share a picture with its message the way each place takes it: a PC copies the message (and shows the picture to
 * save or copy), the Mini App saves the picture and shares its card, Zalo's in-app browser shows the picture sheet,
 * and a phone browser hands the file and the message to the system share sheet.
 */
export function useImageShare(): {
  share(req: ImageShareRequest): Promise<void>;
  status: ImageShareStatus;
  sharing: boolean;
  sheet: JSX.Element;
  sheetOpen: boolean;
} {
  const platform = usePlatform();
  const mouse = useIsMousePointer();
  const { sheet, show, open: sheetOpen } = useImageSheet();
  const [status, setStatus] = useState<ImageShareStatus>(null);
  const [sharing, setSharing] = useState(false);

  const share = useCallback(
    async (req: ImageShareRequest) => {
      setStatus(null);

      // Copy first, while the click still counts as a user gesture.
      if (mouse && !isZaloWebView()) {
        const copied = await copyText(req.text);
        setStatus(copied ? 'copied' : 'failed');
        if (req.pcPicture) show(req.render, req.text, { pc: true, copied });
        return;
      }

      if (platform.kind === 'zmp') {
        setSharing(true);
        try {
          const blob = await req.render();
          const saved = blob ? (await platform.saveImage(blob, req.fileName)) === 'saved' : false;
          await platform.share(req.card);
          setStatus(saved ? 'saved' : 'failed');
        } catch {
          setStatus('failed');
        } finally {
          setSharing(false);
        }
        return;
      }

      if (isZaloWebView()) {
        show(req.render, req.text);
        return;
      }

      setSharing(true);
      try {
        const res = req.shareFile ? await req.shareFile() : await shareImageFile(await req.render(), req.fileName, req.text);
        if (res !== 'shared') setStatus(res);
      } catch {
        setStatus('failed');
      } finally {
        setSharing(false);
      }
    },
    [mouse, platform, show],
  );

  return { share, status, sharing: sharing && !sheetOpen, sheet, sheetOpen };
}
